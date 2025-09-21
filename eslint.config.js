const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  ...expoConfig,
  {
    // apply to your src – adjust globs as you like
    files: ['app/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}'],

    rules: {
      // turn off the warnings you listed
      'react-hooks/exhaustive-deps': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'import/no-duplicates': 'off',
      'no-unused-expressions': 'off',
    },

    // keep ignoring build output
    ignores: ['dist/*'],
  },
]);
