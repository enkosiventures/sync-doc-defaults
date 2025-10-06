import { DefaultTag } from '../types.js';
import { formatDefaultLiteral, upsertDefaultForProp, extractLeadingJsdoc, readDefaultLiteralFromJsdoc } from './jsdoc.js';
import { listInterfaceProps } from './locator.js';

export type DtsEditResult = {
  updatedText: string;
  updatedCount: number;
  missing: Array<{ interfaceName: string; prop: string }>;
};

/**
 * Inject default literals into a `.d.ts` text for a given interface.
 * - Rewrites/creates a canonical JSDoc above each property with the default.
 * - Idempotent.
 */
export function injectDefaultsIntoDts(params: {
  dtsText: string;
  interfaceName: string;
  defaults: Record<string, unknown>;
  preferredTag: DefaultTag;
}): DtsEditResult {
  const { dtsText, interfaceName, defaults, preferredTag } = params;

  // snapshot of props
  const props = listInterfaceProps(dtsText, interfaceName);
  if (!props.length) {
    return {
      updatedText: dtsText,
      updatedCount: 0,
      missing: Object.keys(defaults).map((k) => ({ interfaceName, prop: k })),
    };
  }

  type Task = {
    prop: string;
    headStart: number;
    indent: string;
    expected: string;
  };
  const tasks: Task[] = [];
  const missing: Array<{ interfaceName: string; prop: string }> = [];

  // Build tasks + compute expected literals
  for (const [prop, value] of Object.entries(defaults)) {
    const p = props.find((p) => p.name === prop);
    if (!p) {
      missing.push({ interfaceName, prop });
      continue;
    }
    const expected = formatDefaultLiteral(value);

    // If already correct, skip work (we’ll check against the doc next)
    tasks.push({
      prop,
      headStart: p.headStart,
      indent: p.indent,
      expected,
    });
  }

  // Sort bottom→top so earlier indices aren’t invalidated by later edits
  tasks.sort((a, b) => b.headStart - a.headStart);

  let text = dtsText;
  let updated = 0;

  for (const t of tasks) {
    // Re-check current value from the current text (not the original)
    const { text: jsdocRaw } = extractLeadingJsdoc(text, t.headStart);
    const found = readDefaultLiteralFromJsdoc(jsdocRaw);
    if (found === t.expected) continue;

    text = upsertDefaultForProp(text, t.headStart, t.indent, t.expected, preferredTag);
    updated++;

    // If you prefer maximal safety at the cost of perf, you can
    // recompute the latest headStart here instead of sorting:
    // const latest = listInterfaceProps(text, interfaceName).find(p => p.name === t.prop);
    // if (!latest) continue; // disappeared? skip
    // text = upsertDefaultForProp(text, latest.headStart, latest.indent, t.expected, preferredTag);
  }

  return { updatedText: text, updatedCount: updated, missing };
}
