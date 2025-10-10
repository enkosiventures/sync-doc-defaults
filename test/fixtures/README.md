# Test Fixtures

This directory contains minimal test fixtures used across the test suite to verify the core functionality of sync-doc-defaults.

## Files

### constants.js
A simple CommonJS module that exports a `DEFAULTS` object with three properties of different types (string, number, boolean). This represents a typical constants/defaults module that a library author would maintain as the source of truth for their configuration defaults.

**Used to test:**
- Loading JavaScript default modules
- Extracting default values for injection
- Different primitive type handling

### types.d.ts
A TypeScript declaration file containing the `ExampleOptions` interface with three optional properties that correspond to the defaults in `constants.js`. Each property has a JSDoc comment with `@defaultValue {@link ...}` placeholder tags.

**Used to test:**
- Initial state before injection (placeholders present)
- Property detection and parsing
- JSDoc comment preservation during injection
- The full inject → assert workflow

## Usage Pattern

Tests typically:
1. Copy these fixtures to a temporary directory
2. Run inject to replace the `{@link ...}` placeholders with actual values from constants.js
3. Verify the resulting .d.ts file contains correct `@default` literals
4. Run assert to ensure the values match

## Why These Fixtures?

These minimal fixtures exercise the core functionality without unnecessary complexity:
- Different data types (string, number, boolean)
- Existing JSDoc structure that needs updating
- Standard TypeScript interface syntax
- Realistic placeholder format that might be used before adopting this tool