type Level = 'error' | 'warn' | 'info' | 'debug';

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  gray: '\x1b[90m'
} as const;

function fmt(prefix: string, msg: string, ts?: boolean, color?: string) {
  const time = ts ? new Date().toISOString() + ' ' : '';
  const pfx = color ? `${COLORS.gray}${time}${color}${prefix}${COLORS.reset}` : `${time}${prefix}`;
  return `${pfx} ${msg}`;
}

export class Logger {
  private level: Level;
  private prefix: string;
  private useColors: boolean;
  private withTs: boolean;

  constructor(quiet = false, debug = false, opts?: { timestamp?: boolean; prefix?: string; colors?: boolean }) {
    this.level = quiet ? 'error' : (debug ? 'debug' : 'info');
    this.prefix = opts?.prefix ?? '[sync-doc-defaults]';
    this.useColors = opts?.colors ?? process.stdout.isTTY;
    this.withTs = !!opts?.timestamp;
  }

  // Info (default)
  log(msg: string, force = false) {
    if (this.level === 'error' && !force) return;
    const line = this.useColors
      ? fmt(this.prefix, msg, this.withTs, '')
      : fmt(this.prefix, msg, this.withTs);
    console.log(line);
  }

  warn(msg: string) {
    if (this.level === 'error') return;
    const text = `Warning: ${msg}`;
    const line = this.useColors
      ? fmt(this.prefix, text, this.withTs, COLORS.yellow)
      : fmt(this.prefix, text, this.withTs);
    console.warn(line);
  }

  error(msg: string, err?: unknown) {
    const line = this.useColors
      ? fmt(this.prefix, msg, this.withTs, COLORS.red)
      : fmt(this.prefix, msg, this.withTs);
    console.error(line);
    if (err) {
      console.error(err);
    }
  }

  dbg(msg: string) {
    if (this.level !== 'debug') return;
    const line = this.useColors
      ? fmt('[sync-doc-defaults:debug]', msg, this.withTs, COLORS.gray)
      : fmt('[sync-doc-defaults:debug]', msg, this.withTs);
    console.log(line);
  }
}

// Convenience factory that mirrors your CLI flags/env
export function createLogger(opts: { quiet?: boolean; debugPaths?: boolean; timestamp?: boolean }) {
  return new Logger(!!opts.quiet, !!opts.debugPaths, { timestamp: opts.timestamp });
}

export const defaultLogger = new Logger(true, true, { colors: true });
