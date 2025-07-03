import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import { saveAuthData, getAuthData, clearAuthData } from './anilistAuthService';

const debug = (message: string, data?: any) => {
  console.log(`[AniList OAuth] ${message}`, data || '');
};

const ANILIST_CLIENT_ID = '20599';
const ANILIST_AUTH_URL = 'https://anilist.co/api/v2/oauth/authorize';
const ANILIST_API_URL = 'https://graphql.anilist.co';

const parseHashParams = (hash: string) => {
  return hash.split('&').reduce((params: any, param) => {
    const [key, value] = param.split('=');
    if (key) {
      params[key] = value;
    }
    return params;
  }, {});
};

export async function loginWithAniList() {
  try {
    debug('Starting login process');

    const redirectUri =
      Constants.appOwnership === 'expo'
        ? 'https://auth.expo.io/@iroan/manganess'
        : 'com.iroan.manganess://oauth';

    const authUrl = `${ANILIST_AUTH_URL}?client_id=${ANILIST_CLIENT_ID}&response_type=token`;

    debug('Auth URL:', authUrl);
    debug('Redirect URI:', redirectUri);

    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);
    debug('Auth result:', result);

    if (result.type === 'success' && result.url) {
      const hashPart = result.url.split('#')[1];
      debug('URL hash part:', hashPart);

      if (!hashPart) {
        throw new Error('No hash fragment in redirect URL');
      }

      const params = parseHashParams(hashPart);
      debug('Parsed params:', params);

      if (!params.access_token) {
        throw new Error('No access token in response');
      }

      const authData = {
        accessToken: params.access_token,
        expiresAt:
          Date.now() +
          (params.expires_in
            ? parseInt(params.expires_in) * 1000
            : 365 * 24 * 60 * 60 * 1000),
      };

      debug('Saving auth data');
      await saveAuthData(authData);

      return authData;
    }

    throw new Error(`Authentication failed: ${result.type}`);
  } catch (error) {
    debug('Login error:', error);
    throw error;
  }
}

export { getAuthData };

export async function logout(): Promise<void> {
  try {
    debug('Logging out');
    await clearAuthData();
    debug('Logged out successfully');
  } catch (error) {
    debug('Error during logout:', error);
    throw error;
  }
}

export async function makeAniListRequest(
  query: string,
  variables: any = {}
): Promise<any> {
  debug('Making API request', { query, variables });

  const authData = await getAuthData();
  if (!authData) {
    debug('No auth data found for request');
    throw new Error('User is not logged in');
  }

  debug('Sending request to AniList API');
  const response = await fetch(ANILIST_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${authData.accessToken}`,
    },
    body: JSON.stringify({
      query,
      variables,
    }),
  });

  const data = await response.json();
  debug('API response received:', data);

  if (!response.ok) {
    debug('API request failed:', data.errors);
    throw new Error(
      data.errors?.[0]?.message || 'Failed to make AniList API request'
    );
  }

  return data;
}

export async function getCurrentUser(): Promise<any> {
  debug('Getting current user');
  const query = `
    query {
      Viewer {
        id
        name
        avatar {
          large
        }
      }
    }
  `;

  return makeAniListRequest(query);
}
