export function extractDeclarationBlock(
  dtsText: string,
  typeName: string,
  opts: { includeJsdoc?: boolean } = {},
): string | null {
  const includeJsdoc = opts.includeJsdoc !== false;
  const name = typeName.split('.').pop()!; // tolerate "Namespace.Type"

  const nameRe = escapeRe(name);
  const headRe = new RegExp(
    //    ^line        export?    declare?    kind     Name         <generics?>
    String.raw`(^|\n)[ \t]*(?:export\s+)?(?:declare\s+)?(interface|type)\s+${nameRe}(?:\s*<[^>{}]*>)?`,
    'g',
  );

  const m = headRe.exec(dtsText);
  if (!m) return null;

  const kind = m[2] as 'interface' | 'type';
  const declHeadStart = m.index + (m[1] ? m[1].length : 0); // start of line indent
  let sliceStart = declHeadStart;

  if (includeJsdoc) {
    const jsdoc = findLeadingJsdoc(dtsText, declHeadStart);
    if (jsdoc) sliceStart = jsdoc.start;
  }

  // Find the end of the declaration.
  let sliceEnd = -1;

  if (kind === 'interface') {
    const open = dtsText.indexOf('{', m.index);
    if (open === -1) return null;
    const close = findMatchingBracket(dtsText, open, '{', '}');
    if (close === -1) return null;
    sliceEnd = close + 1;
    // optional trailing semicolon for interface; include if present
    if (dtsText[sliceEnd] === ';') sliceEnd += 1;
  } else {
    // type alias: find "=" then scan to the terminating ";" with balancing
    const eq = dtsText.indexOf('=', m.index);
    if (eq === -1) return null;
    const afterEq = skipSpace(dtsText, eq + 1);
    const semi = scanTypeAliasEnd(dtsText, afterEq);
    if (semi === -1) return null;
    sliceEnd = semi + 1; // include the ';'
  }

  return dtsText.slice(sliceStart, sliceEnd);
}

/* ---------------- internals ---------------- */

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function skipSpace(s: string, i: number) {
  while (i < s.length && /\s/.test(s[i])) i++;
  return i;
}

/** If there’s a JSDoc immediately above declStart (only whitespace between), return its [start,end). */
function findLeadingJsdoc(text: string, declStart: number): { start: number; end: number } | null {
  // Walk back over whitespace
  let i = declStart - 1;
  while (i >= 0 && /\s/.test(text[i])) i--;
  // Expect '*/'
  if (i < 1 || text[i] !== '/' || text[i - 1] !== '*') return null;

  // We’re just before the closing '*/'. Find the opening '/**'
  let end = i + 1; // end is after '/'
  i -= 2; // move left of '*/'
  // Scan backwards for '/**'
  for (; i >= 2; i--) {
    if (text[i - 2] === '/' && text[i - 1] === '*' && text[i] === '*') {
      const start = i - 2;
      // ensure this is a JSDoc (/** not /*) — the check above enforces the two stars
      return { start, end };
    }
    // small guard: if we hit another '*/' going backwards, give up (nested weirdness)
  }
  return null;
}

function findMatchingBracket(s: string, openIdx: number, openCh: '{' | '(' | '[', closeCh: '}' | ')' | ']') {
  let depth = 0;
  let i = openIdx;
  let inS: '"' | "'" | '`' | null = null;
  let inLine = false;
  let inBlock = false;

  for (; i < s.length; i++) {
    const ch = s[i];
    const prev = i > 0 ? s[i - 1] : '';

    if (inLine) {
      if (ch === '\n') inLine = false;
      continue;
    }
    if (inBlock) {
      if (prev === '*' && ch === '/') inBlock = false;
      continue;
    }
    if (inS) {
      if (ch === inS && prev !== '\\') inS = null;
      continue;
    }

    // comments
    if (prev === '/' && ch === '/') {
      inLine = true;
      continue;
    }
    if (prev === '/' && ch === '*') {
      inBlock = true;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      inS = ch as '"' | "'" | '`';
      continue;
    }

    if (ch === openCh) depth++;
    else if (ch === closeCh) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Scan from `start` to the semicolon that terminates a type alias, respecting nesting/comments/strings. */
function scanTypeAliasEnd(s: string, start: number) {
  let i = start;
  let inS: '"' | "'" | '`' | null = null;
  let inLine = false;
  let inBlock = false;
  let bCurly = 0, bParen = 0, bSquare = 0, bAngle = 0;

  for (; i < s.length; i++) {
    const ch = s[i];
    const prev = i > 0 ? s[i - 1] : '';

    if (inLine) {
      if (ch === '\n') inLine = false;
      continue;
    }
    if (inBlock) {
      if (prev === '*' && ch === '/') inBlock = false;
      continue;
    }
    if (inS) {
      if (ch === inS && prev !== '\\') inS = null;
      continue;
    }

    // comments
    if (prev === '/' && ch === '/') {
      inLine = true;
      continue;
    }
    if (prev === '/' && ch === '*') {
      inBlock = true;
      continue;
    }

    // strings
    if (ch === '"' || ch === "'" || ch === '`') {
      inS = ch as '"' | "'" | '`';
      continue;
    }

    // nesting
    if (ch === '{') bCurly++;
    else if (ch === '}') bCurly = Math.max(0, bCurly - 1);
    else if (ch === '(') bParen++;
    else if (ch === ')') bParen = Math.max(0, bParen - 1);
    else if (ch === '[') bSquare++;
    else if (ch === ']') bSquare = Math.max(0, bSquare - 1);
    else if (ch === '<') bAngle++;
    else if (ch === '>') bAngle = Math.max(0, bAngle - 1);
    else if (ch === ';') {
      if (bCurly === 0 && bParen === 0 && bSquare === 0 && bAngle === 0) {
        return i;
      }
    }
  }
  return -1;
}
