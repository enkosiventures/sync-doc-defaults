export class Logger {
  constructor(private quiet = false, private debug = false) {}
  log(msg: string) { if (!this.quiet) console.log(`[docdefaults] ${msg}`); }
  warn(msg: string) { if (!this.quiet) console.warn(`[docdefaults] Warning: ${msg}`); }
  error(msg: string) { console.error(`[docdefaults] ${msg}`); }
  dbg(msg: string) { if (this.debug) console.log(`[docdefaults:debug] ${msg}`); }
}
