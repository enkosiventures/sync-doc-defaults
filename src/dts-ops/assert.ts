import { extractLeadingJsdoc, readDefaultLiteralFromJsdoc, formatDefaultLiteral } from './jsdoc.js';
import { listInterfaceProps } from './locator.js';


type Mismatch = {
  interfaceName: string;
  prop: string;
  expected: string;
  found?: string; // undefined means "missing"
};

/**
 * Verifies that JSDoc @default tags in a TypeScript declaration file match expected runtime values.
 * 
 * This function performs a strict comparison between the literal values found in JSDoc @default
 * tags and the provided runtime defaults. It's designed to catch documentation drift where the
 * documented defaults no longer match the actual runtime behavior.
 * 
 * The comparison is performed by:
 * 1. Parsing the interface to find all properties
 * 2. Extracting JSDoc comments and their @default/@defaultValue tags
 * 3. Comparing the formatted literal from JSDoc against the expected literal
 * 4. Collecting all mismatches for comprehensive error reporting
 * 
 * Important behavior notes:
 * - Only properties present in `defaults` are asserted. Interface properties that do not appear
 *   in `defaults` are ignored (they do not produce mismatches).
 * - Both `@default` and `@defaultValue` tags are accepted when reading; the literal value is compared,
 *   not the specific tag name.
 * - If the target interface cannot be found in `dtsText`, every key in `defaults` is reported as
 *   a missing @default.
 * 
 * @param params - Assertion parameters
 * @param params.dtsText - Complete text content of the .d.ts file to check
 * @param params.interfaceName - Name of the interface whose properties should be checked
 * @param params.defaults - Object mapping property names to their expected default values.
 *                          Values will be formatted using the same rules as injection
 *                          (strings quoted, objects JSON-stringified, etc.)
 * 
 * @returns Assertion result object
 * @returns returns.ok - True if all defaults match, false if any mismatches found
 * @returns returns.mismatches - Array of mismatch details, empty if ok=true
 * @returns returns.mismatches[].interfaceName - The interface containing the mismatch
 * @returns returns.mismatches[].prop - Property name that has incorrect/missing default
 * @returns returns.mismatches[].expected - The correctly formatted default literal
 * @returns returns.mismatches[].found - The actual literal found (undefined if missing)
 * 
 * @example
 * const result = assertDefaultsInDts({
 *   dtsText: declarationFileContent,
 *   interfaceName: 'ConfigOptions',
 *   defaults: { timeout: 5000, retries: 3 }
 * });
 * 
 * if (!result.ok) {
 *   for (const m of result.mismatches) {
 *     console.error(`${m.prop}: expected ${m.expected}, found ${m.found}`);
 *   }
 *   throw new Error('Documentation out of sync');
 * }
 */
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
