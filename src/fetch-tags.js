import 'dotenv/config';
import path from 'path';
import axios from 'axios';
import readlineSync from 'readline-sync';
import { parseFile } from 'music-metadata';
import NodeID3 from 'node-id3';
import { REQUIRED_FIELD_NAMES } from './common.js';
import {
  getClientCredentialsToken,
  cleanSearchString,
  getPrimaryArtist,
  validateArtistMatch,
  stringSimilarity,
  searchSpotifyTrack,
  searchSpotifyAlbum,
  getSpotifyAlbum,
  getSpotifyArtist,
  getAudioFiles,
  extractMetadata
} from './spotify.js';

// Configuration
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const SOURCE_DIRECTORY = process.env.SOURCE_DIRECTORY;

// Global access token
let accessToken = null;

// Check for verbose flag
const VERBOSE = process.argv.includes('-v') || process.argv.includes('--verbose');

// ANSI color codes
const colors = {
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  reset: '\x1b[0m'
};

/**
 * Parse release date from Spotify date string
 */
function parseReleaseDate(dateString, precision) {
  if (!dateString) return null;

  // Handle empty strings or just whitespace
  if (typeof dateString === 'string' && dateString.trim() === '') return null;

  try {
    // Spotify returns dates in different precisions:
    // "year" precision: "2020"
    // "month" precision: "2020-05"
    // "day" precision: "2020-05-15"

    let date;
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

    return {
      full: dateString,
      formatted: `${year}/${month}`,
      precision: precision
    };
  } catch (error) {
    return null;
  }
}

/**
 * Get relative path for display
 */
function getRelativePath(filePath, baseDir) {
  return path.relative(baseDir, filePath);
}

/**
 * Validate if release date is in YYYY-MM-DD format
 */
function isValidReleaseDateFormat(dateString) {
  if (!dateString) return false;

  // Check if it matches YYYY-MM-DD format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateString)) {
    return false;
  }

  // Validate it's a real date
  const [year, month, day] = dateString.split('-');
  const yearNum = parseInt(year);
  const monthNum = parseInt(month);
  const dayNum = parseInt(day);

  if (yearNum < 1900 || yearNum > new Date().getFullYear() + 1) {
    return false;
  }

  if (monthNum < 1 || monthNum > 12) {
    return false;
  }

  if (dayNum < 1 || dayNum > 31) {
    return false;
  }

  const date = new Date(dateString);
  return !isNaN(date.getTime());
}

/**
 * Check which required fields are missing from metadata
 */
function getMissingRequiredFields(metadata) {
  const missing = [];

  for (const fieldName of REQUIRED_FIELD_NAMES) {
    if (fieldName === 'releaseDate') {
      // Special handling for releaseDate - check if it exists AND is in valid format
      if (!metadata[fieldName] || !isValidReleaseDateFormat(metadata[fieldName])) {
        missing.push(fieldName);
      }
    } else {
      if (!metadata[fieldName]) {
        missing.push(fieldName);
      }
    }
  }

  return missing;
}

/**
 * Update metadata for a single file
 */
