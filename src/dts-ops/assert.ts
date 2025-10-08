import { extractLeadingJsdoc, readDefaultLiteralFromJsdoc, formatDefaultLiteral } from './jsdoc.js';
import { listInterfaceProps } from './locator.js';


type Mismatch = {
  interfaceName: string;
  prop: string;
  expected: string;
  found?: string; // undefined means "missing"
};

export function assertDefaultsInDts(params: {
  dtsText: string;
  interfaceName: string;
  defaults: Record<string, unknown>;
}): { ok: boolean; mismatches: Mismatch[] } {
  const { dtsText, interfaceName, defaults } = params;

  const props = listInterfaceProps(dtsText, interfaceName);
  if (!props.length) {
    // Treat as all missing
    const mismatches = Object.entries(defaults).map(([prop, v]) => ({
      interfaceName,
      prop,
      expected: formatDefaultLiteral(v),
      found: undefined,
    }));
    return { ok: mismatches.length === 0, mismatches };
  }

  const mismatches: Mismatch[] = [];

  for (const [prop, value] of Object.entries(defaults)) {
    const p = props.find(p => p.name === prop);
    const expected = formatDefaultLiteral(value);
    if (!p) {
      mismatches.push({ interfaceName, prop, expected, found: undefined });
      continue;
    }
    const { headStart } = p;
    const { text: jsdocRaw } = extractLeadingJsdoc(dtsText, headStart);
    const found = readDefaultLiteralFromJsdoc(jsdocRaw);
    if (found !== expected) {
      mismatches.push({ interfaceName, prop, expected, found });
    }
  }

  return { ok: mismatches.length === 0, mismatches };
}
