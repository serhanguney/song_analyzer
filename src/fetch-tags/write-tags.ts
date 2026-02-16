import path from 'node:path';
import axios from 'axios';
import NodeID3 from 'node-id3';
import { getSpotifyArtist } from '../spotify.js';
import { isValidReleaseDateFormat } from './scan.ts';
import type {
  ParsedReleaseDate,
  SpotifyAlbumData,
  SpotifyTrackData,
} from './types.ts';

export function parseReleaseDate(
  dateString: string | null | undefined,
  precision: string,
): ParsedReleaseDate | null {
  if (!dateString || (typeof dateString === 'string' && dateString.trim() === '')) {
    return null;
  }

  let date: Date;
  if (precision === 'year') {
    date = new Date(`${dateString}-01-01`);
  } else if (precision === 'month') {
    date = new Date(`${dateString}-01`);
  } else {
    date = new Date(dateString);
  }

  if (isNaN(date.getTime())) return null;

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');

  return { full: dateString, formatted: `${year}/${month}`, precision };
}

export async function resolveGenres(
  accessToken: string,
  spotifyData: SpotifyAlbumData,
  trackData: SpotifyTrackData | null,
): Promise<{ genres: string[]; source: string | null }> {
  if (spotifyData.genres?.length > 0) {
    return { genres: spotifyData.genres, source: 'album' };
  }

  if (trackData?.artists && trackData.artists.length > 0) {
    try {
      const artistData = await getSpotifyArtist(accessToken, trackData.artists[0].id);
      if (artistData?.genres?.length > 0) {
        return { genres: artistData.genres, source: 'artist' };
      }
    } catch {
      // Genre fetch failed, continue without
    }
  }

  return { genres: [], source: null };
}

export function buildTags(
  spotifyData: SpotifyAlbumData,
  trackData: SpotifyTrackData | null,
  missingFields: string[],
  existingReleaseDate: string | null,
  resolvedGenres: string[],
): { tags: Record<string, unknown>; fieldsFilledIn: string[] } {
  const tags: Record<string, unknown> = {};
  const fieldsFilledIn: string[] = [];

  // Release date
  if (missingFields.includes('releaseDate')) {
    const releaseDate = parseReleaseDate(
      spotifyData.release_date,
      spotifyData.release_date_precision,
    );
    if (releaseDate) {
      tags.year = releaseDate.formatted.split('/')[0];
      tags.date = releaseDate.full;
      tags.performerInfo = releaseDate.formatted;
      tags.releaseTime = releaseDate.full;
      tags.originalReleaseTime = releaseDate.full;
      tags.recordingTime = releaseDate.full;
      fieldsFilledIn.push('releaseDate');
    }
  }

  // Title
  if (missingFields.includes('title') && trackData?.name) {
    tags.title = trackData.name;
    fieldsFilledIn.push('title');
  }

  // Artist
  if (missingFields.includes('artist') && trackData?.artists?.length) {
    tags.artist = trackData.artists.map(a => a.name).join(', ');
    fieldsFilledIn.push('artist');
  }

  // Genre
  if (missingFields.includes('genre') && resolvedGenres.length > 0) {
    tags.genre = resolvedGenres.join(', ');
    fieldsFilledIn.push('genre');
  }

  // Label
  if (missingFields.includes('label') && spotifyData.label) {
    tags.publisher = spotifyData.label;
    fieldsFilledIn.push('label');
  }

  return { tags, fieldsFilledIn };
}

export async function downloadArtwork(
  url: string,
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    return {
      buffer: Buffer.from(response.data),
      mimeType: response.headers['content-type'] || 'image/jpeg',
    };
  } catch {
    return null;
  }
}

export function writeTags(filePath: string, tags: Record<string, unknown>): boolean {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.mp3' || ext === '.wav' || ext === '.aiff' || ext === '.aif') {
    return NodeID3.update(tags, filePath) === true;
  }

  // M4A and FLAC are read-only
  return false;
}

export function isWritableFormat(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ['.mp3', '.wav', '.aiff', '.aif'].includes(ext);
}

export async function updateFile(
  accessToken: string,
  filePath: string,
  spotifyData: SpotifyAlbumData,
  trackData: SpotifyTrackData | null,
  missingFields: string[],
  existingReleaseDate: string | null,
  verbose: boolean,
): Promise<boolean> {
  const releaseDate = parseReleaseDate(
    spotifyData.release_date,
    spotifyData.release_date_precision,
  );

  if (!releaseDate) {
    if (verbose) {
      console.warn(`⚠️  No release date found for ${path.basename(filePath)}`);
    }
    return false;
  }

  if (!isWritableFormat(filePath)) {
    if (verbose) {
      const ext = path.extname(filePath).toLowerCase();
      console.warn(`⚠️  Metadata update not supported for ${ext} files yet`);
    }
    return false;
  }

  // Resolve genres
  const { genres, source: genreSource } = await resolveGenres(accessToken, spotifyData, trackData);

  if (verbose && missingFields.includes('genre')) {
    if (genres.length > 0) {
      console.log(`   🎸 Writing genre from ${genreSource}: \x1b[32m"${genres.join(', ')}"\x1b[0m`);
    } else {
      console.log(`   ⚠️  Genre missing - no genre data from Spotify (album or artist)`);
    }
  }

  if (verbose && missingFields.includes('label')) {
    if (spotifyData.label) {
      console.log(`   🏷️  Writing label: \x1b[32m"${spotifyData.label}"\x1b[0m`);
    } else {
      console.log(`   ⚠️  Label missing but Spotify has no data`);
    }
  }

  if (verbose && missingFields.includes('releaseDate') && existingReleaseDate && !isValidReleaseDateFormat(existingReleaseDate)) {
    console.log(`   🔧 Fixing invalid releaseDate: "\x1b[31m${existingReleaseDate}\x1b[0m" → \x1b[32m"${releaseDate.full}"\x1b[0m`);
  }

  // Build tags
  const { tags, fieldsFilledIn } = buildTags(
    spotifyData,
    trackData,
    missingFields,
    existingReleaseDate,
    genres,
  );

  // Download and attach artwork
  if (missingFields.includes('artwork') && spotifyData.images?.length > 0) {
    const artwork = await downloadArtwork(spotifyData.images[0].url);
    if (artwork) {
      tags.image = {
        mime: artwork.mimeType,
        type: { id: 3, name: 'front cover' },
        description: 'Album artwork',
        imageBuffer: artwork.buffer,
      };
      fieldsFilledIn.push('artwork');
    } else if (verbose) {
      console.warn(`   ⚠️  Failed to download artwork`);
    }
  }

  if (verbose) {
    console.log(`   📝 Tags to write:`, JSON.stringify(tags, null, 2));
  }

  // Write
  const success = writeTags(filePath, tags);

  if (!success) {
    if (verbose) console.warn(`⚠️  Failed to write tags`);
    return false;
  }

  if (verbose) {
    console.log(`✅ Updated: ${path.basename(filePath)}`);
    if (fieldsFilledIn.length > 0) {
      console.log(`   📝 Fields filled: \x1b[32m${fieldsFilledIn.join(', ')}\x1b[0m`);
    }

    const stillMissing = missingFields.filter(f => !fieldsFilledIn.includes(f));
    if (stillMissing.length > 0) {
      console.log(`   ⚠️  Still missing: \x1b[33m${stillMissing.join(', ')}\x1b[0m`);
    }
  }

  return true;
}
