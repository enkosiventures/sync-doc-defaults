// // // import { describe, it, expect } from 'vitest';
// // // import {
// // //   extractInterfaceBlock,
// // //   extractInterfaceFields,
// // //   injectDefaultForField,
// // //   readDefaultLiteralFromField,
// // // } from '../src/dts-ops.js';

// // // const interfaceName = `
// // // export interface Sample {
// // //   /**
// // //    * Name (doc exists but no default)
// // //    */
// // //   name?: string;

// // //   // no jsdoc
// // //   id: number;

// // //   /**
// // //    * Enabled
// // //    * @defaultValue false
// // //    */
// // //   readonly enabled?: boolean;

// // //   /**
// // //    * Lines\r\n * with CRLF
// // //    */
// // //   count?: number;
// // // }
// // // `;

// // // describe('dts-ops', () => {
// // //   it('extracts interface block and fields', () => {
// // //     const blk = extractInterfaceBlock(interfaceName, 'Sample');
// // //     expect(blk).toBeTruthy();
// // //     const fields = extractInterfaceFields(blk!.block);
// // //     expect(fields).toEqual(['name', 'id', 'enabled', 'count']);
// // //   });

// // //   it('inserts @defaultValue when there is no jsdoc', () => {
// // //     const blk = extractInterfaceBlock(interfaceName, 'Sample')!;
// // //     const { next } = injectDefaultForField(blk.block, 'id', '42');
// // //     const lit = readDefaultLiteralFromField(next, 'id');
// // //     expect(lit).toBe('42');
// // //   });

// // //   it('adds @defaultValue line when jsdoc exists without it', () => {
// // //     const blk = extractInterfaceBlock(interfaceName, 'Sample')!;
// // //     const { next } = injectDefaultForField(blk.block, 'name', JSON.stringify('Alice'));
// // //     const lit = readDefaultLiteralFromField(next, 'name');
// // //     expect(lit).toBe('"Alice"');
// // //   });

// // //   it('updates existing @defaultValue when present', () => {
// // //     const blk = extractInterfaceBlock(interfaceName, 'Sample')!;
// // //     const { next } = injectDefaultForField(blk.block, 'enabled', 'true');
// // //     const lit = readDefaultLiteralFromField(next, 'enabled');
// // //     expect(lit).toBe('true');
// // //   });

// // //   it('preserves CRLF bodies and still injects', () => {
// // //     const blk = extractInterfaceBlock(interfaceName, 'Sample')!;
// // //     const { next } = injectDefaultForField(blk.block, 'count', '7');
// // //     const lit = readDefaultLiteralFromField(next, 'count');
// // //     expect(lit).toBe('7');
// // //   });

// // //   it('does not touch other fields when injecting one', () => {
// // //     const blk = extractInterfaceBlock(interfaceName, 'Sample')!;
// // //     const { next } = injectDefaultForField(blk.block, 'id', '42');
// // //     expect(readDefaultLiteralFromField(next, 'name')).toBeUndefined();
// // //     expect(readDefaultLiteralFromField(next, 'enabled')).toBe('false'); // unchanged
// // //   });
// // // });







// // // import { describe, it, expect } from 'vitest';
// // // import { injectDefaultsIntoDts, assertDefaultsInDts } from '../src/dts/index.js';

// // // const header = `export interface Example {
// // //   /**
// // //    * Foo string.
// // //    */
// // //   foo?: string;

// // //   // count of things
// // //   count?: number;

// // //   enabled?: boolean;
// // // }
// // // `;

// // // describe('dts normalization & injection', () => {
// // //   it('creates canonical blocks when missing', () => {
// // //     const defaults = { foo: 'bar', count: 42, enabled: true };
// // //     const r = injectDefaultsIntoDts({
// // //       dtsText: header,
// // //       interfaceName: 'Example',
// // //       defaults,
// // //       preferredTag: 'default',
// // //     });
// // //     expect(r.updatedCount).toBe(3);
// // //     expect(r.updatedText).toMatch(/@default "bar"/);
// // //     expect(r.updatedText).toMatch(/@default 42/);
// // //     expect(r.updatedText).toMatch(/@default true/);

