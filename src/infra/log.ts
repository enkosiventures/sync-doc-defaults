import { LOG_PREFIX } from "../constants.js";

type Level = 'error' | 'warn' | 'info' | 'debug';

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  gray: '\x1b[90m'
} as const;

function fmt(prefix: string, message: string, ts?: boolean, color?: string) {
  const time = ts ? new Date().toISOString() + ' ' : '';
  const formattedPrefix = color ? `${COLORS.gray}${time}${color}${prefix}${COLORS.reset}` : `${time}${prefix}`;
  return `${formattedPrefix} ${message}`;
}

export class Logger {
  private level: Level;
  private prefix: string;
  private useColors: boolean;
  private withTs: boolean;

  constructor(quiet = false, debug = false, options?: { timestamp?: boolean; prefix?: string; colors?: boolean }) {
    this.level = quiet ? 'error' : (debug ? 'debug' : 'info');
    this.prefix = options?.prefix ?? LOG_PREFIX;
    this.useColors = options?.colors ?? process.stdout.isTTY;
    this.withTs = !!options?.timestamp;
  }

  log(message: string, force = false) {
    if (this.level === 'error' && !force) return;
    const line = this.useColors
      ? fmt(this.prefix, message, this.withTs, '')
      : fmt(this.prefix, message, this.withTs);
    console.log(line);
  }

  warn(message: string) {
    if (this.level === 'error') return;
    const text = `Warning: ${message}`;
    const line = this.useColors
      ? fmt(this.prefix, text, this.withTs, COLORS.yellow)
      : fmt(this.prefix, text, this.withTs);
    console.warn(line);
  }

  error(message: string, err?: unknown) {
    const line = this.useColors
      ? fmt(this.prefix, message, this.withTs, COLORS.red)
      : fmt(this.prefix, message, this.withTs);
    console.error(line);
    if (err) {
      console.error(err);
    }
  }

  dbg(message: string) {
    if (this.level !== 'debug') return;
    const line = this.useColors
      ? fmt('[sync-doc-defaults:debug]', message, this.withTs, COLORS.gray)
      : fmt('[sync-doc-defaults:debug]', message, this.withTs);
    console.log(line);
  }
}

export function createLogger(options: { quiet?: boolean; debugPaths?: boolean; timestamp?: boolean }) {
  return new Logger(!!options.quiet, !!options.debugPaths, { timestamp: options.timestamp });
}

export const defaultLogger = createLogger({ quiet: true, debugPaths: true });
