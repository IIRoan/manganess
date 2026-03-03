// Test utilities for Zedux atoms
import { createEcosystem } from '@zedux/react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Creates a test ecosystem for testing Zedux atoms
 *
 * @returns A Zedux ecosystem configured for testing
 */
export const createTestEcosystem = () => {
  return createEcosystem({
    id: 'test',
    flags: [], // Disable DevTools in tests
  });
};

/**
 * Clears all data from AsyncStorage
 * Useful for resetting state between tests
 */
export const clearTestStorage = async () => {
  await AsyncStorage.clear();
};

/**
 * Mocks AsyncStorage with predefined data
 *
 * @param data - Key-value pairs to mock in AsyncStorage
 */
export const mockAsyncStorage = (data: Record<string, string>) => {
  // Mock getItem to return predefined data
  (AsyncStorage.getItem as jest.Mock) = jest.fn((key: string) =>
    Promise.resolve(data[key] || null)
  );

  // Mock setItem to do nothing
  (AsyncStorage.setItem as jest.Mock) = jest.fn(() => Promise.resolve());

  // Mock removeItem to do nothing
  (AsyncStorage.removeItem as jest.Mock) = jest.fn(() => Promise.resolve());

  // Mock clear to do nothing
  (AsyncStorage.clear as jest.Mock) = jest.fn(() => Promise.resolve());
};
