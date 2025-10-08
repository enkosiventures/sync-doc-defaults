import path from 'node:path';
import { DefaultTag, Jsdoc } from '../types.js';


/** Choose the indent for the new doc: prefer the property's indent.
 * If there was a doc and it's very close (within 1 char), keep it; otherwise
 * normalize to the property's indent for stability. */
export function chooseDocIndent(propIndent: string, existingDocIndent?: string): string {
  if (!existingDocIndent) return propIndent;
  return Math.abs(propIndent.length - existingDocIndent.length) <= 1
    ? existingDocIndent
    : propIndent;
}

/** Detect the indentation (leading spaces/tabs) used by the existing doc block’s first line. */
function detectDocIndent(fullText: string, rangeStart: number): string {
  const lineStart = fullText.lastIndexOf('\n', rangeStart - 1) + 1;
  const leading = fullText.slice(lineStart, rangeStart);
  const m = leading.match(/^[ \t]*/);
  return m ? m[0] : '';
}

/** Detect whether the docblock uses `'*'` or `'* '` for lines after the opener. Defaults to `'* '`. */
function detectStarPadFromDoc(raw?: string): ' ' | '' {
  if (!raw || !raw.startsWith('/**')) return ' ';
  const lines = raw.split(/\r?\n/).slice(1); // skip the '/**' line
  for (const l of lines) {
    const m = l.match(/^(\s*)\*(\s?)/);
    if (m) {
      return m[2] === ' ' ? ' ' : '';
    }
  }
  return ' ';
}

/** Extract a JSDoc (/** … *\/) or a consecutive block of //-lines directly above headStart. */
export function extractLeadingJsdoc(
  fullText: string,
  headStart: number
): { range?: [number, number]; text?: string } {
  // Move left over whitespace before the property head
  let i = headStart;
  while (i > 0 && /[ \t\r\n]/.test(fullText[i - 1])) i--;

  // Find a /** ... */ block that ends immediately before headStart (only whitespace between)
  const blockEnd = fullText.lastIndexOf('*/', i - 1);
  if (blockEnd !== -1) {
    const blockStart = fullText.lastIndexOf('/**', blockEnd - 2);
    if (blockStart !== -1) {
      // Include the line's leading whitespace before the '/**'
      const lineStart = fullText.lastIndexOf('\n', blockStart - 1) + 1;

      const between = fullText.slice(blockEnd + 2, headStart);
      if (/^[ \t\r\n]*$/.test(between)) {
        const text = fullText.slice(blockStart, blockEnd + 2);
        // Return the range starting at the lineStart so we *replace* old padding too
        return { range: [lineStart, blockEnd + 2], text };
      }
    }
  }

  // Fallback: consecutive // lines immediately above the head (this already includes line starts)
  let j = headStart;
  let start: number | null = null;
  while (j > 0) {
    const lineStart = fullText.lastIndexOf('\n', j - 1) + 1;
    const line = fullText.slice(lineStart, j);
    if (/^\s*\/\/(.*)$/.test(line)) {
      start = lineStart;
      j = lineStart;
      continue;
    }
    if (!/^\s*$/.test(line)) break;
    j = lineStart;
  }
  if (start != null && start < headStart) {
    const text = fullText.slice(start, headStart);
    return { range: [start, headStart], text };
  }

  return {};
}



export function parseJsdoc(raw: string | undefined): Jsdoc {
  if (!raw) return { description: [], tags: [] };

  // Normalize // lines to a pseudo-block: we’ll rewrite anyway.
  if (!raw.startsWith('/**')) {
    const lines = raw.split(/\r?\n/).map(l => l.replace(/^\s*\/\/\s?/, '').trimRight());
    return { description: trimBlank(lines), tags: [] };
  }

  // Strip /** */ and leading "* "
  const body = raw
    .replace(/^\/\*\*|\*\/$/g, '')
    .split(/\r?\n/)
    .map(l => l.replace(/^\s*\*\s?/, '').trimRight());

  const description: string[] = [];
  const tags: Array<{ tag: string; text: string }> = [];

  for (const line of body) {
    const m = line.match(/^@(\w+)\s*(.*)$/);
    if (m) tags.push({ tag: m[1], text: (m[2] ?? '').trim() });
    else description.push(line);
  }
  return { description: trimBlank(description), tags };
}

