import path from 'node:path';
import { SddError } from './errors.js';


export function getRelativePath(base: string, pathAbs: string) {
  return path.relative(base, pathAbs) || '.';
}

export function getByPath(obj: any, pathStr: string): any {
  const segments = pathStr.split('.');
  let current = obj;
  for (const segment of segments) {
    if (current == null) return undefined;
    current = current[segment];
  }
  return current;
}

export function assertPlainObject(val: any, ctx: string) {
  if (!val || typeof val !== 'object' || Array.isArray(val)) {
    throw new SddError(
      'ASSERT_FAILED',
      `${ctx} must be a plain object (got ${val === null ? 'null' : typeof val})`
    );
  }
}
