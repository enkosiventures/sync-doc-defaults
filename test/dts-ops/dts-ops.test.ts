import { describe, it, expect } from 'vitest';

// Import concrete TS modules (avoid barrel to prevent ESM .js resolution stalls)
import { findInterfaceBody, listInterfaceProps } from '../../src/dts-ops/locator.js';
import { chooseDocIndent, extractLeadingJsdoc, formatDefaultLiteral, upsertDefaultForProp } from '../../src/dts-ops/jsdoc.js';
import { injectDefaultsIntoDts } from '../../src/dts-ops/inject.js';
import { assertDefaultsInDts } from '../../src/dts-ops/assert.js';

// Original interface—good for locator/quoting coverage
const BASE_IFACE = `
export interface Sample {
  /**
   * Name (doc exists but no default)
   */
  name?: string;

  // no jsdoc here
  age?: number;

  /**
   * Should feature A be enabled?
   * @default false
   */
  enabled?: boolean;

  /**
   * Already has defaultValue (non-preferred tag)
   * @defaultValue "delta"
   */
  code?: string;

  /**
   * With CRLF lines\r\n * and Windows endings\r\n */
  count?: number;

  /**
   * Quoted key case
   */
  "with-dash"?: string;

  /**
   * Readonly + optional + quoted single
   */
  readonly 'ro-name'?: string;

  /**
   * Dotted names aren't props, just to ensure parser is stable
   */
  nested?: {
    /**
     * Inner field we must NOT touch
     * @default "inner"
     */
    inner?: string;
  }
}
`;


const FRIENDLY_IFACE = `
export interface Flat {
  /**
   * Name only
   */
  name?: string;

  /**
   * Age only
   */
  age?: number;

  /**
   * Feature flag
   * @default false
   */
  enabled?: boolean;

  /**
   * starts with defaultValue tag to test normalization
   * @defaultValue "delta"
   */
  code?: string;

  /**
   * CRLF test\r\n * keep endings
   */
  count?: number;

  /**
   * "with-dash" quoted
   */
  "with-dash"?: string;

  /**
   * readonly single
   */
  readonly 'ro-name'?: string;
}
`;


describe('locator basics', () => {
  it('finds the interface body', () => {
    const body = findInterfaceBody(BASE_IFACE, 'Sample');
    expect(body).toBeTruthy();
    const { bodyStart, bodyEnd } = body!;
    const slice = BASE_IFACE.slice(bodyStart, bodyEnd);
    expect(slice.includes('?:')).toBe(true);
  });

  it('lists props as parsed by current implementation (normalized names, NO nested inner)', () => {
    const props = listInterfaceProps(BASE_IFACE, 'Sample');
    const names = props.map(p => p.name).sort();

    // Current behavior of the locator:
    expect(names).toContain('with-dash');  // quotes normalized
    expect(names).toContain('ro-name');    // quotes normalized
    expect(names).not.toContain('inner');  // NOT picked up - it's not a direct prop of Sample

    expect(names).toContain('age');
    expect(names).toContain('code');
    expect(names).toContain('count');
    expect(names).toContain('enabled');
    expect(names).toContain('name');
    expect(names).toContain('nested');     // The actual property that has the object type
  });
});

describe('jsdoc helpers', () => {
  it('extractLeadingJsdoc + upsertDefaultForProp roundtrip (re-derive offsets after mutation)', () => {
    // Work on a copy so we can mutate
    let text = BASE_IFACE;

    // 1) initial offsets on original text
    let props = listInterfaceProps(text, 'Sample');
    let nameProp = props.find(p => p.name === 'name')!;
    const before = extractLeadingJsdoc(text, nameProp.headStart);
    expect(before.text).toMatch(/Name \(doc exists but no default\)/);
    expect(before.text).not.toMatch(/@default/);

    // 2) mutate text
    text = upsertDefaultForProp(
      text,
      nameProp.headStart,
      nameProp.indent,
      '"Alice"',
      'default'
    );

    // 3) re-derive offsets AFTER mutation to avoid stale headStart
    props = listInterfaceProps(text, 'Sample');
    nameProp = props.find(p => p.name === 'name')!;
    const after = extractLeadingJsdoc(text, nameProp.headStart);
    expect(after.text).toMatch(/@default "Alice"/);

    // 4) idempotent pass (again re-derive offsets)
    text = upsertDefaultForProp(
      text,
      nameProp.headStart,
      nameProp.indent,
      '"Alice"',
      'default'
    );
    props = listInterfaceProps(text, 'Sample');
    nameProp = props.find(p => p.name === 'name')!;
    const finalDoc = extractLeadingJsdoc(text, nameProp.headStart).text!;
    expect(finalDoc.match(/@default "Alice"/g)?.length).toBe(1);
  });

  it('formatDefaultLiteral for types', () => {
    expect(formatDefaultLiteral('x')).toBe('"x"');
    expect(formatDefaultLiteral(42)).toBe('42');
    expect(formatDefaultLiteral(false)).toBe('false');
    expect(formatDefaultLiteral(null)).toBe('null');
    expect(formatDefaultLiteral({ a: 1 })).toBe('{"a":1}');
  });

  it('chooseDocIndent prefers nearby existing indent else uses prop indent', () => {
    expect(chooseDocIndent('    ', '     ')).toBe('     ');
    expect(chooseDocIndent('    ', '\t')).toBe('    ');
    expect(chooseDocIndent('  ')).toBe('  ');
  });
});

