export default {
  constants: 'src/constants.ts',
  tsconfig: 'tsconfig.json',

  targets: [
    {
      source: 'src/types.ts',
      interface: 'CommonOptions',
      defaults: 'RUN_DEFAULTS',
      dts: 'dist/types.d.ts',
    },
  ],
};
