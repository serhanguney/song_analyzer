import axios from 'axios';

const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/api/token';

export async function getClientCredentialsToken(
  clientId: string,
  clientSecret: string,
): Promise<string> {
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const response = await axios.post(
    SPOTIFY_AUTH_URL,
    'grant_type=client_credentials',
    {
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    },
  );

  return response.data.access_token;
}
