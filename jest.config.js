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
  },
  testPathIgnorePatterns: ['/node_modules/', '/android/', '/ios/'],
};
