import axios from 'axios';
import type { SpotifyAlbumData, SpotifyArtistData } from './types.ts';

const SPOTIFY_API_URL = 'https://api.spotify.com/v1';

export async function getSpotifyAlbum(
  accessToken: string,
  albumId: string,
): Promise<SpotifyAlbumData | null> {
  try {
    const response = await axios.get(`${SPOTIFY_API_URL}/albums/${albumId}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    return response.data;
  } catch {
    return null;
  }
}

export async function getSpotifyArtist(
  accessToken: string,
  artistId: string,
): Promise<SpotifyArtistData | null> {
  try {
    const response = await axios.get(`${SPOTIFY_API_URL}/artists/${artistId}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    return response.data;
  } catch {
    return null;
  }
}
