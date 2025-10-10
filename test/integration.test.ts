import { describe, it, expect } from 'vitest';
import { injectDefaultsIntoDts, assertDefaultsInDts } from '../src/dts-ops/index.js';

const before = `
/**
 * Consent options for configuring consent manager behavior.
 * Testing doc style preservation and default injection with:
 * - No existing @default or @defaultValue tag
 * - Existing @default tag with incorrect value
 * - Existing @defaultValue tag with incorrect value
 * - Existing @default tag with correct value (should not change)
 * - No docblock at all
 * - Field with no default value (should not get a @default tag)
 */
export interface ConsentOptions {
    /**
     * Initial consent status.
     */
    initialStatus?: ConsentStatus;
    /**
     * If true we start as 'pending' and *require* an explicit call to grant.
     * If false we auto-grant on first track (implicit consent).
     * @default false
     */
    requireExplicit?: boolean;
    /**
     * Determine if we allow essential events when consent is denied
     * @defaultValue true
     */
    allowEssentialOnDenied?: boolean;
    /**
     * Custom storage key for consent state
     * @default '__trackkit_consent__'
     */
    storageKey?: string;
    disablePersistence?: boolean;
    /**
     * Current policy/version. If stored version < this => re-prompt (reset to pending).
     */
    policyVersion?: string;
}
`;


describe('ConsentOptions inject (bottom-up)', () => {
  it('replaces link placeholders with canonical @default blocks and keeps structure intact', () => {
    const defaults = {
      initialStatus: 'pending',
      requireExplicit: true,
      allowEssentialOnDenied: false,
      disablePersistence: false,
      storageKey: '__trackkit_consent__',
    };

    const result = injectDefaultsIntoDts({
      dtsText: before,
      interfaceName: 'ConsentOptions',
      defaults,
      preferredTag: 'default',
    });

    // No torn identifiers / stray blocks
    expect(result.updatedText).toMatch(/initialStatus\?\:\s*ConsentStatus;/);
    expect(result.updatedText).toMatch(/requireExplicit\?\:\s*boolean;/);
    expect(result.updatedText).toMatch(/allowEssentialOnDenied\?\:\s*boolean;/);
    expect(result.updatedText).toMatch(/disablePersistence\?\:\s*boolean;/);
    expect(result.updatedText).toMatch(/storageKey\?\:\s*string;/);

    // Canonical @default lines exist
    expect(result.updatedText).toMatch(/@default "pending"/);
    expect(result.updatedText).toMatch(/@default true/);
    expect(result.updatedText).toMatch(/@default false/);
    expect(result.updatedText).toMatch(/@default "__trackkit_consent__"/);

    // And assertion passes
    const a = assertDefaultsInDts({
      dtsText: result.updatedText,
      interfaceName: 'ConsentOptions',
      defaults,
    });
    expect(a.ok).toBe(true);
  });

  it('keeps the docblock indentation and star spacing', () => {
    const defaults = {
      initialStatus: 'pending',
      requireExplicit: true,
      allowEssentialOnDenied: false,
      disablePersistence: false,
      storageKey: '__trackkit_consent__',
    };
    const result = injectDefaultsIntoDts({
      dtsText: before,
      interfaceName: 'ConsentOptions',
      defaults,
      preferredTag: 'default',
    });
    // doc lines should begin with the same 4-space indent before the '*' lines
    // We also expect a space after '*' (the style in the original)
    result.updatedText.split(/\n/).slice(
      result.updatedText.indexOf('initialStatus') // quick segment check
    );
    expect(result.updatedText).toMatch(/\n {4}\/\*\*\n {4} \* /);        // opening + a starred line with ' * '
    expect(result.updatedText).toMatch(/@default "pending"/);
    expect(result.updatedText).toMatch(/\n {4} \* @default true\n/);     // another field block carries same style

    // find the indent of the requireExplicit property
    const indentRE = /\n([ \t]+)requireExplicit\?\s*:\s*boolean;/;
    const m = result.updatedText.match(indentRE);
    const ind = m ? m[1] : '';
    expect(ind).not.toBe('');

    expect(result.updatedText).toContain(`\n${ind}/**`);
    expect(result.updatedText).toContain(`\n${ind} * @default true`);
  });

  it('aligns doc indent to the property indent but preserves star spacing', () => {
    const weird = `
  export interface X {
          /**
           * Old doc (over-indented by 8).
           * @defaultValue {@link DEFAULTS.foo}
           */
      foo?: string;
  }
  `;
    const { updatedText } = injectDefaultsIntoDts({
      dtsText: weird,
      interfaceName: 'X',
      defaults: { foo: 'bar' },
      preferredTag: 'default',
    });

    // after you compute `updatedText`
    const propIndentMatch = updatedText.match(/\n([ \t]+)foo\?\:/);
    const propIndent = propIndentMatch ? propIndentMatch[1] : '';
    expect(propIndent).not.toBe(''); // guard sanity

    // opening line aligned with property indent
    expect(updatedText).toContain(`\n${propIndent}/**`);

    // star lines also aligned with property indent and have a space after '*'
    const starLine = `\n${propIndent} * @default "bar"`;
    expect(updatedText).toContain(starLine);
  });

  it('handles properties with quotes in names', () => {
    const dts = `interface X { 
      "foo-bar"?: string; 
      'baz-qux'?: number; 
    }`;
    const defaults = { 'foo-bar': 'test', 'baz-qux': 42 };
    const result = injectDefaultsIntoDts({
      dtsText: dts,
      interfaceName: 'X',
      defaults,
      preferredTag: 'default',
    });
    expect(result.updatedText).toContain('@default "test"');
    expect(result.updatedText).toContain('@default 42');
    expect(result.updatedCount).toBe(2);
  });

  it('handles readonly properties', () => {
    const dts = `interface X { readonly foo?: string; }`;
    const defaults = { foo: 'bar' };
    const result = injectDefaultsIntoDts({
      dtsText: dts,
      interfaceName: 'X',
      defaults,
      preferredTag: 'default',
    });
    expect(result.updatedText).toContain('@default "bar"');
  });

  it('escapes special characters in string defaults', () => {
    const defaults = { 
      nl: 'line1\nline2',
      tab: 'col1\tcol2',
      quote: '"quoted"',
    };
    const dts = `interface X {
      nl?: string;
      tab?: string;
      quote?: string;
    }`;
    const result = injectDefaultsIntoDts({
      dtsText: dts,
      interfaceName: 'X',
      defaults,
      preferredTag: 'default',
    });
    expect(result.updatedText).toContain('@default "line1\\nline2"');
    expect(result.updatedText).toContain('@default "col1\\tcol2"');
    expect(result.updatedText).toContain('@default "\\"quoted\\""');
  });
});
