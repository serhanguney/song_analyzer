import {
  searchSpotifyTrack,
  searchSpotifyAlbum,
  getSpotifyAlbum,
} from '../spotify/index.ts';
import type {
  ScannedFile,
  MatchResults,
  MatchedFile,
  UnmatchedFile,
  SkippedFile,
  SuspiciousMatch,
  SpotifyAlbumData,
  SpotifyTrackData,
} from './types.ts';

const SUSPICIOUS_YEAR_THRESHOLD = 1990;

export async function matchToSpotify(
  accessToken: string,
  scannedFiles: ScannedFile[],
  verbose: boolean,
): Promise<MatchResults> {
  const matched: MatchedFile[] = [];
  const unmatched: UnmatchedFile[] = [];
  const skipped: SkippedFile[] = [];
  const suspicious: SuspiciousMatch[] = [];

  for (let i = 0; i < scannedFiles.length; i++) {
    const { filePath, relativePath, metadata, missingFields } = scannedFiles[i];

    if (verbose) {
      console.log(`\n📍 Processing: ${relativePath}`);
    } else {
      process.stdout.write(`\rProcessing ${i + 1}/${scannedFiles.length} files...`);
    }

    // Skip files that already have all required fields
    if (missingFields.length === 0) {
      if (verbose) console.log(`   ✅ All required fields present - skipping`);
      skipped.push({ fileName: relativePath });
      continue;
    }

    if (verbose) {
      console.log(`   📝 Missing fields: \x1b[33m${missingFields.join(', ')}\x1b[0m`);
      if (missingFields.includes('releaseDate') && metadata.releaseDate) {
        console.log(`   ⚠️  Current releaseDate "\x1b[31m${metadata.releaseDate}\x1b[0m" is invalid (must be YYYY-MM-DD)`);
      }
    }

    if (!metadata.artist) {
      if (verbose) console.log(`   ⚠️  Cannot search without artist name`);
      unmatched.push({ fileName: relativePath, reason: 'Missing artist metadata' });
      continue;
    }

    const result = await searchSpotify(accessToken, metadata, verbose);

    if (result.spotifyData?.release_date) {
      const releaseYear = parseInt(result.spotifyData.release_date.split('-')[0]);
      const isSuspicious = releaseYear < SUSPICIOUS_YEAR_THRESHOLD;

      matched.push({
        filePath,
        fileName: relativePath,
        spotifyData: result.spotifyData,
        trackData: result.trackData,
        metadata,
        missingFields,
        suspicious: isSuspicious,
      });

      if (isSuspicious) {
        suspicious.push({
          fileName: relativePath,
          foundAlbum: result.spotifyData.name,
          foundArtist: result.spotifyData.artists[0].name,
          releaseDate: result.spotifyData.release_date,
          reason: `Old release date (${releaseYear})`,
        });
      }
    } else {
      const reason = result.spotifyData
        ? 'No release date in Spotify data'
        : 'No match found on Spotify';
      unmatched.push({ fileName: relativePath, reason });
      if (verbose) {
        console.log(`   ⚠️  ${result.spotifyData ? 'Found but no release date' : 'No match found'}`);
      }
    }
  }

  // Clear progress line
  if (!verbose) {
    process.stdout.write('\r' + ' '.repeat(50) + '\r');
  }

  return { matched, unmatched, skipped, suspicious };
}

async function searchSpotify(
  accessToken: string,
  metadata: { artist: string | null; title: string | null; album: string | null },
  verbose: boolean,
): Promise<{ spotifyData: SpotifyAlbumData | null; trackData: SpotifyTrackData | null }> {
  let spotifyData: SpotifyAlbumData | null = null;
  let trackData: SpotifyTrackData | null = null;

  // Try track search first (more specific)
  if (metadata.title && metadata.artist) {
    if (verbose) console.log(`   Searching (track): ${metadata.artist} - ${metadata.title}`);
    const trackResult = await searchSpotifyTrack(accessToken, metadata.artist, metadata.title);

    if (trackResult?.album) {
      trackData = trackResult;
      spotifyData = await getSpotifyAlbum(accessToken, trackResult.album.id);

      if (spotifyData?.release_date && verbose) {
        console.log(`   ✅ Match found via track search`);
        logAvailableFields(spotifyData, trackData);
      }
    }
  }

  // Fallback to album search
  if (!spotifyData && metadata.album && metadata.artist) {
    if (verbose) console.log(`   Searching (album): ${metadata.artist} - ${metadata.album}`);
    const albumSearchResult = await searchSpotifyAlbum(accessToken, metadata.artist, metadata.album);

    if (albumSearchResult.data) {
      spotifyData = await getSpotifyAlbum(accessToken, albumSearchResult.data.id);

      if (spotifyData?.release_date && verbose) {
        console.log(`   ✅ Match found via album search`);
        logAvailableFields(spotifyData, null);
      }
    }
  }

  return { spotifyData, trackData };
}

function logAvailableFields(
  spotifyData: SpotifyAlbumData,
  trackData: SpotifyTrackData | null,
): void {
  const fields: string[] = [];
  if (spotifyData.genres?.length > 0) fields.push('genre');
  if (spotifyData.label) fields.push('label');
  if (spotifyData.images?.length > 0) fields.push('artwork');
  if (trackData?.name) fields.push('title');
  if (trackData?.artists && trackData.artists.length > 0) fields.push('artist');

  if (fields.length > 0) {
    console.log(`   📦 Spotify has: \x1b[32m${fields.join(', ')}\x1b[0m`);
  } else {
    console.log(`   ⚠️  Spotify has no additional metadata`);
  }
}
