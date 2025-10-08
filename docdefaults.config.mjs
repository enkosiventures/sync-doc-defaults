export default {
  defaults: 'src/constants.ts',
  tsconfig: 'tsconfig.json',

  targets: [
    {
      types: 'src/types.ts',
      interface: 'CommonOptions',
      member: 'RUN_DEFAULTS',
      dts: 'dist/types.d.ts',
    },
  ],
};
