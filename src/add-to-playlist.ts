import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import readlineSync from 'readline-sync';
import { getUserAccessToken } from './spotify-auth.ts';
import {
  searchSpotifyTrack,
  searchSpotifyAlbum,
  getSpotifyAlbum,
  getAudioFiles,
  extractMetadata,
  validateArtistMatch,
  stringSimilarity,
} from './spotify.js';

// CLI args
const args = process.argv.slice(2);
const VERBOSE = args.includes('-v') || args.includes('--verbose');

function getArgValue(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx !== -1 && idx + 1 < args.length) return args[idx + 1];
  return undefined;
}

const playlistId = getArgValue('--playlist') || process.env.PLAYLIST_ID;
const directory = getArgValue('--dir') || process.env.PLAYLIST_DIRECTORY;
const CLIENT_ID = process.env.CLIENT_ID;
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI || 'http://127.0.0.1:36914/spotify';

const colors = {
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  reset: '\x1b[0m',
};

function log(msg: string) {
  if (VERBOSE) console.log(msg);
}

export interface MatchResult {
  fileName: string;
  uri: string;
  spotifyName: string;
  spotifyArtist: string;
}

export interface UnmatchedResult {
  fileName: string;
  reason: string;
}

interface PlaylistTrack {
  name: string;
  artists: string[];
}

export async function getPlaylistTracks(
  accessToken: string,
  playlistId: string,
): Promise<PlaylistTrack[]> {
  const tracks: PlaylistTrack[] = [];
  let url: string | null = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?fields=${encodeURIComponent('items(track(name,artists(name))),next')}&limit=100`;

  while (url) {
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Failed to fetch playlist tracks: ${response.status} ${errorBody}`);
    }

    const data = await response.json() as {
      items: Array<{ track: { name: string; artists: Array<{ name: string }> } | null }>;
      next: string | null;
    };

    for (const item of data.items) {
      if (item.track) {
        tracks.push({
          name: item.track.name,
          artists: item.track.artists.map(a => a.name),
        });
      }
    }

    url = data.next;
  }

  return tracks;
}

export function filterDuplicates(
  matched: MatchResult[],
  existingTracks: PlaylistTrack[],
): { toAdd: MatchResult[]; duplicates: MatchResult[] } {
  const existingSet = new Set(
    existingTracks.map(t => `${t.artists.join(', ').toLowerCase()}::${t.name.toLowerCase()}`),
  );

  const toAdd: MatchResult[] = [];
  const duplicates: MatchResult[] = [];

  for (const match of matched) {
    const key = `${match.spotifyArtist.toLowerCase()}::${match.spotifyName.toLowerCase()}`;
    if (existingSet.has(key)) {
      duplicates.push(match);
    } else {
      toAdd.push(match);
    }
  }

  return { toAdd, duplicates };
}

export async function addTracksToPlaylist(
  accessToken: string,
  playlistId: string,
  trackUris: string[],
): Promise<void> {
  const BATCH_SIZE = 100;

  for (let i = 0; i < trackUris.length; i += BATCH_SIZE) {
    const batch = trackUris.slice(i, i + BATCH_SIZE);

    const response = await fetch(
      `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ uris: batch }),
      },
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Failed to add tracks (batch ${Math.floor(i / BATCH_SIZE) + 1}): ${response.status} ${errorBody}`);
    }

    if (VERBOSE && trackUris.length > BATCH_SIZE) {
      console.log(`   Added batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(trackUris.length / BATCH_SIZE)}`);
    }
  }
}

export async function matchFiles(
  accessToken: string,
  audioFiles: string[],
  baseDirectory: string,
): Promise<{ matched: MatchResult[]; unmatched: UnmatchedResult[] }> {
  const matched: MatchResult[] = [];
  const unmatched: UnmatchedResult[] = [];

  for (let i = 0; i < audioFiles.length; i++) {
    const filePath = audioFiles[i];
    const fileName = path.relative(baseDirectory, filePath);
    const metadata = await extractMetadata(filePath);

    if (!VERBOSE) {
      process.stdout.write(`\rSearching ${i + 1}/${audioFiles.length}...`);
    }

    log(`\n📍 ${fileName}`);

    if (!metadata.artist) {
      log(`   ⚠️  No artist metadata — skipping`);
      unmatched.push({ fileName, reason: 'No artist metadata' });
      continue;
    }

    let trackUri: string | null = null;
    let trackName = '';
    let trackArtist = '';

    // Try track search first
    if (metadata.title) {
      log(`   Searching: ${metadata.artist} - ${metadata.title}`);
      const trackResult = await searchSpotifyTrack(accessToken, metadata.artist, metadata.title);

      if (trackResult) {
        const artistMatch = validateArtistMatch(metadata.artist, trackResult.artists);
        const titleSim = stringSimilarity(metadata.title, trackResult.name);

        if (artistMatch && titleSim >= 0.3) {
          trackUri = trackResult.uri;
          trackName = trackResult.name;
          trackArtist = trackResult.artists.map((a: { name: string }) => a.name).join(', ');
          log(`   ✅ Matched: ${trackArtist} - ${trackName} (${(titleSim * 100).toFixed(0)}% title match)`);
        } else {
          log(`   ⚠️  Rejected: ${trackResult.artists[0]?.name} - ${trackResult.name} (artist: ${artistMatch ? 'ok' : 'mismatch'}, title: ${(titleSim * 100).toFixed(0)}%)`);
        }
      }
    }

    // Fallback: search album, then find best track
    if (!trackUri && metadata.album && metadata.title) {
      log(`   Trying album search: ${metadata.artist} - ${metadata.album}`);
      const albumResult = await searchSpotifyAlbum(accessToken, metadata.artist, metadata.album);

      if (albumResult) {
        const fullAlbum = await getSpotifyAlbum(accessToken, albumResult.id);

        if (fullAlbum?.tracks?.items) {
          const titleLower = metadata.title.toLowerCase();
          const matchingTrack = fullAlbum.tracks.items.find(
            (t: { name: string; artists: Array<{ name: string }> }) => {
              const titleSim = stringSimilarity(metadata.title!, t.name);
              const artistMatch = validateArtistMatch(metadata.artist!, t.artists);
              return artistMatch && titleSim >= 0.3;
            },
          );

          if (matchingTrack) {
            trackUri = matchingTrack.uri;
            trackName = matchingTrack.name;
            trackArtist = matchingTrack.artists.map((a: { name: string }) => a.name).join(', ');
            log(`   ✅ Matched via album: ${trackArtist} - ${trackName}`);
          }
        }
      }
    }

    if (trackUri) {
      matched.push({ fileName, uri: trackUri, spotifyName: trackName, spotifyArtist: trackArtist });
    } else {
      unmatched.push({ fileName, reason: 'No Spotify match found' });
      log(`   ⚠️  No match found`);
    }
  }

  return { matched, unmatched };
}

