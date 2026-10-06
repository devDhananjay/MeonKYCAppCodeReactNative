module.exports = {
  root: true,
  extends: '@react-native',
  rules: {
    // Dart-style private/unused placeholders (`_`, `_foo`) are kept for 1:1 parity with the Flutter source.
    '@typescript-eslint/no-unused-vars': [
      'warn',
      {argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none'},
    ],
    // Bit operations are required by ported checksum / PNG / hash code.
    'no-bitwise': 'off',
  },
};
