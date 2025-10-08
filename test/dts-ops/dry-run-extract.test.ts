import { describe, it, expect } from 'vitest';
import { extractDeclarationBlock } from '../../src/dts-ops/dry-run-extract.js';

const DTS = `
// Some banner
/** Top-level docs, not attached to anything specifically. */

export interface Foo {
  a: string;
}
interface Internal {
  /** inline docs inside body shouldn't matter */
  v: number;
}
export declare interface WithGeneric<T extends { id: string }> {
  /** Doc inside interface body */
  id: T;
}
export interface TrailingSemi {
  x: number;
};  // semicolon after interface body is valid in .d.ts
export type Alias = string | number;
export type Complex = {
  a: () => void;
  nested: {
    x: 1;
    y: 2; // inner semicolons must not terminate the alias
  };
} & Array<Record<string, Map<Set<number>, Promise<string[]>>>>;
/**
 * With JSDoc separated by whitespace
 */

export type Weird<T> = T extends infer U ? U[] : never;
`;

describe('extractDeclarationBlock', () => {
  it('includes the JSDoc immediately above an interface', () => {
    const block = extractDeclarationBlock(DTS, 'Foo');
    expect(block).toBeTruthy();
    // Should include leading "/**" and the head
    expect(block!).toMatch(/\/\*\*/);
    expect(block!).toMatch(/export interface Foo/);
    // Should end at the closing brace (no trailing semicolon for Foo)
    expect(block!.trim().endsWith('}')).toBe(true);
  });

  it('finds "export declare interface" with generics and balances braces', () => {
    const block = extractDeclarationBlock(DTS, 'WithGeneric');
    expect(block).toBeTruthy();
    expect(block!).toContain('export declare interface WithGeneric<');
    // The body should be closed properly
    expect(block!.trim().endsWith('}')).toBe(true);
    // It should include inner JSDoc lines if present above the decl (there aren’t any here; the inner one is *inside* the body)
    expect(block!).not.toMatch(/Doc inside interface body.*@default/s);
  });

  it('includes trailing semicolon for interfaces if present', () => {
    const block = extractDeclarationBlock(DTS, 'TrailingSemi');
    expect(block).toBeTruthy();
    // Should include semicolon after the closing brace
    expect(block!.trim().endsWith('};')).toBe(true);
  });

  it('captures a simple type alias up to the correct semicolon', () => {
    const block = extractDeclarationBlock(DTS, 'Alias');
    expect(block).toBeTruthy();
    expect(block!).toContain('export type Alias = string | number;');
    // Starts at the type head (no JSDoc in this case)
    expect(block!.trim().startsWith('export type Alias')).toBe(true);
    expect(block!.trim().endsWith(';')).toBe(true);
  });

  it('captures a complex type alias with nested braces/angles and ignores inner semicolons', () => {
    const block = extractDeclarationBlock(DTS, 'Complex');
    expect(block).toBeTruthy();
    // Should not stop at inner semicolons in object members
    expect(block!).toContain('y: 2;');
    // Should include deeply nested generics and end at the real terminating semicolon
    expect(block!).toContain('Promise<string[]>');
    expect(block!.trim().endsWith(';')).toBe(true);
  });

  it('includes JSDoc even if there is blank whitespace separating it from the decl', () => {
    const block = extractDeclarationBlock(DTS, 'Weird');
    expect(block).toBeTruthy();
    // Leading JSDoc block should be included
    expect(block!).toMatch(/\/\*\*\s*\*\s*With JSDoc separated by whitespace/s);
    // And the alias head follows
    expect(block!).toContain('export type Weird<');
    expect(block!.trim().endsWith(';')).toBe(true);
  });

  it('accepts a dotted name and resolves using the last segment', () => {
    const dotted = extractDeclarationBlock(DTS, 'Ns.Subns.Foo');
    const plain = extractDeclarationBlock(DTS, 'Foo');
    expect(dotted).toBeTruthy();
    expect(plain).toBeTruthy();
    expect(dotted).toBe(plain);
  });

  it('returns null when the declaration is not found', () => {
    const block = extractDeclarationBlock(DTS, 'NotHere');
    expect(block).toBeNull();
  });

  it('can exclude the leading JSDoc when includeJsdoc=false', () => {
    const block = extractDeclarationBlock(DTS, 'Foo', { includeJsdoc: false });
    expect(block).toBeTruthy();
    expect(block!.startsWith('export interface Foo')).toBe(true);
    expect(block).not.toMatch(/\/\*\*/);
  });
});