// // //     const a = assertDefaultsInDts({ dtsText: r.updatedText, interfaceName: 'Example', defaults });
// // //     expect(a.ok).toBe(true);
// // //   });

// // //   it('replaces existing @defaultValue with @default', () => {
// // //     const withValue = header.replace(
// // //       '* Foo string.',
// // //       `* Foo string.\n   * @defaultValue "zzz"`
// // //     );
// // //     const r = injectDefaultsIntoDts({
// // //       dtsText: withValue,
// // //       interfaceName: 'Example',
// // //       defaults: { foo: 'bar' },
// // //       preferredTag: 'default',
// // //     });
// // //     expect(r.updatedText).toMatch(/@default "bar"/);
// // //     expect(r.updatedText).not.toMatch(/@defaultValue/);
// // //   });

// // //   it('preserves description & other tags, puts @default first among tags', () => {
// // //     const mod = header.replace(
// // //       '* Foo string.',
// // //       `* Foo string.\n   * @remarks important\n   * @see something`
// // //     );
// // //     const r = injectDefaultsIntoDts({
// // //       dtsText: mod,
// // //       interfaceName: 'Example',
// // //       defaults: { foo: 'bar' },
// // //       preferredTag: 'default',
// // //     });
// // //     const block = r.updatedText.split('/**').find(b => b.includes('foo?:'));
// // //     expect(block).toMatch(/@default "bar"/);
// // //     // default appears before other tags
// // //     expect(block!.indexOf('@default')).toBeLessThan(block!.indexOf('@remarks'));
// // //   });

// // //   it('is idempotent', () => {
// // //     const defaults = { foo: 'bar' };
// // //     const pass1 = injectDefaultsIntoDts({
// // //       dtsText: header,
// // //       interfaceName: 'Example',
// // //       defaults,
// // //       preferredTag: 'default',
// // //     }).updatedText;
// // //     const pass2 = injectDefaultsIntoDts({
// // //       dtsText: pass1,
// // //       interfaceName: 'Example',
// // //       defaults,
// // //       preferredTag: 'default',
// // //     }).updatedText;
// // //     expect(pass2).toBe(pass1);
// // //   });

// // //   it('assert reports mismatch and resolves after inject', () => {
// // //     const defaults = { foo: 'bar' };
// // //     const a1 = assertDefaultsInDts({ dtsText: header, interfaceName: 'Example', defaults });
// // //     expect(a1.ok).toBe(false);
// // //     const injected = injectDefaultsIntoDts({
// // //       dtsText: header,
// // //       interfaceName: 'Example',
// // //       defaults,
// // //       preferredTag: 'default',
// // //     }).updatedText;
// // //     const a2 = assertDefaultsInDts({ dtsText: injected, interfaceName: 'Example', defaults });
// // //     expect(a2.ok).toBe(true);
// // //   });
// // // });

// // // test/dts-ops.test.ts
// // import { describe, it, expect } from 'vitest';
// // import {
// //   renderJsdocCanonical,
// //   formatDefaultLiteral,
// //   chooseDocIndent,
// //   extractLeadingJsdoc,
// //   listInterfaceProps,
// //   upsertDefaultForProp,
// // } from '../src/dts-ops';

// // describe('dts-ops (units)', () => {
// //   it('formatDefaultLiteral: renders strings quoted, booleans and numbers as-is', () => {
// //     expect(formatDefaultLiteral('foo')).toBe('"foo"');
// //     expect(formatDefaultLiteral(42)).toBe('42');
// //     expect(formatDefaultLiteral(true)).toBe('true');
// //   });

