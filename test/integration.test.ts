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
 * - No docblock at all (TODO: not currently working)
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
    /**
     * If true, disables automatic persistence of consent state to localStorage.
     */
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

    const r = injectDefaultsIntoDts({
      dtsText: before,
      interfaceName: 'ConsentOptions',
      defaults,
      preferredTag: 'default',
    });

    // No torn identifiers / stray blocks
    expect(r.updatedText).toMatch(/initialStatus\?\:\s*ConsentStatus;/);
    expect(r.updatedText).toMatch(/requireExplicit\?\:\s*boolean;/);
    expect(r.updatedText).toMatch(/allowEssentialOnDenied\?\:\s*boolean;/);
    expect(r.updatedText).toMatch(/disablePersistence\?\:\s*boolean;/);
    expect(r.updatedText).toMatch(/storageKey\?\:\s*string;/);

    // Canonical @default lines exist
    expect(r.updatedText).toMatch(/@default "pending"/);
    expect(r.updatedText).toMatch(/@default true/);
    expect(r.updatedText).toMatch(/@default false/);
    expect(r.updatedText).toMatch(/@default "__trackkit_consent__"/);

    // And assertion passes
    const a = assertDefaultsInDts({
      dtsText: r.updatedText,
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
    const r = injectDefaultsIntoDts({
      dtsText: before,
      interfaceName: 'ConsentOptions',
      defaults,
      preferredTag: 'default',
    });
    // doc lines should begin with the same 4-space indent before the '*' lines
    // We also expect a space after '*' (the style in the original)
    const block = r.updatedText.split(/\n/).slice(
      r.updatedText.indexOf('initialStatus') // quick segment check
    );
    expect(r.updatedText).toMatch(/\n {4}\/\*\*\n {4} \* /);        // opening + a starred line with ' * '
    expect(r.updatedText).toMatch(/@default "pending"/);
    // expect(r.updatedText).toMatch(/\n {4} \* @default true\n/);     // another field block carries same style

    // find the indent of the requireExplicit property
    const indentRE = /\n([ \t]+)requireExplicit\?\s*:\s*boolean;/;
    const m = r.updatedText.match(indentRE);
    const ind = m ? m[1] : '';
    expect(ind).not.toBe('');

    expect(r.updatedText).toContain(`\n${ind}/**`);
    expect(r.updatedText).toContain(`\n${ind} * @default true`);
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


    // The opening line should be indented to the property (4 spaces), not 8
    // expect(updatedText).toMatch(/\n {4}\/\*\*\n {4} \* @default "bar"/);
  });
});
