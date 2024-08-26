import * as WebBrowser from 'expo-web-browser';
import * as Crypto from 'expo-crypto';
import { makeRedirectUri } from 'expo-auth-session';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ANILIST_CLIENT_ID, ANILIST_CLIENT_SECRET } from '@env';

const ANILIST_AUTH_URL = 'https://anilist.co/api/v2/oauth/authorize';
const ANILIST_TOKEN_URL = 'https://anilist.co/api/v2/oauth/token';
const ANILIST_API_URL = 'https://graphql.anilist.co';

interface AuthData {
  accessToken: string;
  expiresAt: number;
}

export async function loginWithAniList() {
  try {
    console.log('Starting AniList login process');

    // Generate a dynamic redirect URI
    const redirectUri = makeRedirectUri({
      scheme: 'exp',
      path: 'oauth-callback',
      preferLocalhost: false,
    });

    console.log('Redirect URI:', redirectUri);

    // Generate PKCE code verifier and challenge
    const codeVerifier = Crypto.randomUUID();
    const codeChallenge = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      codeVerifier,
      { encoding: Crypto.CryptoEncoding.BASE64 }
    );

    console.log('Code Verifier:', codeVerifier);
    console.log('Code Challenge:', codeChallenge);

    // Construct the authorization URL
    const authUrl = `${ANILIST_AUTH_URL}?client_id=${ANILIST_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&code_challenge=${encodeURIComponent(codeChallenge)}&code_challenge_method=S256`;

    console.log('Auth URL:', authUrl);

    // Open the browser for authentication
    const result = await WebBrowser.openAuthSessionAsync(
      authUrl,
      redirectUri
    );

    console.log('WebBrowser result:', result);

    if (result.type === 'success') {
      const { url } = result;
      console.log('Returned URL:', url);

      const code = new URL(url).searchParams.get('code');
      
      if (code) {
        console.log('Authorization code:', code);
        return { code, codeVerifier };
      } else {
        console.error('No code found in the returned URL');
        throw new Error('No authorization code found in the response');
      }
    } else if (result.type === 'cancel') {
      throw new Error('User cancelled the login process');
    } else {
      throw new Error(`Authentication failed: ${result.type}`);
    }
  } catch (error) {
    console.error('AniList login error:', error);
    throw error;
  } finally {
    await WebBrowser.coolDownAsync();
  }
}

export async function exchangeCodeForToken(code: string, codeVerifier: string): Promise<AuthData> {
  const redirectUri = makeRedirectUri({
    scheme: 'exp',
    path: 'oauth-callback',
    preferLocalhost: false,
  });

  console.log('Exchanging code for token...');
  console.log('Code:', code);
  console.log('Code Verifier:', codeVerifier);
  console.log('Redirect URI:', redirectUri);

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: ANILIST_CLIENT_ID,
    client_secret: ANILIST_CLIENT_SECRET,
    redirect_uri: redirectUri,
    code: code,
    code_verifier: codeVerifier,
  });

  try {
    const response = await fetch(ANILIST_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: body.toString(),
    });

    console.log('Token exchange response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Token exchange error:', errorText);
      throw new Error(`Failed to exchange code for token: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    console.log('Token exchange successful:', data);

    const authData: AuthData = {
      accessToken: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };

    await saveAuthData(authData);
    return authData;
  } catch (error) {
    console.error('Error during token exchange:', error);
    throw error;
  }
}

async function saveAuthData(authData: AuthData): Promise<void> {
  await AsyncStorage.setItem('anilistAuth', JSON.stringify(authData));
}

export async function getAuthData(): Promise<AuthData | null> {
  const authDataString = await AsyncStorage.getItem('anilistAuth');
  if (authDataString) {
    const authData: AuthData = JSON.parse(authDataString);
    if (Date.now() < authData.expiresAt) {
      return authData;
    }
  }
  return null;
}

export async function logout(): Promise<void> {
  await AsyncStorage.removeItem('anilistAuth');
}

export async function makeAniListRequest(query: string, variables: any = {}): Promise<any> {
  const authData = await getAuthData();
  if (!authData) {
    throw new Error('User is not logged in');
  }

  const response = await fetch(ANILIST_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${authData.accessToken}`,
    },
    body: JSON.stringify({
      query,
      variables,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to make AniList API request');
  }

  return response.json();
}

export async function getCurrentUser(): Promise<any> {
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