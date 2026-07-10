import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  clearLibraryDataChangedFlag,
  markLibraryDataChanged,
} from '@/services/appLibraryRefreshService';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

describe('appLibraryRefreshService', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('marks and clears the bookmark changed flag', async () => {
    await markLibraryDataChanged();
    expect(await AsyncStorage.getItem('bookmarkChanged')).toBe('true');

    await clearLibraryDataChangedFlag();
    expect(await AsyncStorage.getItem('bookmarkChanged')).toBe('false');
  });
});
