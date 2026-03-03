const preset = require('react-native/jest-preset');

module.exports = {
  ...preset,
  setupFiles: [
    ...(preset.setupFiles || []),
    '<rootDir>/node_modules/react-native-gesture-handler/jestSetup.js',
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  transformIgnorePatterns: [
    'node_modules/(?!(jest-)?react-native|@react-native|@react-navigation|@expo|expo(-.*)?|expo-modules-core|expo-router|@expo-google-fonts|@unimodules|react-native-svg|react-native-reanimated|@shopify/flash-list)',
  ],
  moduleNameMapper: {
    ...(preset.moduleNameMapper || {}),
    '^@/(.*)$': '<rootDir>/$1',
    // Mock binary assets
    '\\.(ttf|otf|eot|woff|woff2)$': '<rootDir>/__mocks__/fileMock.js',
    '\\.(jpg|jpeg|png|gif|svg|webp)$': '<rootDir>/__mocks__/fileMock.js',
  },
  testPathIgnorePatterns: ['/node_modules/', '/android/', '/ios/'],

  // Coverage configuration
  collectCoverageFrom: [
    'app/**/*.{ts,tsx}',
    'components/**/*.{ts,tsx}',
    'hooks/**/*.{ts,tsx}',
    'services/**/*.{ts,tsx}',
    'utils/**/*.{ts,tsx}',
    'constants/**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/__tests__/**',
    '!**/__mocks__/**',
    '!**/coverage/**',
    '!app/**/_layout.tsx',
  ],
  coverageReporters: ['text', 'text-summary', 'lcov', 'json-summary', 'html'],
  coverageDirectory: '<rootDir>/coverage',
};