async function main() {
  console.log('🎵 Add Songs to Spotify Playlist');
  if (VERBOSE) {
    console.log('🔍 Running in verbose mode\n');
  } else {
    console.log('💡 Tip: Use -v for detailed logs\n');
  }

  // Validate config
  if (!CLIENT_ID) {
    console.error('❌ CLIENT_ID not set in .env');
    process.exit(1);
  }

  if (!playlistId) {
    console.error('❌ No playlist ID provided.');
    console.error('   Use --playlist <id> or set PLAYLIST_ID in .env');
    process.exit(1);
  }

  if (!directory) {
    console.error('❌ No directory provided.');
    console.error('   Use --dir <path> or set SOURCE_DIRECTORY in .env');
    process.exit(1);
  }

  try {
    await fs.access(directory);
  } catch {
    console.error(`❌ Directory not found: "${directory}"`);
    process.exit(1);
  }

  // Authenticate
  console.log('🔐 Authenticating with Spotify (user authorization)...');
  let accessToken: string = '';
  try {
    accessToken = await getUserAccessToken(CLIENT_ID, REDIRECT_URI);
    console.log('✅ Authenticated\n');
  } catch (err) {
    console.error('❌ Authentication failed:', (err as Error).message);
    process.exit(1);
  }

  // Scan directory
  console.log(`📁 Scanning: ${directory}\n`);
  const audioFiles = await getAudioFiles(directory);

  if (audioFiles.length === 0) {
    console.log('ℹ️  No audio files found.');
    process.exit(0);
  }

  console.log(`Found ${audioFiles.length} audio file(s)\n`);
  console.log('🔍 Matching tracks on Spotify...\n');

  const { matched, unmatched } = await matchFiles(accessToken, audioFiles, directory);

  // Clear progress line
  if (!VERBOSE) {
    process.stdout.write('\r' + ' '.repeat(50) + '\r');
  }

  // Check for duplicates already in the playlist
  console.log('📋 Checking existing playlist tracks...');
  const existingTracks = await getPlaylistTracks(accessToken, playlistId);
  console.log(`   Found ${existingTracks.length} existing track(s)\n`);

  const { toAdd, duplicates } = filterDuplicates(matched, existingTracks);

  // Summary
  console.log('='.repeat(60));
  console.log('📊 Summary\n');

  if (toAdd.length > 0) {
    console.log(`${colors.green}New tracks to add: ${toAdd.length}${colors.reset}\n`);
    toAdd.forEach((m, i) => {
      console.log(`  ${i + 1}. ${m.fileName}`);
      console.log(`     → ${colors.cyan}${m.spotifyArtist} - ${m.spotifyName}${colors.reset}`);
    });
    console.log('');
  }

  if (duplicates.length > 0) {
    console.log(`${colors.yellow}Already in playlist: ${duplicates.length} track(s)${colors.reset}\n`);
    duplicates.forEach(d => {
      console.log(`  - ${d.fileName} (${d.spotifyArtist} - ${d.spotifyName})`);
    });
    console.log('');
  }

  if (unmatched.length > 0) {
    console.log(`${colors.yellow}Unmatched: ${unmatched.length} file(s)${colors.reset}\n`);
    unmatched.forEach(u => {
      console.log(`  - ${u.fileName} (${u.reason})`);
    });
    console.log('');
  }

  console.log('='.repeat(60) + '\n');

  if (toAdd.length === 0) {
    console.log('ℹ️  No new tracks to add. Exiting.');
    process.exit(0);
  }

  // Confirm
  const answer = readlineSync.question(
    `Add ${toAdd.length} track(s) to playlist ${playlistId}? (Yes/No): `,
  );

  if (answer.toLowerCase() !== 'yes' && answer.toLowerCase() !== 'y') {
    console.log('\n❌ Cancelled.');
    process.exit(0);
  }

  // Add to playlist
  console.log('\n🔄 Adding tracks to playlist...\n');
  const uris = toAdd.map(m => m.uri);

  try {
    await addTracksToPlaylist(accessToken, playlistId, uris);
    console.log(`✅ Successfully added ${toAdd.length} track(s) to playlist!`);
  } catch (err) {
    console.error('❌ Error adding tracks:', (err as Error).message);
    process.exit(1);
  }
}

// Only run main() when executed directly
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  main().catch(err => {
    console.error('\n❌ Fatal error:', err);
    process.exit(1);
  });
}
