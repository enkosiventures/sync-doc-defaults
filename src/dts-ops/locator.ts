/**
 * Finds the character range of an interface body in TypeScript declaration text.
 * Handles nested braces and export modifiers.
 * 
 * Limitation: This simple brace scan does not skip braces inside strings or comments; declaration
 * files rarely contain such cases and are usually safe.
 * 
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
  const match = re.exec(text);
  if (!match) return undefined;

  // brace match from the "{" we found
  const openIdx = match.index + match[0].lastIndexOf('{');
  let depth = 0;
  for (let i = openIdx; i < text.length; i++) {
    const char = text[i];
    if (char === '{') depth++;
    else if (char === '}') {
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

  const segment = text.slice(body.bodyStart, body.bodyEnd);
  const offset = body.bodyStart;

  // Start-of-line anchored (multiline) for CRLF/LF safety.
  // readonly?  "foo" | 'foo' | foo  with optional ?, colon, then until semicolon.
  const propRe =
    /^([ \t]*)(?:readonly\s+)?(?:"([^"]+)"|'([^']+)'|([A-Za-z_$][\w$]*))\??\s*:\s*[^;]*;/gm;

  const out: Array<{ name: string; headStart: number; indent: string }> = [];
  let match: RegExpExecArray | null;

  while ((match = propRe.exec(segment))) {
    const indent = match[1] || '';
    const name = match[2] || match[3] || match[4];
    if (!name) continue;
    // match.index is the start-of-line thanks to ^ with /m
    const headStart = offset + match.index + indent.length;
    out.push({ name, headStart, indent });
  }
  return out;
}

function escapeRe(segment: string) {
  return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
