/** Find the character range [start,end) of a named interface body (“{ … }”). */
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

  // readonly?  "foo" | 'foo' | foo  with optional ?, colon, then until semicolon.
  const propRe =
  /^[ \t]*(?:readonly\s+)?(?:"([^"]+)"|'([^']+)'|([A-Za-z_$][\w$]*))\??\s*:\s*[^;{]{1,5000};/gm;

  const out: Array<{ name: string; headStart: number; indent: string }> = [];
  let m: RegExpExecArray | null;

  while ((m = propRe.exec(seg))) {
    const fullMatch = m[0];
    const matchStart = m.index; // start of the line (includes leading spaces/tabs)

    // Extract the indentation from the beginning of THIS match
    const indent = (fullMatch.match(/^[ \t]*/)?.[0]) ?? '';

    // Property head starts at: start of match + indent length
    const headStart = offset + matchStart + indent.length;

    // Property name: "foo" | 'foo' | foo
    const name = (m[1] ?? m[2] ?? m[3])!;

    out.push({ name, headStart, indent });
  }
  return out;
}


function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