// //   it('renderJsdocCanonical: respects indent and star spacing', () => {
// //     const s = renderJsdocCanonical({
// //       indent: '    ',
// //       starPad: ' ',
// //       description: ['Hello', ''],
// //       tags: [],
// //       defaultLiteral: '1',
// //       preferredTag: 'default'
// //     });
// //     const s = renderJsdocCanonical('    ', ['Hello', '', '@default 1']);
// //     expect(s).toContain('\n    /**');
// //     expect(s).toContain('\n    * Hello');
// //     expect(s).toContain('\n    *');
// //     expect(s).toContain('\n    * @default 1');
// //   });

// //   it('chooseDocIndent: prefers property indent when doc indent is very different', () => {
// //     expect(chooseDocIndent('    ', '                ')).toBe('    ');
// //     expect(chooseDocIndent('    ', '     ')).toBe('    '); // close → prop indent wins
// //   });

// //   it('extractLeadingJsdoc: returns range including line padding', () => {
// //     const text = `
// //   /** one */
// //   /** two */
// //   foo?: string;
// // `;
// //     const head = text.indexOf('foo?:');
// //     const { range } = extractLeadingJsdoc(text, head);
// //     expect(range).toBeDefined();
// //     // range should start at the line beginning of "/** two */"
// //     const startLine = text.lastIndexOf('\n', text.indexOf('/** two */')) + 1;
// //     expect(range![0]).toBe(startLine);
// //   });

// //   it('listInterfaceProps: finds props and computes indent', () => {
// //     const text = `
// // export interface X {
// //       foo?: string;
// //   readonly bar?: number;
// // }`;
// //     const props = listInterfaceProps(text, 'X');
// //     expect(props.map(p => p.name)).toEqual(['foo', 'bar']);
// //     expect(props[0].indent).toBe('      ');
// //     expect(props[1].indent).toBe('  ');
// //   });

// //   it('upsertDefaultForProp: inserts canonical @default into existing block', () => {
// //     const before = `
// // export interface X {
// //   /**
// //    * Something
// //    */
// //   foo?: string;
// // }
// // `;
// //     const r = upsertDefaultForProp(before, 'X', 'foo', 'bar');
// //     expect(r.updated).toBe(true);
// //     expect(r.text).toContain('@default "bar"');
// //     // opening indent equals prop indent
// //     expect(r.text).toContain('\n  /**');
// //     expect(r.text).toContain('\n  * @default "bar"');
// //   });
// // });


// // test/dts-ops.test.ts
// import { describe, it, expect } from 'vitest';
// import { listInterfaceProps, renderJsdocCanonical, upsertDefaultForProp } from '../src/dts-ops';

// // Adjust these import paths to your actual file layout if they differ:
// // import { renderJsdocCanonical } from '../src/dts-ops/render';
// // import { listInterfaceProps } from '../src/dts-ops/find';
// // import { upsertDefaultForProp } from '../src/dts-ops/inject';

// describe('dts-ops (render/find/inject)', () => {
//   describe('renderJsdocCanonical', () => {
//     it('respects indent and star spacing (" * ") and emits canonical @default', () => {
//       const block = renderJsdocCanonical({
//         indent: '    ',                // 4 spaces
//         starPad: ' ',                  // keep " * " spacing
//         description: ['Hello', ''],    // blank line between desc and tags
//         tags: [],                      // no extra tags retained
//         defaultLiteral: '1',
//         preferredTag: 'default',
//       });

//       expect(block).toContain('\n    /**');
//       expect(block).toContain('\n    * Hello');
//       expect(block).toContain('\n    *');              // blank star line after description
//       expect(block).toContain('\n    * @default 1');
//       expect(block.endsWith('\n    */')).toBe(true);
//     });

//     it('can render compact star spacing (" *" without trailing space)', () => {
//       const block = renderJsdocCanonical({
//         indent: '  ',
//         starPad: '',                   // compact
//         description: ['Line A'],
//         tags: [{ tag: 'see', text: 'Something' }],
//         defaultLiteral: '"x"',
//         preferredTag: 'default',
//       });

//       // No space after '*' (compact)
//       expect(block).toContain('\n  *Line A');
//       expect(block).toContain('\n  *@default "x"');
//       expect(block).toContain('\n  *@see Something');
//     });
//   });

