export class Logger {
  constructor(private quiet = false, private debug = false) {}
  log(msg: string) { if (!this.quiet) console.log(`[sync-doc-defaults] ${msg}`); }
  warn(msg: string) { if (!this.quiet) console.warn(`[sync-doc-defaults] Warning: ${msg}`); }
  error(msg: string) { console.error(`[sync-doc-defaults] ${msg}`); }
  dbg(msg: string) { if (this.debug) console.log(`[sync-doc-defaults:debug] ${msg}`); }
}
