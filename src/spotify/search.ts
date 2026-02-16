import axios from 'axios';
import { cleanSearchString, getPrimaryArtist, validateArtistMatch, stringSimilarity } from './matching.ts';
import type { SpotifyTrackData, SpotifyAlbumData, SearchResult } from './types.ts';

const SPOTIFY_API_URL = 'https://api.spotify.com/v1';

interface SpotifySearchParams {
  accessToken: string;
  query: string;
  type: 'track' | 'album';
}

async function spotifySearch<T>(params: SpotifySearchParams): Promise<T | null> {
  const response = await axios.get(`${SPOTIFY_API_URL}/search`, {
    params: {
      q: params.query,
      type: params.type,
      limit: 1,
    },
    headers: { 'Authorization': `Bearer ${params.accessToken}` },
  });

  const resultKey = params.type === 'track' ? 'tracks' : 'albums';
  const items = response.data[resultKey]?.items;

  if (items && items.length > 0) return items[0];
  return null;
}

function buildSearchStrategies(
  artist: string,
  name: string,
  type: 'track' | 'album',
): string[] {
  const prefix = type === 'track' ? 'track' : 'album';
  const cleanedName = cleanSearchString(name);
  const primaryArtist = getPrimaryArtist(artist);

  const strategies: string[] = [
    `artist:${artist} ${prefix}:${name}`,
  ];

  if (cleanedName !== name) {
    strategies.push(`artist:${artist} ${prefix}:${cleanedName}`);
  }

  if (primaryArtist !== artist) {
    strategies.push(`artist:${primaryArtist} ${prefix}:${cleanedName}`);
  }

  // Last resort: general search without field prefixes
  strategies.push(`${primaryArtist} ${cleanedName}`);

  return strategies;
}

export async function searchSpotifyTrack(
  accessToken: string,
  artist: string,
  track: string,
): Promise<SpotifyTrackData | null> {
  try {
    const strategies = buildSearchStrategies(artist, track, 'track');

    for (const query of strategies) {
      const result = await spotifySearch<SpotifyTrackData>({
        accessToken,
        query,
        type: 'track',
      });
      if (result) return result;
    }

    return null;
  } catch {
    return null;
  }
}

interface AlbumValidation {
  similarityThreshold: number;
}

function validateAlbumResult(
  album: SpotifyAlbumData,
  artist: string,
  searchAlbumName: string,
  validation: AlbumValidation,
): SearchResult<SpotifyAlbumData> {
  if (!validateArtistMatch(artist, album.artists)) {
    return {
      data: null,
      rejected: {
        reason: 'Artist mismatch',
        details: `found: ${album.artists[0]?.name}`,
      },
    };
  }

  const similarity = stringSimilarity(searchAlbumName, album.name);
  if (similarity < validation.similarityThreshold) {
    return {
      data: null,
      rejected: {
        reason: 'Album name too different',
        details: `${(similarity * 100).toFixed(0)}% match — searched: "${searchAlbumName}" vs found: "${album.name}"`,
      },
    };
  }

  return { data: album };
}

export async function searchSpotifyAlbum(
  accessToken: string,
  artist: string,
  album: string,
): Promise<SearchResult<SpotifyAlbumData>> {
  try {
    const strategies = buildSearchStrategies(artist, album, 'album');

    for (let i = 0; i < strategies.length; i++) {
      const result = await spotifySearch<SpotifyAlbumData>({
        accessToken,
        query: strategies[i],
        type: 'album',
      });

      if (result) {
        const isLastResort = i === strategies.length - 1;
        const validation = validateAlbumResult(result, artist, album, {
          similarityThreshold: isLastResort ? 0.2 : 0.3,
        });

        if (validation.data) return validation;
        // On rejection, continue to next strategy (except last)
        if (isLastResort) return validation;
      }
    }

    return { data: null };
  } catch {
    return { data: null };
  }
}