async function updateFileMetadata(filePath, spotifyData, trackData, existingMetadata, missingFields) {
  try {
    const ext = path.extname(filePath).toLowerCase();

    // Get release date from Spotify data
    const releaseDate = parseReleaseDate(
      spotifyData.release_date,
      spotifyData.release_date_precision
    );

    if (!releaseDate) {
      if (VERBOSE) {
        console.warn(`⚠️  No release date found for ${path.basename(filePath)}`);
        console.log('\n📋 Full Spotify Response:');
        console.log(JSON.stringify(spotifyData, null, 2));
        console.log(''); // Empty line for readability
      }
      return false;
    }

    // node-id3 supports MP3, WAV, and AIFF files
    if (ext === '.mp3' || ext === '.wav' || ext === '.aiff' || ext === '.aif') {
      try {
        // Prepare tags to write
        const tags = {};

        // Fill in missing required fields from Spotify data
        const fieldsFilledIn = [];

        // Update date fields only if releaseDate is missing or invalid format
        if (missingFields.includes('releaseDate')) {
          if (VERBOSE && existingMetadata.releaseDate && !isValidReleaseDateFormat(existingMetadata.releaseDate)) {
            console.log(`   🔧 Fixing invalid releaseDate: "${colors.red}${existingMetadata.releaseDate}${colors.reset}" → ${colors.green}"${releaseDate.full}"${colors.reset}`);
          }
          tags.year = releaseDate.formatted.split('/')[0];
          tags.date = releaseDate.full;
          tags.performerInfo = releaseDate.formatted;  // Album Artist field (TPE2 frame)
          tags.releaseTime = releaseDate.full;
          tags.originalReleaseTime = releaseDate.full;
          tags.recordingTime = releaseDate.full;
          fieldsFilledIn.push('releaseDate');
        }

        // Title - from track data
        if (missingFields.includes('title') && trackData?.name) {
          tags.title = trackData.name;
          fieldsFilledIn.push('title');
        }

        // Artist - from track data
        if (missingFields.includes('artist') && trackData?.artists?.length > 0) {
          tags.artist = trackData.artists.map(a => a.name).join(', ');
          fieldsFilledIn.push('artist');
        }

        // Genre - try album genres first, then artist genres
        if (missingFields.includes('genre')) {
          let genreSource = null;
          let genres = [];

          // Try album genres first
          if (spotifyData?.genres?.length > 0) {
            genres = spotifyData.genres;
            genreSource = 'album';
          }
          // Fallback to artist genres if album has no genres
          else if (trackData?.artists?.length > 0) {
            try {
              const artistData = await getSpotifyArtist(accessToken, trackData.artists[0].id);
              if (artistData?.genres?.length > 0) {
                genres = artistData.genres;
                genreSource = 'artist';
              }
            } catch (error) {
              console.warn(`   ⚠️  Failed to fetch artist genres: ${error.message}`);
            }
          }

          if (genres.length > 0) {
            if (VERBOSE) {
              console.log(`   🎸 Writing genre from ${genreSource}: ${colors.green}"${genres.join(', ')}"${colors.reset}`);
            }
            tags.genre = genres.join(', ');
            fieldsFilledIn.push('genre');
          } else if (VERBOSE) {
            console.log(`   ⚠️  Genre missing - no genre data from Spotify (album or artist)`);
          }
        }

        // Label - from album data (NodeID3 uses 'publisher' field for record label)
        if (missingFields.includes('label') && spotifyData?.label) {
          if (VERBOSE) {
            console.log(`   🏷️  Writing label: ${colors.green}"${spotifyData.label}"${colors.reset}`);
          }
          tags.publisher = spotifyData.label;  // NodeID3 uses 'publisher' not 'label'
          fieldsFilledIn.push('label');
        } else if (missingFields.includes('label') && VERBOSE) {
          console.log(`   ⚠️  Label missing but Spotify has no data (spotifyData.label = ${spotifyData?.label})`);
        }

        // Artwork - download and embed from Spotify
        if (missingFields.includes('artwork') && spotifyData?.images?.length > 0) {
          try {
            // Get the largest image (first in array)
            const imageUrl = spotifyData.images[0].url;
            const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
            const imageBuffer = Buffer.from(imageResponse.data);

            // Determine mime type from content-type header
            const mimeType = imageResponse.headers['content-type'] || 'image/jpeg';

            tags.image = {
              mime: mimeType,
              type: {
                id: 3, // Front cover
                name: 'front cover'
              },
              description: 'Album artwork',
              imageBuffer: imageBuffer
            };
            fieldsFilledIn.push('artwork');
          } catch (imageError) {
            if (VERBOSE) {
              console.warn(`   ⚠️  Failed to download artwork: ${imageError.message}`);
            }
          }
        }

        // Note: BPM cannot be filled from Spotify API
        // This needs to be added manually or through other means

        if (VERBOSE) {
          // Debug: Show what we're about to write
          console.log(`   📝 Tags to write:`, JSON.stringify(tags, null, 2));
        }

        // Update only the specified tags, preserving all other existing metadata
        const success = NodeID3.update(tags, filePath);

        if (!success) {
          if (VERBOSE) {
            console.warn(`⚠️  Failed to write tags to ${ext} file`);
          }
          return false;
        }

        if (VERBOSE) {
          console.log(`✅ Successfully updated metadata for ${path.basename(filePath)}`);
          if (fieldsFilledIn.length > 0) {
            console.log(`   📝 Filled missing fields from Spotify: ${colors.green}${fieldsFilledIn.join(', ')}${colors.reset}`);
          }

          // Show which fields still need manual entry
          const stillMissing = missingFields.filter(field =>
            (field === 'genre' && !spotifyData?.genres?.length) ||
            (field === 'label' && !spotifyData?.label) ||
            (field === 'title' && !trackData?.name) ||
            (field === 'artist' && !trackData?.artists?.length) ||
            (field === 'artwork' && !spotifyData?.images?.length)
          );

          if (stillMissing.length > 0) {
            console.log(`   ⚠️  Still missing (Spotify has no data): ${colors.yellow}${stillMissing.join(', ')}${colors.reset}`);
            console.log(`   ⚠️  This file will remain in [invalid] until these fields are added manually`);
          }

          // Verify what was written (for debugging)
          const writtenTags = NodeID3.read(filePath);
          console.log(`📋 Verified tags after update (via NodeID3.read):`);
          console.log(`   Title: ${writtenTags.title || 'N/A'}`);
          console.log(`   Artist: ${writtenTags.artist || 'N/A'}`);
          console.log(`   Album: ${writtenTags.album || 'N/A'}`);
          console.log(`   Album Artist: ${writtenTags.performerInfo || 'N/A'} (formatted date)`);
          console.log(`   Year: ${writtenTags.year || 'N/A'}`);
          console.log(`   Release Date: ${writtenTags.releaseTime || 'N/A'}`);
          console.log(`   Genre: ${writtenTags.genre || 'N/A'}`);
          console.log(`   Publisher: ${writtenTags.publisher || 'N/A'}`);
          console.log(`   BPM: ${writtenTags.bpm || 'N/A'}`);

          // Also verify with music-metadata to see if there's a discrepancy
          console.log(`\n📋 Verified tags after update (via music-metadata):`);
          const verifyMetadata = await parseFile(filePath);
          const verifyCommon = verifyMetadata.common;
          console.log(`   Title: ${verifyCommon.title || 'N/A'}`);
          console.log(`   Artist: ${verifyCommon.artist || 'N/A'}`);
          console.log(`   Album: ${verifyCommon.album || 'N/A'}`);
          console.log(`   Album Artist: ${verifyCommon.albumartist || 'N/A'} (formatted date)`);
          console.log(`   Genre: ${verifyCommon.genre || 'N/A'}`);
          console.log(`   Label: ${verifyCommon.label || 'N/A'}`);
          console.log(`   Publisher: ${verifyCommon.publisher || 'N/A'}`);
          console.log(`   BPM: ${verifyCommon.bpm || 'N/A'}`);
        }

        return true;
      } catch (writeError) {
        if (VERBOSE) {
          console.error(`Error writing tags to ${ext} file:`, writeError.message);
        }
        return false;
      }
    } else if (ext === '.m4a' || ext === '.flac') {
      // For M4A and FLAC, we would need format-specific libraries
      if (VERBOSE) {
        console.warn(`⚠️  Metadata update not supported for ${ext} files yet`);
        console.log(`   Consider converting to MP3, WAV, or AIFF for metadata updates`);
      }
      return false;
    } else {
      if (VERBOSE) {
        console.warn(`⚠️  Unknown file format: ${ext}`);
      }
      return false;
    }
  } catch (error) {
    if (VERBOSE) {
      console.error(`❌ Error updating metadata for ${path.basename(filePath)}:`, error.message);
      console.log('\n📋 Full Spotify Response (on error):');
      console.log(JSON.stringify(spotifyData, null, 2));
      console.log(''); // Empty line for readability
    }
    return false;
  }
}

