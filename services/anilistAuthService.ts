import AsyncStorage from '@react-native-async-storage/async-storage';

interface AniListAuthData {
  accessToken: string;
  expiresAt: number;
  lastUpdated: number;
}

const AUTH_KEY = 'anilist_auth';

const debug = (message: string, data?: any) => {
  console.log(`[AniList Auth] ${message}`, data || '');
};

export async function saveAuthData(
  authData: Omit<AniListAuthData, 'lastUpdated'>
): Promise<void> {
  try {
    debug('Saving auth data');
    const data: AniListAuthData = {
      ...authData,
      lastUpdated: Date.now(),
    };
    await AsyncStorage.setItem(AUTH_KEY, JSON.stringify(data));
    debug('Auth data saved successfully');
  } catch (error) {
    debug('Error saving auth data:', error);
    throw error;
  }
}

export async function getAuthData(): Promise<AniListAuthData | null> {
  try {
    debug('Getting auth data from storage');
    const authDataString = await AsyncStorage.getItem(AUTH_KEY);

    if (authDataString) {
      const authData: AniListAuthData = JSON.parse(authDataString);
      debug('Auth data found, checking expiration');

      if (Date.now() < authData.expiresAt) {
        debug('Auth data valid');
        return authData;
      }

      debug('Auth data expired');
      await clearAuthData();
    } else {
      debug('No auth data found');
    }

    return null;
  } catch (error) {
    debug('Error getting auth data:', error);
    return null;
  }
}

export async function clearAuthData(): Promise<void> {
  try {
    debug('Clearing auth data');
    await AsyncStorage.removeItem(AUTH_KEY);
    debug('Auth data cleared successfully');
  } catch (error) {
    debug('Error clearing auth data:', error);
    throw error;
  }
}

export async function isAuthenticated(): Promise<boolean> {
  try {
    const authData = await getAuthData();
    return !!authData && Date.now() < authData.expiresAt;
  } catch (error) {
    debug('Error checking authentication status:', error);
    return false;
  }
}
