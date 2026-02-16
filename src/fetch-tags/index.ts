import 'dotenv/config';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import readlineSync from 'readline-sync';
import { getClientCredentialsToken } from '../spotify/index.ts';
import { scanDirectory } from './scan.ts';
import { matchToSpotify } from './match.ts';
import { filterUpdatableMatches, displaySummary } from './summary.ts';
import { updateFile } from './write-tags.ts';

const VERBOSE = process.argv.includes('-v') || process.argv.includes('--verbose');
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const SOURCE_DIRECTORY = process.env.SOURCE_DIRECTORY;

async function main() {
  console.log('🎵 Song Metadata Analyzer (Spotify Edition)');
  if (VERBOSE) {
    console.log('🔍 Running in verbose mode\n');
  } else {
    console.log('💡 Tip: Use -v or --verbose flag for detailed logs\n');
  }

  // Validate config
  if (!CLIENT_ID || CLIENT_ID === 'your_id_here') {
    console.error('❌ Error: Spotify CLIENT_ID not configured.');
    console.error('Please set CLIENT_ID in your .env file.');
    process.exit(1);
  }

  if (!CLIENT_SECRET || CLIENT_SECRET === 'your_secret_key_here') {
    console.error('❌ Error: Spotify CLIENT_SECRET not configured.');
    console.error('Please set CLIENT_SECRET in your .env file.');
    process.exit(1);
  }

  if (!SOURCE_DIRECTORY) {
    console.error('❌ Error: SOURCE_DIRECTORY not configured.');
    console.error('Please set SOURCE_DIRECTORY in your .env file.');
    process.exit(1);
  }

  // Authenticate
  console.log('🔐 Authenticating with Spotify...');
  let accessToken: string;
  try {
    accessToken = await getClientCredentialsToken(CLIENT_ID, CLIENT_SECRET);
    console.log('✅ Successfully authenticated\n');
  } catch {
    console.error('❌ Failed to authenticate with Spotify');
    process.exit(1);
  }

  // Validate directory
  try {
    await fs.access(SOURCE_DIRECTORY);
  } catch {
    console.error(`❌ Error: Directory "${SOURCE_DIRECTORY}" not found.`);
    process.exit(1);
  }

  // Scan
  console.log(`📁 Scanning directory recursively: ${SOURCE_DIRECTORY}\n`);
  const scannedFiles = await scanDirectory(SOURCE_DIRECTORY);

  if (scannedFiles.length === 0) {
    console.log('ℹ️  No audio files found.');
    process.exit(0);
  }

  console.log(`Found ${scannedFiles.length} audio file(s)\n`);
  console.log('🔍 Searching Spotify for track information...\n');

  // Match
  const results = await matchToSpotify(accessToken, scannedFiles, VERBOSE);

  // Summary
  displaySummary(results, VERBOSE);

  // Filter to updatable matches
  const { updatable } = filterUpdatableMatches(results.matched);

  if (updatable.length === 0) {
    console.log('ℹ️  No songs to update. Exiting.');
    process.exit(0);
  }

  // Confirm
  const answer = readlineSync.question('Do you want to proceed with the update? (Yes/No): ');
  if (answer.toLowerCase() !== 'yes' && answer.toLowerCase() !== 'y') {
    console.log('\n❌ Update cancelled. Exiting.');
    process.exit(0);
  }

  // Update
  console.log('\n🔄 Updating metadata...\n');
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < updatable.length; i++) {
    const item = updatable[i];

    if (VERBOSE) {
      console.log(`\nUpdating: ${item.fileName}`);
    } else {
      process.stdout.write(`\rUpdating ${i + 1}/${updatable.length} files...`);
    }

    const success = await updateFile(
      accessToken,
      item.filePath,
      item.spotifyData,
      item.trackData,
      item.missingFields,
      item.metadata.releaseDate,
      VERBOSE,
    );

    if (success) {
      successCount++;
      if (VERBOSE) console.log(`  ✅ Updated successfully`);
    } else {
      failCount++;
      if (VERBOSE) console.log(`  ❌ Update failed`);
    }
  }

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

// Only run when executed directly
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  main().catch(error => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });
}