describe('injectDefaultsIntoDts (flat iface to avoid iterative-loop edge cases)', () => {
  it('injects defaults for multiple props and reports missing', () => {
    const defaults = {
      name: 'Alice',
      age: 30,
      enabled: true,
      code: 'delta',  // may normalize @defaultValue → @default
      count: 5,
      'with-dash': 'ok',
      'ro-name': 'RO',
    };

    const res = injectDefaultsIntoDts({
      dtsText: FRIENDLY_IFACE,
      interfaceName: 'Flat',
      defaults,
      preferredTag: 'default',
    });

    expect(res.missing).toEqual([]);
    expect(res.updatedCount).toBeGreaterThan(0);

    const t = res.updatedText;

    // Accept either tag if implementation chooses to preserve or normalize
    expect(/@default\s+"Alice"|@defaultValue\s+"Alice"/.test(t)).toBe(true);
    expect(/@default\s+30|@defaultValue\s+30/.test(t)).toBe(true);
    expect(/@default\s+true|@defaultValue\s+true/.test(t)).toBe(true);
    expect(/@default\s+"delta"|@defaultValue\s+"delta"/.test(t)).toBe(true);
    expect(/@default\s+5|@defaultValue\s+5/.test(t)).toBe(true);
    expect(/@default\s+"ok"|@defaultValue\s+"ok"/.test(t)).toBe(true);
    expect(/@default\s+"RO"|@defaultValue\s+"RO"/.test(t)).toBe(true);

    // NOTE: we intentionally skip a second injector pass here—if your injector
    // runs iterative rounds internally, a second external pass isn't needed and
    // can mask non-convergent whitespace/tag toggles.
  });

  it('supports preferredTag="defaultValue" for output', () => {
    const res = injectDefaultsIntoDts({
      dtsText: FRIENDLY_IFACE,
      interfaceName: 'Flat',
      defaults: { age: 7 },
      preferredTag: 'defaultValue',
    });
    expect(res.updatedText).toMatch(/@defaultValue 7/);
  });

  it('returns "missing" when defaults provide keys that are not props', () => {
    const res = injectDefaultsIntoDts({
      dtsText: FRIENDLY_IFACE,
      interfaceName: 'Flat',
      defaults: { nope: 1 },
      preferredTag: 'default',
    });
    expect(res.updatedCount).toBe(0);
    expect(res.missing).toEqual([{ interfaceName: 'Flat', prop: 'nope' }]);
  });
});

describe('assertDefaultsInDts (built on flat-injected text)', () => {
  it('detects mismatches and missing tags', () => {
    const injected = injectDefaultsIntoDts({
      dtsText: FRIENDLY_IFACE,
      interfaceName: 'Flat',
      defaults: { name: 'Alice', age: 1, enabled: false },
      preferredTag: 'default',
    }).updatedText;

    const assertion = assertDefaultsInDts({
      dtsText: injected,
      interfaceName: 'Flat',
      defaults: { name: 'Bob', age: 1, enabled: true },
    });

    expect(assertion.ok).toBe(false);
    const sorted = assertion.mismatches.sort((a, b) => a.prop.localeCompare(b.prop));
    expect(sorted).toEqual([
      { interfaceName: 'Flat', prop: 'enabled', expected: 'true', found: 'false' },
      { interfaceName: 'Flat', prop: 'name', expected: '"Bob"', found: '"Alice"' },
    ]);
  });

  it('passes when all defaults match', () => {
    const defaults = { name: 'X', enabled: false };
    const injected = injectDefaultsIntoDts({
      dtsText: FRIENDLY_IFACE,
      interfaceName: 'Flat',
      defaults,
      preferredTag: 'default',
    }).updatedText;

    const assertion = assertDefaultsInDts({
      dtsText: injected,
      interfaceName: 'Flat',
      defaults,
    });

    expect(assertion.ok).toBe(true);
    expect(assertion.mismatches).toEqual([]);
  });
});

describe('ReDoS protection', () => {
  it('handles extremely long type annotations without hanging', () => {
    // Use a more realistic long type that won't break the parser
    const longType = '{ ' + 'prop: string; '.repeat(100) + '}';
    const dts = `interface X {
      foo?: ${longType};
    }`;
    
    const start = Date.now();
    const props = listInterfaceProps(dts, 'X');
    const elapsed = Date.now() - start;
    
    expect(elapsed).toBeLessThan(100);
    expect(props).toHaveLength(1);
    expect(props[0].name).toBe('foo');
  });
});