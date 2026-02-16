import http from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import open from 'open';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKEN_FILE = path.join(__dirname, '..', '.spotify-tokens.json');

const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize';
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SCOPES = 'playlist-modify-public playlist-modify-private';

interface TokenData {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

function generateCodeVerifier(): string {
  return randomBytes(32).toString('base64url');
}

function generateCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

async function loadCachedTokens(): Promise<TokenData | null> {
  try {
    const data = await fs.readFile(TOKEN_FILE, 'utf-8');
    return JSON.parse(data) as TokenData;
  } catch {
    return null;
  }
}

async function saveCachedTokens(tokens: TokenData): Promise<void> {
  await fs.writeFile(TOKEN_FILE, JSON.stringify(tokens, null, 2));
}

async function refreshAccessToken(clientId: string, refreshToken: string): Promise<TokenData> {
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
  });

  const response = await fetch(SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Token refresh failed (${response.status}): ${errorBody}`);
  }

  const data = await response.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  const tokens: TokenData = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || refreshToken,
    expires_at: Date.now() + data.expires_in * 1000,
  };

  await saveCachedTokens(tokens);
  return tokens;
}

function runAuthorizationFlow(clientId: string, redirectUri: string): Promise<TokenData> {
  return new Promise((resolve, reject) => {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = randomBytes(16).toString('hex');

    const parsedRedirect = new URL(redirectUri);
    const port = parseInt(parsedRedirect.port, 10) || 8888;

    const server = http.createServer(async (req: http.IncomingMessage, res: http.ServerResponse) => {
      if (!req.url?.startsWith(parsedRedirect.pathname)) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      const url = new URL(req.url, redirectUri);
      const code = url.searchParams.get('code');
      const returnedState = url.searchParams.get('state');
      const error = url.searchParams.get('error');

      if (error) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body><h2>Authorization denied.</h2><p>You can close this window.</p></body></html>');
        server.close();
        reject(new Error(`Authorization denied: ${error}`));
        return;
      }

      if (returnedState !== state) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<html><body><h2>State mismatch error.</h2></body></html>');
        server.close();
        reject(new Error('State mismatch'));
        return;
      }

      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<html><body><h2>No authorization code received.</h2></body></html>');
        server.close();
        reject(new Error('No authorization code'));
        return;
      }

      // Exchange code for tokens
      try {
        const params = new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
          client_id: clientId,
          code_verifier: codeVerifier,
        });

        const tokenResponse = await fetch(SPOTIFY_TOKEN_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString(),
        });

        if (!tokenResponse.ok) {
          const errorBody = await tokenResponse.text();
          throw new Error(`Token exchange failed (${tokenResponse.status}): ${errorBody}`);
        }

        const data = await tokenResponse.json() as {
          access_token: string;
          refresh_token: string;
          expires_in: number;
        };

        const tokens: TokenData = {
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          expires_at: Date.now() + data.expires_in * 1000,
        };

        await saveCachedTokens(tokens);

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body><h2>Authorization successful!</h2><p>You can close this window and return to the terminal.</p></body></html>');
        server.close();
        resolve(tokens);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/html' });
        res.end('<html><body><h2>Token exchange failed.</h2></body></html>');
        server.close();
        reject(err);
      }
    });

    server.listen(port, () => {
      const authParams = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        scope: SCOPES,
        redirect_uri: redirectUri,
        state,
        code_challenge_method: 'S256',
        code_challenge: codeChallenge,
      });

      const authUrl = `${SPOTIFY_AUTH_URL}?${authParams.toString()}`;
      console.log('🔐 Opening browser for Spotify authorization...');
      console.log(`   If the browser doesn't open, visit: ${authUrl}\n`);
      open(authUrl);
    });

    // Timeout after 2 minutes
    setTimeout(() => {
      server.close();
      reject(new Error('Authorization timed out after 2 minutes'));
    }, 120_000);
  });
}

/**
 * Get a valid Spotify user access token.
 * Checks cache first, refreshes if expired, or runs full auth flow.
 */
export async function getUserAccessToken(clientId: string, redirectUri: string): Promise<string> {
  // Try cached tokens
  const cached = await loadCachedTokens();

  if (cached) {
    // Check if token is still valid (with 60s buffer)
    if (cached.expires_at > Date.now() + 60_000) {
      return cached.access_token;
    }

    // Try to refresh
    console.log('🔄 Refreshing Spotify access token...');
    try {
      const refreshed = await refreshAccessToken(clientId, cached.refresh_token);
      console.log('✅ Token refreshed successfully\n');
      return refreshed.access_token;
    } catch (err) {
      console.log('⚠️  Refresh failed, starting new authorization flow...\n');
    }
  }

  // Full authorization flow
  const tokens = await runAuthorizationFlow(clientId, redirectUri);
  console.log('✅ Authorization successful\n');
  return tokens.access_token;
}

// Allow running standalone: `npm run auth`
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const dotenv = await import('dotenv');
  dotenv.config();

  const clientId = process.env.CLIENT_ID;
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI || 'http://localhost:8888/callback';

  if (!clientId) {
    console.error('❌ CLIENT_ID not set in .env');
    process.exit(1);
  }

  try {
    const token = await getUserAccessToken(clientId, redirectUri);
    console.log('🎉 Access token obtained successfully.');
    console.log(`   Token (first 20 chars): ${token.substring(0, 20)}...`);
  } catch (err) {
    console.error('❌ Authorization failed:', (err as Error).message);
    process.exit(1);
  }
}