//   describe('listInterfaceProps', () => {
//     it('finds props with proper headStart and indent (identifiers, quoted, readonly)', () => {
//       const text = `
// export interface X {
//   foo?: string;
//   "quoted-key"?: number;
//   readonly bar: boolean;
// }
// `.trim();

//       const props = listInterfaceProps(text, 'X');
//       const names = props.map(p => p.name);
//       expect(names).toEqual(['foo', 'quoted-key', 'bar']);

//       const foo = props.find(p => p.name === 'foo')!;
//       const fooLineStart = text.lastIndexOf('\n', text.indexOf('foo?:')) + 1;
//       expect(foo.headStart).toBe(fooLineStart + 2); // 2 spaces
//       expect(foo.indent).toBe('  ');
//     });
//   });

//   describe('upsertDefaultForProp', () => {
//     it('inserts canonical @default into an existing docblock, preserving star spacing', () => {
//       const before = `
// export interface X {
//   /**
//    * Something
//    */
//   foo?: string;
// }
// `.trim();

//       // Find prop insertion point the way the injector does
//       const props = listInterfaceProps(before, 'X');
//       const foo = props.find(p => p.name === 'foo')!;
//       const after = upsertDefaultForProp(
//         before,
//         foo.headStart,
//         foo.indent,
//         '"bar"',          // literal (already quoted)
//         'default'         // preferredTag
//       );

//       // Canonical tag & literal
//       expect(after).toContain('@default "bar"');

//       // Opening indent equals property indent
//       expect(after).toContain('\n  /**');

//       // Star line preserves space after '*'
//       expect(after).toContain('\n  * @default "bar"');

//       // Keeps the existing description line
//       expect(after).toContain('Something');
//     });

//     it('adds a fresh docblock when none exists above the property', () => {
//       const before = `
// export interface X {
//   foo?: string;
// }
// `.trim();

//       const props = listInterfaceProps(before, 'X');
//       const foo = props.find(p => p.name === 'foo')!;
//       const after = upsertDefaultForProp(
//         before,
//         foo.headStart,
//         foo.indent,
//         '123',
//         'default'
//       );

//       // Newly inserted block aligned to prop indent
//       expect(after).toContain('\n  /**');
//       // No description, only @default line
//       expect(after).toContain('\n  * @default 123');
//       expect(after).toContain('\n  */\n\n  foo?: string;');
//     });

//     it('replaces an existing @defaultValue/@default link with static @default literal and keeps other tags', () => {
//       const before = `
// export interface X {
//   /**
//    * Desc
//    * @defaultValue {@link DEFAULTS.foo}
//    * @see Other
//    */
//   foo?: string;
// }
// `.trim();

//       const props = listInterfaceProps(before, 'X');
//       const foo = props.find(p => p.name === 'foo')!;
//       const after = upsertDefaultForProp(
//         before,
//         foo.headStart,
//         foo.indent,
//         '"baz"',
//         'default'
//       );

//       // Replaced by canonical static literal
//       expect(after).toContain('\n  * @default "baz"');

//       // Keeps other tags
//       expect(after).toContain('\n  * @see Other');

//       // Keeps description
//       expect(after).toContain('Desc');
//     });

//     it('preserves compact star spacing if that was the original style', () => {
//       const before = `
// export interface X {
//   /**
//    *NoSpace
//    *@defaultValue {@link DEFAULTS.foo}
//    */
//   foo?: string;
// }
// `.trim();

//       const props = listInterfaceProps(before, 'X');
//       const foo = props.find(p => p.name === 'foo')!;
//       const after = upsertDefaultForProp(
//         before,
//         foo.headStart,
//         foo.indent,
//         '"baz"',
//         'default'
//       );

//       // Compact style: no space after '*'
//       expect(after).toContain('\n  *NoSpace');
//       expect(after).toContain('\n  *@default "baz"');
//     });
//   });
// });