function trimBlank(lines: string[]): string[] {
  const out = [...lines];
  while (out.length && !out[0].trim()) out.shift();
  while (out.length && !out[out.length - 1].trim()) out.pop();
  return out;
}

/** Render a canonical JSDoc block with normalized `@default` or `@defaultValue`. */
export function renderJsdocCanonical(opts: {
  indent: string;                     // indent to use for ALL doc lines
  starPad?: ' ' | '';                 // ' ' to render " * ", '' to render " *"
  description: string[];
  tags: Array<{ tag: string; text: string }>;
  defaultLiteral: string;
  preferredTag: DefaultTag;
}): string {
  const { indent, starPad = ' ', description, tags, defaultLiteral, preferredTag } = opts;

  const rest = tags.filter(t => t.tag !== 'default' && t.tag !== 'defaultValue');

  // Build with explicit indent on every line. No trimming.
  const open  = `${indent}/**`;
  const star  = (s = '') => `${indent} *${starPad}${s}`;
  const close = `${indent} */`;

  const out: string[] = [];
  out.push(open);

  if (description.length) {
    for (const l of description) out.push(star(l));
    out.push(star()); // blank line between description and tags
  }

  out.push(star(`@${preferredTag} ${defaultLiteral}`));
  for (const t of rest) out.push(star(`${t.tag ? '@' + t.tag : ''}${t.text ? ' ' + t.text : ''}`));

  out.push(close);
  return out.join('\n');
}

/** Create/replace the docblock above a property head with a canonical block containing the default. */
export function upsertDefaultForProp(
  fullText: string,
  propHeadStart: number,
  propIndent: string,
  literal: string,
  preferredTag: DefaultTag
): string {
  const found = extractLeadingJsdoc(fullText, propHeadStart);

  const existingDocIndent = found.range ? detectDocIndent(fullText, found.range[0]) : undefined;
  const starPad = detectStarPadFromDoc(found.text);
  const baseIndent = chooseDocIndent(propIndent, existingDocIndent);

  const parsed = parseJsdoc(found.text);
  const next = renderJsdocCanonical({
    indent: baseIndent,
    starPad,
    description: parsed.description,
    tags: parsed.tags,
    defaultLiteral: literal,
    preferredTag,
  });

  if (found.range) {
    // If the original docblock is followed by a newline already, don’t add another.
    const afterChar = fullText[found.range[1]] ?? '';
    const sep = afterChar === '\n' ? '' : '\n';
    return fullText.slice(0, found.range[0]) + next + sep + fullText.slice(found.range[1]);
  }

  // No existing doc: ensure there is exactly one newline between our new doc and the head.
  const afterChar = fullText[propHeadStart] ?? '';
  const sep = afterChar === '\n' ? '' : '\n';
  return fullText.slice(0, propHeadStart) + next + sep + fullText.slice(propHeadStart);
}



/** Extract existing default literal text from a JSDoc (accepts @default or @defaultValue). */
export function readDefaultLiteralFromJsdoc(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const jsdoc = parseJsdoc(raw);
  const tag = jsdoc.tags.find(t => t.tag === 'default' || t.tag === 'defaultValue');
  return tag?.text?.trim() || undefined;
}

/** Format a JS value as a compact literal for doc display. */
export function formatDefaultLiteral(v: unknown): string {
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number' || typeof v === 'boolean' || v === null) return String(v);
  try {
    const s = JSON.stringify(v);
    return s.length > 120 ? s.slice(0, 117) + '…' : s;
  } catch {
    return String(v);
  }
}

/** Helper for debug messages. */
export function rel(base: string, p: string) {
  return path.relative(base, p) || '.';
}
