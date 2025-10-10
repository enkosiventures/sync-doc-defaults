import { EXIT_CODES, LOG_PREFIX } from "./constants.js";

export type ErrorCode =
  | 'CLI_USAGE'
  | 'CONFIG_NOT_FOUND'
  | 'INVALID_CONFIG'
  | 'INTERFACE_NOT_FOUND'
  | 'DEFAULTS_SYMBOL_NOT_FOUND'
  | 'DTS_NOT_FOUND'
  | 'BUILT_JS_IMPORT_FAILED'
  | 'TSX_NOT_INSTALLED'
  | 'COULD_NOT_LOAD_TS'
  | 'ASSERT_FAILED';

const DEFAULT_EXIT_BY_CODE: Record<ErrorCode, number> = {
  CLI_USAGE: EXIT_CODES.USAGE_ERROR,
  CONFIG_NOT_FOUND: EXIT_CODES.CONFIG_NOT_FOUND,
  INVALID_CONFIG: EXIT_CODES.INVALID_CONFIG,
  ASSERT_FAILED: EXIT_CODES.VALIDATION_ERROR,

  // Treat all “not found / can’t load / tsx missing / import failed” as LOADING_ERROR
  INTERFACE_NOT_FOUND: EXIT_CODES.LOADING_ERROR,
  DEFAULTS_SYMBOL_NOT_FOUND: EXIT_CODES.LOADING_ERROR,
  DTS_NOT_FOUND: EXIT_CODES.LOADING_ERROR,
  BUILT_JS_IMPORT_FAILED: EXIT_CODES.LOADING_ERROR,
  TSX_NOT_INSTALLED: EXIT_CODES.LOADING_ERROR,
  COULD_NOT_LOAD_TS: EXIT_CODES.LOADING_ERROR,
};

export interface ErrorDetails {
  hint?: string;
  context?: Record<string, unknown>;
}

export class SddError extends Error {
  readonly code: ErrorCode;
  readonly exitCode: number;
  readonly details?: ErrorDetails;
  readonly cause?: unknown;

  constructor(code: ErrorCode, message: string, opts?: {
    exitCode?: number;
    details?: ErrorDetails;
    cause?: unknown;
  }) {
    super(message.startsWith(LOG_PREFIX) ? message : `${LOG_PREFIX} ${message}`);
    this.name = 'SddError';
    this.code = code;
    this.exitCode = opts?.exitCode ?? DEFAULT_EXIT_BY_CODE[code] ?? EXIT_CODES.GENERAL_ERROR;
    this.details = opts?.details;
    if (opts?.cause) this.cause = opts.cause;
  }
}

export function errMsg(message: string, details?: ErrorDetails): string {
  const lines = [message];
  if (details?.hint) lines.push(details.hint);
  return lines.join('\n');
}

// Convenience helpers
export function usageError(message: string) {
  return new SddError('CLI_USAGE', errMsg(message), { exitCode: 1 });
}

export function configNotFound(path: string) {
  return new SddError('CONFIG_NOT_FOUND',
    errMsg(`Config file not found. Looked for docdefaults.config.(mjs|cjs|js|json) from ${path}`),
    { exitCode: 2 }
  );
}
