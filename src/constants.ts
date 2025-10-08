import { DefaultTag, RunOptions, TsMode } from "./types.js";


export const RUN_DEFAULTS: Required<
  Pick<RunOptions, 'dryRun' | 'quiet' | 'debugPaths' | 'tsMode' | 'tag'>
> = {
  dryRun: false,
  quiet: false,
  debugPaths: false,
  tsMode: 'auto' satisfies TsMode,
  tag: 'default' satisfies DefaultTag,
};
