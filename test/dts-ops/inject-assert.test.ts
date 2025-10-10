import { describe, it, expect } from 'vitest';
import { formatDefaultLiteral } from '../../src/dts-ops/jsdoc.js';
import { injectDefaultsIntoDts } from '../../src/dts-ops/inject.js';
import { assertDefaultsInDts } from '../../src/dts-ops/assert.js';


const IFACE_SIBLINGS = `
export interface Target {
  /** hello */
  a?: string;
}

export interface Bystander {
  /** not me */
  a?: string;
}
`;

describe('inject/assert - upsert into existing docblocks & newline handling (no creation)', () => {
  const IFACE_PRESEEDED = `
export interface NoDocs {
  /**
   * (preseeded)
   */
  foo?: string;

  /**
   * (preseeded)
   */
  bar?: number;
}
`;

  it('adds @default into preseeded blocks; keeps single blank line; idempotent', () => {
    const result = injectDefaultsIntoDts({
      dtsText: IFACE_PRESEEDED,
      interfaceName: 'NoDocs',
      defaults: { foo: 'X', bar: 1 },
      preferredTag: 'default',
    });

    expect(result.missing).toEqual([]);
    expect(result.updatedCount).toBe(2);

    const text = result.updatedText;

    // foo has a single @default and no duplicates
    const preFoo = text.slice(0, text.indexOf('foo?: string;'));
    expect(preFoo.match(/@default "X"/g)?.length).toBe(1);

    // bar has a single @default and no duplicates
    const preBar = text.slice(0, text.indexOf('bar?: number;'));
    expect(preBar.match(/@default 1/g)?.length).toBe(1);

    // Second pass does nothing
    const result2 = injectDefaultsIntoDts({
      dtsText: text,
      interfaceName: 'NoDocs',
      defaults: { foo: 'X', bar: 1 },
      preferredTag: 'default',
    });
    expect(result2.updatedCount).toBe(0);
    expect(result2.updatedText).toBe(text);
  });
});

describe('inject/assert - normalization, CRLF, quoted/readonly, indent (preseeded blocks), no-block insertion', () => {
  const IFACE_MIXED_PRESEEDED = `
export interface Mixed {
  /**
   * off-by-one indent will be preserved
   */
   alpha?: string;

  /**
   * CRLF here\r\n * keep endings
   */
  bravo?: number;

  /** @defaultValue "legacy" */
  charlie?: string;

  /**
   * already correct
   * @default true
   */
  delta?: boolean;

  echo?: string;

  /**
   * preseeded for quoted
   */
  "with-dash"?: string;

  /**
   * preseeded for readonly
   */
  readonly 'ro-name'?: string;
}
`;

  it('normalizes preferred tag, preserves off-by-one indent, handles CRLF and quoted/readonly', () => {
    const result = injectDefaultsIntoDts({
      dtsText: IFACE_MIXED_PRESEEDED,
      interfaceName: 'Mixed',
      defaults: {
        alpha: 'ok',
        bravo: 42,
        charlie: 'legacy', // normalize defaultValue -> default (preferred)
        delta: true,       // already correct
        echo: 'new',       // no preseeded doc, so create
        'with-dash': 'w',
        'ro-name': 'r',
      },
      preferredTag: 'default',
    });

    // Helper: get the JSDoc block right before a given prop signature
    const docBlockFor = (text: string, propSig: string) => {
      const sigIdx = text.indexOf(propSig);
      expect(sigIdx).toBeGreaterThan(-1);
      const before = text.slice(0, sigIdx);
      const start = before.lastIndexOf('/**');
      expect(start).toBeGreaterThan(-1);
      return text.slice(start, sigIdx);
    };

    const text = result.updatedText;

    // charlie normalized to @default (not @defaultValue)
    const charlieDoc = docBlockFor(text, 'charlie?: string;');
    expect(charlieDoc).toMatch(/@default\s+"legacy"/);
    expect(charlieDoc).not.toMatch(/@defaultValue/);

    // delta unchanged (no duplication of the preferred tag)
    const deltaDoc = docBlockFor(text, 'delta?: boolean;');
    expect((deltaDoc.match(/@default\s+true/g) ?? []).length).toBe(1);

    // CRLF preserved around bravo doc; tag present (don't assert exact whitespace)
    const bravoDoc = docBlockFor(text, 'bravo?: number;');
    expect(bravoDoc).toMatch(/@default\s+42/);

    // no-block echo got a new block with correct indent (4 spaces)
    const echoDoc = docBlockFor(text, 'echo?: string;');
    expect(echoDoc).toMatch(/@default "new"/);

    // quoted + readonly names supported
    const withDashDoc = docBlockFor(text, '"with-dash"?: string;');
    expect(withDashDoc).toMatch(/@default\s+"w"/);

    const roDoc = docBlockFor(text, "readonly 'ro-name'?: string;");
    expect(roDoc).toMatch(/@default\s+"r"/);

    // Updated count should reflect edits (delta not counted if already correct)
    expect(result.updatedCount).toBeGreaterThan(0);
  });
});

