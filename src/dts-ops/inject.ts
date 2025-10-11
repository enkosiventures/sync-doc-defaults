import type { DTSEditResult, PreferredTag } from '../types.js';
import { formatDefaultLiteral, upsertDefaultForProp, extractLeadingJsdoc, readDefaultLiteralFromJsdoc } from './jsdoc.js';
import { listInterfaceProps } from './locator.js';


/**
 * Inject default literals into a `.d.ts` text for a given interface.
 * - Rewrites/creates a canonical JSDoc above each property.
 * - Idempotent: no changes when the literal already matches and the preferred tag is already used.
 * - Tag normalization: will switch `@defaultValue` ↔ `@default` to match `preferredTag`.
 * - Only properties present in `defaults` are considered; properties missing from the interface are
 *   reported via the `missing` array (they are not added to the interface).
 */
export function injectDefaultsIntoDts(params: {
  dtsText: string;
  interfaceName: string;
  defaults: Record<string, unknown>;
  preferredTag: PreferredTag;
}): DTSEditResult {
  const { dtsText, interfaceName, defaults, preferredTag } = params;

  // snapshot of props
  const props = listInterfaceProps(dtsText, interfaceName);
  console.warn(`Found ${props.length} props in interface ${interfaceName}`, props);
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
  for (const prop in defaults) {
    if (!Object.prototype.hasOwnProperty.call(defaults, prop)) continue;
    
    let value: unknown;
    try {
      value = defaults[prop];
    } catch (_) {
      // Getter threw, skip this property
      missing.push({ interfaceName, prop });
      continue;
    }

    const p = props.find((p) => p.name === prop);
    if (!p) {
      missing.push({ interfaceName, prop });
      continue;
    }
    const expected = formatDefaultLiteral(value);

    // If already correct, skip work (we'll check against the doc next)
    tasks.push({
      prop,
      headStart: p.headStart,
      indent: p.indent,
      expected,
    });
  }

  // Sort bottom→top so earlier indices aren't invalidated by later edits
  tasks.sort((a, b) => b.headStart - a.headStart);

  let text = dtsText;
  let updated = 0;

  for (const task of tasks) {
    // Re-check current value from the current text (not the original)
    const { text: jsdocRaw } = extractLeadingJsdoc(text, task.headStart);
    const found = readDefaultLiteralFromJsdoc(jsdocRaw);

    // detect which tag kinds are present (works for both single-line and multi-line docs)
    const hasDefault = /@default(\s|$)/m.test(jsdocRaw ?? '');
    const hasDefaultValue = /@defaultValue(\s|$)/m.test(jsdocRaw ?? '');
    const hasPreferred = preferredTag === 'default' ? hasDefault : hasDefaultValue;
    const hasOther     = preferredTag === 'default' ? hasDefaultValue : hasDefault;

    // only skip when the value matches AND we're already using the preferred tag
    // (i.e., nothing to normalize). Otherwise, call upsert to normalize.
    if (found === task.expected && hasPreferred && !hasOther) {
      continue;
    }

    text = upsertDefaultForProp(text, task.headStart, task.indent, task.expected, preferredTag);
    updated++;

    // For maximal safety at the cost of performance,
    // recompute the latest headStart here instead of sorting:
    // const latest = listInterfaceProps(text, interfaceName).find(p => p.name === task.prop);
    // if (!latest) continue; // disappeared? skip
    // text = upsertDefaultForProp(text, latest.headStart, latest.indent, task.expected, preferredTag);
  }

  return { updatedText: text, updatedCount: updated, missing };
}
