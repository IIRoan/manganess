import { loginWithAniList, logout, makeAniListRequest, getCurrentUser } from '../anilistOAuth';
import { saveAuthData, getAuthData, clearAuthData } from '../anilistAuthService';

jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: jest.fn(),
}));

jest.mock('expo-constants', () => ({
  appOwnership: 'expo',
}));

jest.mock('../anilistAuthService', () => ({
  saveAuthData: jest.fn(),
  getAuthData: jest.fn(),
  clearAuthData: jest.fn(),
}));

const mockOpenAuthSessionAsync = require('expo-web-browser').openAuthSessionAsync as jest.Mock;

describe('anilistOAuth', () => {
  const originalDateNow = Date.now;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
    Date.now = jest.fn(() => 1_000_000);
  });

  afterEach(() => {
    Date.now = originalDateNow;
  });

  it('completes login flow and saves auth data', async () => {
    mockOpenAuthSessionAsync.mockResolvedValue({
      type: 'success',
      url: 'com.iroan.manganess://oauth#access_token=test-token&expires_in=3600',
    });

    const result = await loginWithAniList();

    expect(mockOpenAuthSessionAsync).toHaveBeenCalledWith(
      expect.stringContaining('https://anilist.co/api/v2/oauth/authorize'),
      'https://auth.expo.io/@iroan/manganess'
    );
    expect(saveAuthData).toHaveBeenCalledWith({
      accessToken: 'test-token',
      expiresAt: 1_000_000 + 3600 * 1000,
    });
    expect(result).toEqual({
      accessToken: 'test-token',
      expiresAt: 1_000_000 + 3600 * 1000,
    });
  });

  it('throws when authentication fails', async () => {
    mockOpenAuthSessionAsync.mockResolvedValue({ type: 'cancel' });

    await expect(loginWithAniList()).rejects.toThrow('Authentication failed: cancel');
    expect(saveAuthData).not.toHaveBeenCalled();
  });

  it('logs out by clearing auth data', async () => {
    await logout();
    expect(clearAuthData).toHaveBeenCalled();
  });

  it('makes authorized AniList request', async () => {
    (getAuthData as jest.Mock).mockResolvedValue({
      accessToken: 'abc',
      expiresAt: Date.now() + 1000,
    });

    const mockResponse = {
      ok: true,
      json: () => Promise.resolve({ data: { viewer: { id: 1 } } }),
    } as any;
    (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

    const data = await makeAniListRequest('query Test', { var: 1 });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://graphql.anilist.co',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer abc',
        }),
        body: JSON.stringify({ query: 'query Test', variables: { var: 1 } }),
      })
    );
    expect(data).toEqual({ data: { viewer: { id: 1 } } });
  });

  it('throws when request fails or user not logged in', async () => {
    (getAuthData as jest.Mock).mockResolvedValue(null);

    await expect(makeAniListRequest('query', {})).rejects.toThrow('User is not logged in');

    (getAuthData as jest.Mock).mockResolvedValue({ accessToken: 'abc', expiresAt: Date.now() + 1000 });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ errors: [{ message: 'Boom' }] }),
    });

    await expect(makeAniListRequest('query', {})).rejects.toThrow('Boom');
  });

  it('fetches current user profile from AniList', async () => {
    (getAuthData as jest.Mock).mockResolvedValue({
      accessToken: 'token-xyz',
      expiresAt: Date.now() + 1000,
    });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ data: { Viewer: { id: 42, name: 'User' } } }),
    });

    const result = await getCurrentUser();

    expect(global.fetch).toHaveBeenCalledWith(
      'https://graphql.anilist.co',
      expect.objectContaining({
        body: expect.stringContaining('Viewer'),
      })
    );
    expect(result).toEqual({ data: { Viewer: { id: 42, name: 'User' } } });
  });
});
