import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';
import { parseFile } from 'music-metadata';
import { AUDIO_EXTENSIONS } from './common.js';

const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/api/token';
const SPOTIFY_API_URL = 'https://api.spotify.com/v1';

/**
 * Get Spotify access token using Client Credentials flow
 */
export async function getClientCredentialsToken(clientId, clientSecret) {
  try {
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const response = await axios.post(
      SPOTIFY_AUTH_URL,
      'grant_type=client_credentials',
      {
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    return response.data.access_token;
  } catch (error) {
    console.error('Error getting Spotify access token:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
    throw error;
  }
}

/**
 * Clean and normalize search strings for better matching
 */
export function cleanSearchString(str) {
  if (!str) return '';

  // Remove common mix/version suffixes
  let cleaned = str.replace(/\s*\((Original Mix|Extended Mix|Radio Edit|Club Mix|Remix|Edit|Dub|Instrumental)\)/gi, '');

  // Trim whitespace
  cleaned = cleaned.trim();

  return cleaned;
}

/**
 * Extract primary artist from multi-artist string
 */
export function getPrimaryArtist(artistString) {
  if (!artistString) return '';

  // Split by common delimiters and take the first artist
  const delimiters = [',', ' & ', ' feat. ', ' ft. ', ' featuring ', ' vs ', ' x '];

  for (const delimiter of delimiters) {
    if (artistString.includes(delimiter)) {
      return artistString.split(delimiter)[0].trim();
    }
  }

  return artistString.trim();
}

/**
 * Validate if Spotify result artists match the search artist
 */
export function validateArtistMatch(searchArtist, spotifyArtists) {
  const searchArtistLower = searchArtist.toLowerCase().trim();

  // Split by comma for multiple artists
  const searchArtistNames = searchArtistLower.split(',').map(a => a.trim());

  // Check if any Spotify artist matches any search artist
  return spotifyArtists.some(spotifyArtist => {
    const spotifyArtistLower = spotifyArtist.name.toLowerCase().trim();

    return searchArtistNames.some(searchName => {
      // Exact match or one contains the other
      return spotifyArtistLower === searchName ||
             spotifyArtistLower.includes(searchName) ||
             searchName.includes(spotifyArtistLower);
    });
  });
}

/**
 * Calculate string similarity between two strings (0-1)
 */
export function stringSimilarity(str1, str2) {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();

  // Exact match
  if (s1 === s2) return 1.0;

  // One contains the other
  if (s1.includes(s2) || s2.includes(s1)) return 0.8;

  // Word overlap calculation
  const words1 = s1.split(/\s+/);
  const words2 = s2.split(/\s+/);
  const commonWords = words1.filter(w => words2.includes(w) && w.length > 2); // Ignore very short words

  if (words1.length === 0 || words2.length === 0) return 0;

  return commonWords.length / Math.max(words1.length, words2.length);
}

/**
 * Search for a track on Spotify
 */
export async function searchSpotifyTrack(accessToken, artist, track) {
  try {
    // Try exact search first
    let query = `artist:${artist} track:${track}`;

    let response = await axios.get(`${SPOTIFY_API_URL}/search`, {
      params: {
        q: query,
        type: 'track',
        limit: 1
      },
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (response.data.tracks.items.length > 0) {
      return response.data.tracks.items[0];
    }

    // Try with cleaned track name (remove mix suffixes)
    const cleanedTrack = cleanSearchString(track);
    if (cleanedTrack !== track) {
      query = `artist:${artist} track:${cleanedTrack}`;

      response = await axios.get(`${SPOTIFY_API_URL}/search`, {
        params: {
          q: query,
          type: 'track',
          limit: 1
        },
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (response.data.tracks.items.length > 0) {
        return response.data.tracks.items[0];
      }
    }

    // Try with primary artist only
    const primaryArtist = getPrimaryArtist(artist);
    if (primaryArtist !== artist) {
      query = `artist:${primaryArtist} track:${cleanedTrack}`;

      response = await axios.get(`${SPOTIFY_API_URL}/search`, {
        params: {
          q: query,
          type: 'track',
          limit: 1
        },
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (response.data.tracks.items.length > 0) {
        return response.data.tracks.items[0];
      }
    }

    // Last resort: general search without artist: and track: prefixes
    query = `${primaryArtist} ${cleanedTrack}`;

    response = await axios.get(`${SPOTIFY_API_URL}/search`, {
      params: {
        q: query,
        type: 'track',
        limit: 1
      },
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (response.data.tracks.items.length > 0) {
      return response.data.tracks.items[0];
    }

    return null;
  } catch (error) {
    console.error(`Error searching for ${artist} - ${track}:`, error.message);
    return null;
  }
}

/**
 * Search for an album on Spotify
 */
export async function searchSpotifyAlbum(accessToken, artist, album) {
  try {
    // Try exact search first
    let query = `artist:${artist} album:${album}`;

    let response = await axios.get(`${SPOTIFY_API_URL}/search`, {
      params: {
        q: query,
        type: 'album',
        limit: 1
      },
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (response.data.albums.items.length > 0) {
      const albumResult = response.data.albums.items[0];

      // Validate artist match
      if (!validateArtistMatch(artist, albumResult.artists)) {
        console.log(`   ⚠️  Rejected: Artist mismatch (found: ${albumResult.artists[0].name})`);
        return null;
      }

      // Validate album name similarity
      const similarity = stringSimilarity(album, albumResult.name);
      if (similarity < 0.3) {
        console.log(`   ⚠️  Rejected: Album name too different (${(similarity * 100).toFixed(0)}% match)`);
        console.log(`   Searched: "${album}" vs Found: "${albumResult.name}"`);
        return null;
      }

      return albumResult;
    }

    // Try with cleaned album name
    const cleanedAlbum = cleanSearchString(album);
    if (cleanedAlbum !== album) {
      query = `artist:${artist} album:${cleanedAlbum}`;

      response = await axios.get(`${SPOTIFY_API_URL}/search`, {
        params: {
          q: query,
          type: 'album',
          limit: 1
        },
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (response.data.albums.items.length > 0) {
        const albumResult = response.data.albums.items[0];

        // Validate artist match
        if (!validateArtistMatch(artist, albumResult.artists)) {
          console.log(`   ⚠️  Rejected: Artist mismatch (found: ${albumResult.artists[0].name})`);
          return null;
        }

        // Validate album name similarity
        const similarity = stringSimilarity(album, albumResult.name);
        if (similarity < 0.3) {
          console.log(`   ⚠️  Rejected: Album name too different (${(similarity * 100).toFixed(0)}% match)`);
          console.log(`   Searched: "${album}" vs Found: "${albumResult.name}"`);
          return null;
        }

        return albumResult;
      }
    }

    // Try with primary artist only
    const primaryArtist = getPrimaryArtist(artist);
    if (primaryArtist !== artist) {
      query = `artist:${primaryArtist} album:${cleanedAlbum}`;

      response = await axios.get(`${SPOTIFY_API_URL}/search`, {
        params: {
          q: query,
          type: 'album',
          limit: 1
        },
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (response.data.albums.items.length > 0) {
        const albumResult = response.data.albums.items[0];

        // Validate artist match
        if (!validateArtistMatch(artist, albumResult.artists)) {
          console.log(`   ⚠️  Rejected: Artist mismatch (found: ${albumResult.artists[0].name})`);
          return null;
        }

        // Validate album name similarity
        const similarity = stringSimilarity(album, albumResult.name);
        if (similarity < 0.3) {
          console.log(`   ⚠️  Rejected: Album name too different (${(similarity * 100).toFixed(0)}% match)`);
          console.log(`   Searched: "${album}" vs Found: "${albumResult.name}"`);
          return null;
        }

        return albumResult;
      }
    }

    // Last resort: general search
    query = `${primaryArtist} ${cleanedAlbum}`;

    response = await axios.get(`${SPOTIFY_API_URL}/search`, {
      params: {
        q: query,
        type: 'album',
        limit: 1
      },
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (response.data.albums.items.length > 0) {
      const albumResult = response.data.albums.items[0];

      // Validate artist match (more lenient for last resort)
      if (!validateArtistMatch(artist, albumResult.artists)) {
        console.log(`   ⚠️  Rejected: Artist mismatch (found: ${albumResult.artists[0].name})`);
        return null;
      }

      // Validate album name similarity (more lenient threshold for last resort)
      const similarity = stringSimilarity(album, albumResult.name);
      if (similarity < 0.2) {
        console.log(`   ⚠️  Rejected: Album name too different (${(similarity * 100).toFixed(0)}% match)`);
        console.log(`   Searched: "${album}" vs Found: "${albumResult.name}"`);
        return null;
      }

      return albumResult;
    }

    return null;
  } catch (error) {
    console.error(`Error searching for ${artist} - ${album}:`, error.message);
    return null;
  }
}

/**
 * Get detailed album information from Spotify
 */
export async function getSpotifyAlbum(accessToken, albumId) {
  try {
    const response = await axios.get(`${SPOTIFY_API_URL}/albums/${albumId}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    return response.data;
  } catch (error) {
    console.error(`Error getting album ${albumId}:`, error.message);
    return null;
  }
}

/**
 * Get artist information from Spotify (for genres)
 */
export async function getSpotifyArtist(accessToken, artistId) {
  try {
    const response = await axios.get(`${SPOTIFY_API_URL}/artists/${artistId}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    return response.data;
  } catch (error) {
    console.error(`Error fetching artist info from Spotify: ${error.message}`);
    return null;
  }
}

/**
 * Get all audio files from directory recursively
 */
export async function getAudioFiles(directory) {
  let audioFiles = [];

  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        // Recursively scan subdirectories
        const subDirFiles = await getAudioFiles(fullPath);
        audioFiles = audioFiles.concat(subDirFiles);
      } else if (entry.isFile()) {
        // Check if file has audio extension
        const ext = path.extname(entry.name).toLowerCase();
        if (AUDIO_EXTENSIONS.includes(ext)) {
          audioFiles.push(fullPath);
        }
      }
    }

    return audioFiles;
  } catch (error) {
    console.error(`Error reading directory ${directory}:`, error.message);
    return [];
  }
}

/**
 * Extract artist, track name, and album from metadata
 */
export async function extractMetadata(filePath) {
  try {
    const metadata = await parseFile(filePath);
    const common = metadata.common;

    // Get label from either 'label' or 'publisher' field (different tag formats use different names)
    const labelValue = common.label || common.publisher;
    const label = Array.isArray(labelValue) ? labelValue.join(', ') : (labelValue || null);

    return {
      title: common.title || null,
      artist: common.artist || common.albumartist || null,
      album: common.album || null,
      genre: Array.isArray(common.genre) ? common.genre.join(', ') : (common.genre || null),
      label: label,
      bpm: common.bpm || null,
      artwork: (common.picture && common.picture.length > 0) || null,
      releaseDate: common.date || common.originaldate || common.year?.toString() || null,
      fileName: path.basename(filePath),
    };
  } catch (error) {
    console.error(`Error reading metadata from ${filePath}:`, error.message);
    return {
      title: null,
      artist: null,
      album: null,
      genre: null,
      label: null,
      bpm: null,
      artwork: null,
      releaseDate: null,
      fileName: path.basename(filePath)
    };
  }
}
