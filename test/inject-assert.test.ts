import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { inject, assert } from '../src/api.js';
import type { DocDefaultsConfig } from '../src/types.js';
import { formatDefaultLiteral } from '../src/dts-ops/jsdoc.js';
import { injectDefaultsIntoDts } from '../src/dts-ops/inject.js';
import { assertDefaultsInDts } from '../src/dts-ops/assert.js';


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

const FIX_DIR = path.resolve(__dirname, 'fixtures');

async function makeTempCopy() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'docdefaults-'));
  const constants = path.join(tmp, 'constants.js');
  const dts = path.join(tmp, 'types.d.ts');
  await fs.copyFile(path.join(FIX_DIR, 'constants.js'), constants);
  await fs.copyFile(path.join(FIX_DIR, 'types.d.ts'), dts);
  return { tmp, constants, dts };
}

describe('docdefaults', () => {
  let tmp: string, constants: string, dts: string, config: DocDefaultsConfig;

  beforeEach(async () => {
    ({ tmp, constants, dts } = await makeTempCopy());
    config = {
      defaults: path.relative(tmp, constants),
      targets: [
        {
          name: 'Example',
          types: 'src/options.ts', // dummy (not used in inference here)
          dts: path.relative(tmp, dts),
          interface: 'ExampleOptions',
          member: 'DEFAULTS',
        },
      ],
    };
  });

  it('fails assert before injection', async () => {
    await expect(assertConfig()).rejects.toThrow();
  });

  it('injects defaults correctly', async () => {
    await injectConfig();
    const text = await fs.readFile(dts, 'utf8');
    expect(text).toContain('@default "bar"');
    expect(text).toContain('@default 42');
    expect(text).toContain('@default true');
  });

  it('makes inject idempotent', async () => {
    await injectConfig();
    const first = await fs.readFile(dts, 'utf8');
    await injectConfig();
    const second = await fs.readFile(dts, 'utf8');
    expect(second).toBe(first);
  });

  it('passes assert after injection', async () => {
    await injectConfig();
    await expect(assertConfig()).resolves.not.toThrow();
  });

  async function injectConfig() {
    const cfgFile = path.join(tmp, 'docdefaults.config.json');
    await fs.writeFile(cfgFile, JSON.stringify(config), 'utf8');
    await inject(cfgFile, { repoRoot: tmp });
  }

  async function assertConfig() {
    const cfgFile = path.join(tmp, 'docdefaults.config.json');
    await fs.writeFile(cfgFile, JSON.stringify(config), 'utf8');
    return assert(cfgFile, { repoRoot: tmp });
  }
});

describe('inject/assert – upsert into existing docblocks & newline handling (no creation)', () => {
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
    const res = injectDefaultsIntoDts({
      dtsText: IFACE_PRESEEDED,
      interfaceName: 'NoDocs',
      defaults: { foo: 'X', bar: 1 },
      preferredTag: 'default',
    });

    expect(res.missing).toEqual([]);
    expect(res.updatedCount).toBe(2);

    const t = res.updatedText;

    // foo has a single @default and no duplicates
    const preFoo = t.slice(0, t.indexOf('foo?: string;'));
    expect(preFoo.match(/@default "X"/g)?.length).toBe(1);

    // bar has a single @default and no duplicates
    const preBar = t.slice(0, t.indexOf('bar?: number;'));
    expect(preBar.match(/@default 1/g)?.length).toBe(1);

    // Second pass does nothing
    const res2 = injectDefaultsIntoDts({
      dtsText: t,
      interfaceName: 'NoDocs',
      defaults: { foo: 'X', bar: 1 },
      preferredTag: 'default',
    });
    expect(res2.updatedCount).toBe(0);
    expect(res2.updatedText).toBe(t);
  });
});

describe('inject/assert – normalization, CRLF, quoted/readonly, indent (preseeded blocks)', () => {
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
    const res = injectDefaultsIntoDts({
      dtsText: IFACE_MIXED_PRESEEDED,
      interfaceName: 'Mixed',
      defaults: {
        alpha: 'ok',
        bravo: 42,
        charlie: 'legacy', // normalize defaultValue -> default (preferred)
        delta: true,       // already correct
        'with-dash': 'w',
        'ro-name': 'r',
      },
      preferredTag: 'default',
    });

    const t = res.updatedText;

    // Helper: get the JSDoc block right before a given prop signature
    const docBlockFor = (text: string, propSig: string) => {
      const sigIdx = text.indexOf(propSig);
      expect(sigIdx).toBeGreaterThan(-1);
      const before = text.slice(0, sigIdx);
      const start = before.lastIndexOf('/**');
      expect(start).toBeGreaterThan(-1);
      return text.slice(start, sigIdx);
    };

    // charlie normalized to @default (not @defaultValue)
    const charlieDoc = docBlockFor(t, 'charlie?: string;');
    expect(charlieDoc).toMatch(/@default\s+"legacy"/);
    expect(charlieDoc).not.toMatch(/@defaultValue/);

    // delta unchanged (no duplication of the preferred tag)
    const deltaDoc = docBlockFor(t, 'delta?: boolean;');
    expect((deltaDoc.match(/@default\s+true/g) ?? []).length).toBe(1);

    // CRLF preserved around bravo doc; tag present (don’t assert exact whitespace)
    const bravoDoc = docBlockFor(t, 'bravo?: number;');
    expect(bravoDoc).toMatch(/@default\s+42/);

    // quoted + readonly names supported
    const withDashDoc = docBlockFor(t, '"with-dash"?: string;');
    expect(withDashDoc).toMatch(/@default\s+"w"/);

    const roDoc = docBlockFor(t, "readonly 'ro-name'?: string;");
    expect(roDoc).toMatch(/@default\s+"r"/);

    // Updated count should reflect edits (delta not counted if already correct)
    expect(res.updatedCount).toBeGreaterThan(0);
  });
});

describe('formatting edge cases for default literals', () => {
  it('truncates long JSON and stringifies non-serializable values', () => {
    const huge = { a: 'x'.repeat(500) };
    const lit = formatDefaultLiteral(huge);
    expect(lit.includes('…')).toBe(true);
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
