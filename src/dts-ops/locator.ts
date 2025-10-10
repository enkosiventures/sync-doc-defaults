/**
 * Finds the character range of an interface body in TypeScript declaration text.
 * Handles nested braces and export modifiers.
 * @param text - TypeScript declaration file content
 * @param interfaceName - Name of the interface to find
 * @returns Object with bodyStart and bodyEnd character positions, or undefined if not found
 * @example
 * findInterfaceBody("interface Foo { x: number; }", "Foo")
 * // Returns: { bodyStart: 15, bodyEnd: 27 }
 */
export function findInterfaceBody(text: string, interfaceName: string): { bodyStart: number; bodyEnd: number } | undefined {
  // Support "export interface X" or "interface X"
  const re = new RegExp(`\\b(?:export\\s+)?interface\\s+${escapeRe(interfaceName)}\\s*{`, 'm');
  const m = re.exec(text);
  if (!m) return undefined;

  // brace match from the "{" we found
  const openIdx = m.index + m[0].lastIndexOf('{');
  let depth = 0;
  for (let i = openIdx; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return { bodyStart: openIdx + 1, bodyEnd: i };
      }
    }
  }
  return undefined;
}

/** Enumerate property heads within an interface body (simple .d.ts shapes). */
export function listInterfaceProps(
  text: string,
  interfaceName: string
): Array<{ name: string; headStart: number; indent: string }> {
  const body = findInterfaceBody(text, interfaceName);
  if (!body) return [];

  const seg = text.slice(body.bodyStart, body.bodyEnd);
  const offset = body.bodyStart;

  // Start-of-line anchored (multiline) for CRLF/LF safety.
  // readonly?  "foo" | 'foo' | foo  with optional ?, colon, then until semicolon.
  const propRe =
    /^([ \t]*)(?:readonly\s+)?(?:"([^"]+)"|'([^']+)'|([A-Za-z_$][\w$]*))\??\s*:\s*[^;]*;/gm;

  const out: Array<{ name: string; headStart: number; indent: string }> = [];
  let m: RegExpExecArray | null;

  while ((m = propRe.exec(seg))) {
    const indent = m[1] || '';
    const name = m[2] || m[3] || m[4];
    if (!name) continue;
    // m.index is the start-of-line thanks to ^ with /m
    const headStart = offset + m.index + indent.length;
    out.push({ name, headStart, indent });
  }
  return out;
}


function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
