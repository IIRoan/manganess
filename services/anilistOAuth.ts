import * as WebBrowser from 'expo-web-browser';
import * as Crypto from 'expo-crypto';
import * as AuthSession from 'expo-auth-session';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ANILIST_CLIENT_SECRET } from './env';

WebBrowser.maybeCompleteAuthSession();

const ANILIST_CLIENT_ID = '20599'; 
const ANILIST_AUTH_URL = 'https://anilist.co/api/v2/oauth/authorize';
const ANILIST_TOKEN_URL = 'https://anilist.co/api/v2/oauth/token';
const ANILIST_API_URL = 'https://graphql.anilist.co';


interface AuthData {
  accessToken: string;
  expiresAt: number;
}

export async function loginWithAniList(): Promise<AuthData> {
  try {
    console.log('Starting AniList login process');

    const redirectUri = AuthSession.makeRedirectUri({
      native: 'com.iroan.manganess://oauth',
    });
    console.log('Redirect URI:', redirectUri);

    const codeVerifier = Crypto.randomUUID();
    const codeChallenge = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      codeVerifier,
      { encoding: Crypto.CryptoEncoding.BASE64 }
    );

    console.log('Code Verifier:', codeVerifier);
    console.log('Code Challenge:', codeChallenge);

    const request = new AuthSession.AuthRequest({
      clientId: ANILIST_CLIENT_ID,
      scopes: [],
      redirectUri,
      responseType: AuthSession.ResponseType.Code,
      codeChallengeMethod: AuthSession.CodeChallengeMethod.S256,
      codeChallenge,
      usePKCE: true,
    });

    const result = await request.promptAsync({
      authorizationEndpoint: ANILIST_AUTH_URL,
    });

    console.log('Auth result:', JSON.stringify(result, null, 2));

    if (result.type === 'success' && result.params.code) {
      console.log('Received authorization code:', result.params.code);
      const tokenResult = await exchangeCodeForToken(result.params.code, codeVerifier, redirectUri);
      console.log('Token exchange result:', JSON.stringify(tokenResult, null, 2));
      
      const authData: AuthData = {
        accessToken: tokenResult.access_token,
        expiresAt: Date.now() + tokenResult.expires_in * 1000,
      };

      await saveAuthData(authData);
      return authData;
    } else if (result.type === 'error') {
      console.error('Authorization error:', result.error);
      throw new Error(`Authorization failed: ${result.error?.description || 'Unknown error'}`);
    } else {
      console.error('Login failed. Result:', JSON.stringify(result, null, 2));
      throw new Error('Login failed');
    }
  } catch (error) {
    console.error('AniList login error:', error);
    throw error;
  }
}

async function exchangeCodeForToken(code: string, codeVerifier: string, redirectUri: string): Promise<any> {
  console.log('Exchanging code for token');
  console.log('Code:', code);
  console.log('Code Verifier:', codeVerifier);
  console.log('Redirect URI:', redirectUri);

  const response = await fetch(ANILIST_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: ANILIST_CLIENT_ID,
      client_secret: ANILIST_CLIENT_SECRET,
      redirect_uri: redirectUri,
      code: code,
      code_verifier: codeVerifier,
    }),
  });

  const responseText = await response.text();
  console.log('Token exchange response:', responseText);

  if (!response.ok) {
    throw new Error(`Failed to exchange code for token: ${response.status} ${response.statusText}`);
  }

  return JSON.parse(responseText);
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
