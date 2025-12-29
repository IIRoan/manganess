import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  saveAuthData,
  getAuthData,
  clearAuthData,
  isAuthenticated,
} from '../anilistAuthService';

const AUTH_KEY = 'anilist_auth';

describe('anilistAuthService', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  it('saves auth data with lastUpdated timestamp', async () => {
    const start = Date.now();
    await saveAuthData({ accessToken: 'token-123', expiresAt: start + 1000 });

    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      AUTH_KEY,
      expect.any(String)
    );

    const stored = await AsyncStorage.getItem(AUTH_KEY);
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(parsed.accessToken).toBe('token-123');
    expect(parsed.expiresAt).toBe(start + 1000);
    expect(typeof parsed.lastUpdated).toBe('number');
    expect(parsed.lastUpdated).toBeGreaterThanOrEqual(start);
  });

  it('returns auth data when not expired', async () => {
    const payload = {
      accessToken: 'aaa',
      expiresAt: Date.now() + 10_000,
      lastUpdated: Date.now(),
    };
    await AsyncStorage.setItem(AUTH_KEY, JSON.stringify(payload));

    const result = await getAuthData();
    expect(result).toEqual(payload);
  });

  it('returns null and clears storage when auth data expired', async () => {
    const payload = {
      accessToken: 'bbb',
      expiresAt: Date.now() - 1,
      lastUpdated: Date.now(),
    };
    await AsyncStorage.setItem(AUTH_KEY, JSON.stringify(payload));

    const result = await getAuthData();
    expect(result).toBeNull();
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith(AUTH_KEY);
  });

  it('clears auth data explicitly', async () => {
    await AsyncStorage.setItem(AUTH_KEY, JSON.stringify({ foo: 'bar' }));
    await clearAuthData();

    expect(AsyncStorage.removeItem).toHaveBeenCalledWith(AUTH_KEY);
    const stored = await AsyncStorage.getItem(AUTH_KEY);
    expect(stored).toBeNull();
  });

  it('reports authentication status correctly', async () => {
    expect(await isAuthenticated()).toBe(false);

    await saveAuthData({
      accessToken: 'ccc',
      expiresAt: Date.now() + 10_000,
    });

    expect(await isAuthenticated()).toBe(true);

    await saveAuthData({
      accessToken: 'ddd',
      expiresAt: Date.now() - 10,
    });

    expect(await isAuthenticated()).toBe(false);
  });

  describe('error handling', () => {
    it('throws error when saveAuthData fails', async () => {
      jest
        .spyOn(AsyncStorage, 'setItem')
        .mockRejectedValueOnce(new Error('Storage error'));

      await expect(
        saveAuthData({ accessToken: 'test', expiresAt: Date.now() + 1000 })
      ).rejects.toThrow('Storage error');
    });

    it('returns null when getAuthData fails', async () => {
      jest
        .spyOn(AsyncStorage, 'getItem')
        .mockRejectedValueOnce(new Error('Storage error'));

      const result = await getAuthData();
      expect(result).toBeNull();
    });

    it('throws error when clearAuthData fails', async () => {
      jest
        .spyOn(AsyncStorage, 'removeItem')
        .mockRejectedValueOnce(new Error('Storage error'));

      await expect(clearAuthData()).rejects.toThrow('Storage error');
    });

    it('returns false when isAuthenticated encounters an error', async () => {
      jest
        .spyOn(AsyncStorage, 'getItem')
        .mockRejectedValueOnce(new Error('Storage error'));

      const result = await isAuthenticated();
      expect(result).toBe(false);
    });

    it('returns null when no auth data exists', async () => {
      const result = await getAuthData();
      expect(result).toBeNull();
    });
  });
});