/**
 * Main process
 */
async function main() {
  console.log('🎵 Song Metadata Analyzer (Spotify Edition)');
  if (!VERBOSE) {
    console.log('💡 Tip: Use -v or --verbose flag for detailed logs\n');
  } else {
    console.log('🔍 Running in verbose mode\n');
  }

  // Validate credentials
  if (!CLIENT_ID || CLIENT_ID === 'your_id_here') {
    console.error('❌ Error: Spotify CLIENT_ID not configured.');
    console.error('Please set CLIENT_ID in your .env file.');
    console.error('Get your credentials from: https://developer.spotify.com/dashboard');
    process.exit(1);
  }

  if (!CLIENT_SECRET || CLIENT_SECRET === 'your_secret_key_here') {
    console.error('❌ Error: Spotify CLIENT_SECRET not configured.');
    console.error('Please set CLIENT_SECRET in your .env file.');
    console.error('Get your credentials from: https://developer.spotify.com/dashboard');
    process.exit(1);
  }

  if (!SOURCE_DIRECTORY) {
    console.error('❌ Error: MUSIC_DIRECTORY not configured.');
    console.error('Please set MUSIC_DIRECTORY in your .env file.');
    process.exit(1);
  }

  // Get Spotify access token
  console.log('🔐 Authenticating with Spotify...');
  try {
    accessToken = await getClientCredentialsToken(CLIENT_ID, CLIENT_SECRET);
    console.log('✅ Successfully authenticated\n');
  } catch (error) {
    console.error('❌ Failed to authenticate with Spotify');
    process.exit(1);
  }

  // Validate directory
  try {
    const fs = await import('fs/promises');
    await fs.access(SOURCE_DIRECTORY);
  } catch (error) {
    console.error(`❌ Error: Music directory "${SOURCE_DIRECTORY}" not found.`);
    console.error('Please create the directory or update MUSIC_DIRECTORY in your .env file.');
    process.exit(1);
  }

  console.log(`📁 Scanning directory recursively: ${SOURCE_DIRECTORY}\n`);

  // Get all audio files recursively
  const audioFiles = await getAudioFiles(SOURCE_DIRECTORY);

  if (audioFiles.length === 0) {
    console.log('ℹ️  No audio files found in the directory or subdirectories.');
    process.exit(0);
  }

  console.log(`Found ${audioFiles.length} audio file(s) across all subdirectories\n`);

  // Process each file and fetch metadata
  const results = {
    matched: [],
    notMatched: [],
    suspicious: [],
    skipped: []
  };

  console.log('🔍 Searching Spotify for track information...\n');

  for (let i = 0; i < audioFiles.length; i++) {
    const filePath = audioFiles[i];
    const relativePath = getRelativePath(filePath, SOURCE_DIRECTORY);
    const metadata = await extractMetadata(filePath);

    if (VERBOSE) {
      console.log(`\n📍 Processing: ${relativePath}`);
    } else {
      // Show progress without details
      process.stdout.write(`\rProcessing ${i + 1}/${audioFiles.length} files...`);
    }

    // Check for missing required fields
    const missingFields = getMissingRequiredFields(metadata);

    // Skip files that already have all required fields
    if (missingFields.length === 0) {
      if (VERBOSE) {
        console.log(`   ✅ All required fields present - skipping`);
      }
      results.skipped.push({
        fileName: relativePath
      });
      continue;
    }

    if (VERBOSE) {
      console.log(`   📝 Missing fields: ${colors.yellow}${missingFields.join(', ')}${colors.reset}`);
      // Show current release date if it exists but is invalid format
      if (missingFields.includes('releaseDate') && metadata.releaseDate) {
        console.log(`   ⚠️  Current releaseDate "${colors.red}${metadata.releaseDate}${colors.reset}" is invalid (must be YYYY-MM-DD)`);
      }
    }

    if (!metadata.artist) {
      if (VERBOSE) {
        console.log(`   ⚠️  Cannot search without artist name`);
      }
      results.notMatched.push({
        fileName: relativePath,
        reason: 'Missing artist metadata'
      });
      continue;
    }

    let spotifyData = null;
    let trackData = null;

    // Try track search FIRST (more specific than album search)
    if (metadata.title) {
      if (VERBOSE) {
        console.log(`   Searching (track): ${metadata.artist} - ${metadata.title}`);
      }
      const trackResult = await searchSpotifyTrack(accessToken, metadata.artist, metadata.title);

      if (trackResult && trackResult.album) {
        // Store track data for metadata filling
        trackData = trackResult;
        // Get full album details to ensure we have label and other complete info
        spotifyData = await getSpotifyAlbum(accessToken, trackResult.album.id);
        if (spotifyData && spotifyData.release_date) {
          if (VERBOSE) {
            console.log(`   ✅ Match found via track search`);
            // Log what fields Spotify has
            const spotifyFields = [];
            if (spotifyData.genres?.length > 0) spotifyFields.push('genre');
            if (spotifyData.label) spotifyFields.push('label');
            if (spotifyData.images?.length > 0) spotifyFields.push('artwork');
            if (trackData.name) spotifyFields.push('title');
            if (trackData.artists?.length > 0) spotifyFields.push('artist');
            if (spotifyFields.length > 0) {
              console.log(`   📦 Spotify has: ${colors.green}${spotifyFields.join(', ')}${colors.reset}`);
            } else {
              console.log(`   ⚠️  Spotify has no additional metadata`);
            }
          }
        }
      }
    }

    // Fallback to album search if track search failed or no track name
    if (!spotifyData && metadata.album) {
      if (VERBOSE) {
        console.log(`   Searching (album): ${metadata.artist} - ${metadata.album}`);
      }
      const albumResult = await searchSpotifyAlbum(accessToken, metadata.artist, metadata.album);

      if (albumResult) {
        // Get full album details
        spotifyData = await getSpotifyAlbum(accessToken, albumResult.id);
        if (spotifyData && spotifyData.release_date) {
          if (VERBOSE) {
            console.log(`   ✅ Match found via album search`);
            // Log what fields Spotify has
            const spotifyFields = [];
            if (spotifyData.genres?.length > 0) spotifyFields.push('genre');
            if (spotifyData.label) spotifyFields.push('label');
            if (spotifyData.images?.length > 0) spotifyFields.push('artwork');
            if (spotifyFields.length > 0) {
              console.log(`   📦 Spotify has: ${colors.green}${spotifyFields.join(', ')}${colors.reset}`);
            } else {
              console.log(`   ⚠️  Spotify has no additional metadata (no genre/label/artwork)`);
            }
          }
        }
      }
    }

    // Add to results
    if (spotifyData && spotifyData.release_date) {
      // Check for suspicious matches
      const releaseYear = parseInt(spotifyData.release_date.split('-')[0]);
      const isSuspicious = releaseYear < 1990; // House music typically post-1990

      const matchData = {
        filePath,
        fileName: relativePath,
        spotifyData,
        trackData,
        metadata,
        missingFields,
        suspicious: isSuspicious
      };

      results.matched.push(matchData);

      // Flag suspicious matches
      if (isSuspicious) {
        results.suspicious.push({
          fileName: relativePath,
          foundAlbum: spotifyData.name,
          foundArtist: spotifyData.artists[0].name,
          releaseDate: spotifyData.release_date,
          reason: `Old release date (${releaseYear})`
        });
      }
    } else {
      results.notMatched.push({
        fileName: relativePath,
        reason: spotifyData ? 'No release date in Spotify data' : 'No match found on Spotify'
      });
      if (VERBOSE) {
        console.log(`   ⚠️  ${spotifyData ? 'Found but no release date' : 'No match found'}`);
      }
    }
  }

  // Clear the progress line if not in verbose mode
  if (!VERBOSE) {
    process.stdout.write('\r' + ' '.repeat(50) + '\r');
  }

  // Display summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Summary\n');
  console.log(`Spotify matches found: ${results.matched.length} song(s) ✅`);

  if (results.matched.length > 0) {
    console.log('\nSongs to be updated:\n');

    const updatableFiles = [];
    const noUpdateFiles = [];

    // Separate files into those with updatable fields and those without
    results.matched.forEach((item) => {
      const updatableFields = [];

      // Check Release Date
      if (item.missingFields.includes('releaseDate')) {
        const releaseDate = parseReleaseDate(
          item.spotifyData.release_date,
          item.spotifyData.release_date_precision
        );
        if (releaseDate) {
          let releaseDateLabel = 'releaseDate';
          // Check if we're updating an invalid date vs adding missing date
          if (item.metadata.releaseDate && !isValidReleaseDateFormat(item.metadata.releaseDate)) {
            releaseDateLabel = `releaseDate (fixing: ${item.metadata.releaseDate})`;
          }
          updatableFields.push({
            type: releaseDateLabel,
            value: `${releaseDate.formatted} (${releaseDate.full})`
          });
        }
      }

      // Check Title
      if (item.missingFields.includes('title') && item.trackData?.name) {
        updatableFields.push({ type: 'title', value: `"${item.trackData.name}"` });
      }

      // Check Artist
      if (item.missingFields.includes('artist') && item.trackData?.artists?.length > 0) {
        const artists = item.trackData.artists.map(a => a.name).join(', ');
        updatableFields.push({ type: 'artist', value: `"${artists}"` });
      }

      // Check Genre
      if (item.missingFields.includes('genre')) {
        if (item.spotifyData?.genres?.length > 0) {
          updatableFields.push({
            type: 'genre',
            value: `"${item.spotifyData.genres.join(', ')}" (from album)`
          });
        } else if (item.trackData?.artists?.length > 0) {
          updatableFields.push({ type: 'genre', value: '(will fetch from artist data)' });
        }
      }

      // Check Label
      if (item.missingFields.includes('label') && item.spotifyData?.label) {
        updatableFields.push({ type: 'label', value: `"${item.spotifyData.label}"` });
      }

      // Check Artwork
      if (item.missingFields.includes('artwork') && item.spotifyData?.images?.length > 0) {
        const imgSize = item.spotifyData.images[0];
        updatableFields.push({ type: 'artwork', value: `${imgSize.width}x${imgSize.height} image` });
      }

      if (updatableFields.length > 0) {
        updatableFiles.push({ ...item, updatableFields });
      } else {
        noUpdateFiles.push(item);
      }
    });

    // Display files with updatable fields
    if (updatableFiles.length > 0) {
      updatableFiles.forEach((item, index) => {
        console.log(`  ${index + 1}. ${item.fileName}`);
        console.log(`     Fields to update:`);

        item.updatableFields.forEach(field => {
          console.log(`       • ${colors.yellow}${field.type}: ${colors.green}${field.value}${colors.reset}`);
        });
      });
      console.log('');
    }

    // Display files with no updatable fields
    if (noUpdateFiles.length > 0) {
      console.log(`${colors.yellow}⚠️  ${noUpdateFiles.length} song(s) matched but Spotify has no data for missing fields:${colors.reset}\n`);
      noUpdateFiles.forEach(item => {
        console.log(`  - ${item.fileName}`);

        // Separate invalid vs missing fields for better clarity
        const invalidReleaseDate = item.missingFields.includes('releaseDate') &&
                                    item.metadata.releaseDate &&
                                    !isValidReleaseDateFormat(item.metadata.releaseDate);

        if (invalidReleaseDate) {
          console.log(`    Invalid releaseDate: ${colors.red}"${item.metadata.releaseDate}"${colors.reset} (needs YYYY-MM-DD)`);
        }

        const otherMissing = item.missingFields.filter(f =>
          f !== 'releaseDate' || !item.metadata.releaseDate
        );

        if (otherMissing.length > 0) {
          console.log(`    Missing: ${colors.yellow}${otherMissing.join(', ')}${colors.reset}`);
        }

        console.log(`    ${colors.yellow}Spotify has no data for these fields${colors.reset}`);
      });
      console.log('');
    }
  }

  if (results.notMatched.length > 0) {
    console.log(`No match found for ${results.notMatched.length} song(s) ⚠️:\n`);
    results.notMatched.forEach(item => {
      console.log(`  - ${item.fileName} (${item.reason})`);
    });
  }

  // Display skipped files (already have all required fields)
  if (results.skipped.length > 0) {
    console.log(`\n${colors.cyan}Skipped ${results.skipped.length} song(s) (already have all required fields) ℹ️${colors.reset}`);
    if (VERBOSE) {
      console.log('');
      results.skipped.forEach(item => {
        console.log(`  - ${item.fileName}`);
      });
    }
  }

  // Display suspicious matches
  if (results.suspicious.length > 0) {
    console.log(`\n⚠️  SUSPICIOUS MATCHES (${results.suspicious.length}) - Please review carefully:\n`);
    results.suspicious.forEach(item => {
      console.log(`  - ${item.fileName}`);
      console.log(`    Found: ${colors.yellow}"${item.foundAlbum}"${colors.reset} by ${colors.yellow}${item.foundArtist}${colors.reset}`);
      console.log(`    Release Date: ${colors.yellow}${item.releaseDate}${colors.reset}`);
      console.log(`    Reason: ${colors.red}${item.reason}${colors.reset}\n`);
    });
    console.log('These matches may be incorrect. Review them before proceeding!');
  }

  console.log('='.repeat(60) + '\n');

  // Filter matched results to only include files with updatable fields
  const updatableMatches = results.matched.filter(item => {
    // Check if there's at least one field that can be updated
    const hasReleaseDate = item.missingFields.includes('releaseDate') &&
                          parseReleaseDate(item.spotifyData.release_date, item.spotifyData.release_date_precision);
    const hasTitle = item.missingFields.includes('title') && item.trackData?.name;
    const hasArtist = item.missingFields.includes('artist') && item.trackData?.artists?.length > 0;
    const hasGenre = item.missingFields.includes('genre') &&
                     (item.spotifyData?.genres?.length > 0 || item.trackData?.artists?.length > 0);
    const hasLabel = item.missingFields.includes('label') && item.spotifyData?.label;
    const hasArtwork = item.missingFields.includes('artwork') && item.spotifyData?.images?.length > 0;

    return hasReleaseDate || hasTitle || hasArtist || hasGenre || hasLabel || hasArtwork;
  });

  // Ask user for confirmation
  if (updatableMatches.length === 0) {
    console.log('ℹ️  No songs to update (Spotify has no data for missing fields). Exiting.');
    process.exit(0);
  }

  const answer = readlineSync.question('Do you want to proceed with the update? (Yes/No): ');

  if (answer.toLowerCase() !== 'yes' && answer.toLowerCase() !== 'y') {
    console.log('\n❌ Update cancelled by user. Exiting.');
    process.exit(0);
  }

  // Proceed with updates
  console.log('\n🔄 Updating metadata...\n');

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < updatableMatches.length; i++) {
    const item = updatableMatches[i];

    if (VERBOSE) {
      console.log(`\nUpdating: ${item.fileName}`);
    } else {
      process.stdout.write(`\rUpdating ${i + 1}/${updatableMatches.length} files...`);
    }

    const success = await updateFileMetadata(
      item.filePath,
      item.spotifyData,
      item.trackData,
      item.metadata,
      item.missingFields
    );

    if (success) {
      successCount++;
      if (VERBOSE) {
        console.log(`  ✅ Updated successfully`);
      }
    } else {
      failCount++;
      if (VERBOSE) {
        console.log(`  ❌ Update failed`);
      }
    }
  }

  // Clear the progress line if not in verbose mode
  if (!VERBOSE) {
    process.stdout.write('\r' + ' '.repeat(50) + '\r');
  }

  // Final summary
  console.log('\n' + '='.repeat(60));
  console.log('✨ Update Complete\n');
  console.log(`✅ Successfully updated: ${successCount} file(s)`);
  if (failCount > 0) {
    console.log(`❌ Failed to update: ${failCount} file(s)`);
  }
  console.log('='.repeat(60));
}

// Run the main process
main().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