describe('formatting edge cases for default literals', () => {
  it('truncates long JSON and stringifies non-serializable values', () => {
    const huge = { a: 'x'.repeat(500) };
    const lit = formatDefaultLiteral(huge);
    expect(lit.includes('...')).toBe(true);
    expect(lit.length).toBeLessThanOrEqual(130);

    // Non-serializable
    function f() {}
    const sym = Symbol('s');
    expect(formatDefaultLiteral(f)).toBe(String(f));
    expect(formatDefaultLiteral(sym)).toBe(String(sym));
  });
});

describe('missing props and selective updates (preseeded blocks)', () => {
  const SEEDED = `
export interface Already {
  /**
   * @default 5
   */
  n?: number;

  /**
   * preseeded
   */
  x?: number;
}
`.trim();

  it('reports only unknown keys as missing; updatedCount excludes already-correct tags', () => {
    const first = injectDefaultsIntoDts({
      dtsText: SEEDED,
      interfaceName: 'Already',
      defaults: { n: 5, x: 1, nope: 99 },
      preferredTag: 'default',
    });

    // Only the unknown key is reported
    expect(first.missing).toEqual([{ interfaceName: 'Already', prop: 'nope' }]);

    // n already correct; x added -> updatedCount is 1
    expect(first.updatedCount).toBe(1);

    const assertion = assertDefaultsInDts({
      dtsText: first.updatedText,
      interfaceName: 'Already',
      defaults: { n: 5, x: 1 },
    });
    expect(assertion.ok).toBe(true);
    expect(assertion.mismatches).toEqual([]);
  });
});


describe('multi-interface files', () => {
  it('only touches the named interface and ignores siblings', () => {
    const out = injectDefaultsIntoDts({
      dtsText: IFACE_SIBLINGS,
      interfaceName: 'Target',
      defaults: { a: 'A' },
      preferredTag: 'default',
    });

    expect(out.updatedCount).toBe(1);

    // Ensure Bystander was not changed
    const bystander = out.updatedText.slice(out.updatedText.indexOf('interface Bystander'));
    expect(bystander).not.toMatch(/@default/);

    const assertion = assertDefaultsInDts({
      dtsText: out.updatedText,
      interfaceName: 'Target',
      defaults: { a: 'A' },
    });
    expect(assertion.ok).toBe(true);
  });
});

describe('tag normalization when both tags present', () => {
  it('removes non-preferred tag when both @default and @defaultValue exist', () => {
    const dts = `interface X {
      /**
       * Has both tags
       * @default "wrong"
       * @defaultValue "also-wrong"
       */
      foo?: string;
    }`;
    
    const result = injectDefaultsIntoDts({
      dtsText: dts,
      interfaceName: 'X',
      defaults: { foo: 'correct' },
      preferredTag: 'default',
    });
    
    // Should have exactly one @default with correct value
    const matches = result.updatedText.match(/@default "correct"/g);
    expect(matches).toHaveLength(1);
    
    // Should not have @defaultValue anymore
    expect(result.updatedText).not.toContain('@defaultValue');
  });
});

describe('special characters in string defaults', () => {
  it('properly escapes newlines, tabs, quotes in string values', () => {
    const dts = `interface X { 
      nl?: string; 
      tab?: string; 
      quote?: string;
      backslash?: string;
    }`;
    
    const defaults = { 
      nl: 'line1\nline2',
      tab: 'col1\tcol2',
      quote: '"quoted"',
      backslash: 'path\\to\\file',
    };
    
    const result = injectDefaultsIntoDts({
      dtsText: dts,
      interfaceName: 'X',
      defaults,
      preferredTag: 'default',
    });
    
    expect(result.updatedText).toContain('@default "line1\\nline2"');
    expect(result.updatedText).toContain('@default "col1\\tcol2"');
    expect(result.updatedText).toContain('@default "\\"quoted\\""');
    expect(result.updatedText).toContain('@default "path\\\\to\\\\file"');
    
    // Verify assert can read them back correctly
    const assertion = assertDefaultsInDts({
      dtsText: result.updatedText,
      interfaceName: 'X',
      defaults,
    });
    expect(assertion.ok).toBe(true);
  });
});

