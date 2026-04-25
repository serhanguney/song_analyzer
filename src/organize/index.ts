import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanAndValidate } from './validate.ts';
import { moveToInvalidDir, moveToTarget } from './move.ts';
import { cleanupEmptyDirectories } from './cleanup.ts';

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

const VERBOSE = process.argv.includes('-v') || process.argv.includes('--verbose');
const SOURCE_DIRECTORY = process.env.SOURCE_DIRECTORY;
const TARGET_DIRECTORY = process.env.TARGET_DIRECTORY;

async function main() {
  console.log('📂 Audio File Organizer by Release Date\n');
  if (VERBOSE) {
    console.log('🔍 Running in verbose mode\n');
  } else {
    console.log('💡 Tip: Use -v or --verbose flag for detailed debug information\n');
  }

  // Validate config
  if (!SOURCE_DIRECTORY) {
    console.error('❌ Error: SOURCE_DIRECTORY not configured.');
    process.exit(1);
  }

  if (!TARGET_DIRECTORY) {
    console.error('❌ Error: TARGET_DIRECTORY not configured.');
    process.exit(1);
  }

  try {
    await fs.access(SOURCE_DIRECTORY);
  } catch {
    console.error(`❌ Error: Source directory "${SOURCE_DIRECTORY}" not found.`);
    process.exit(1);
  }

  await fs.mkdir(TARGET_DIRECTORY, { recursive: true });

  console.log(`📁 Source: ${SOURCE_DIRECTORY}`);
  console.log(`📁 Target: ${TARGET_DIRECTORY}\n`);
  console.log('🔍 Scanning and validating metadata...\n');

  // Step 1: Scan and validate
  const { valid, invalid } = await scanAndValidate(SOURCE_DIRECTORY);
  const totalFiles = valid.length + invalid.length;

  if (totalFiles === 0) {
    console.log('ℹ️  No audio files found.');
    process.exit(0);
  }

  console.log(`Found ${totalFiles} audio file(s)\n`);

  // Step 2: Move invalid files to [invalid]
  if (invalid.length > 0) {
    console.log(`⚠️  ${invalid.length} file(s) with invalid or missing metadata\n`);
    console.log('📦 Moving invalid files to [invalid]...\n');

    let movedToInvalid = 0;
    for (const file of invalid) {
      console.log(`📍 ${file.relativePath}`);
      console.log(`   Issue: ${file.reason}`);

      if (VERBOSE && file.metadata) {
        const m = file.metadata;
        if (m.title) console.log(`     Title: ${m.title}`);
        if (m.artist) console.log(`     Artist: ${m.artist}`);
        if (m.album) console.log(`     Album: ${m.album}`);
        if (m.releaseDate) console.log(`     Release Date: ${m.releaseDate}`);
        if (m.genre) console.log(`     Genre: ${m.genre}`);
        if (m.label) console.log(`     Label: ${m.label}`);
        console.log(`     Artwork: ${m.artwork ? 'Yes' : 'No'}`);
      }

      try {
        const result = await moveToInvalidDir(file.filePath, SOURCE_DIRECTORY);
        if (result.skipped) {
          console.log(`   ⏭️  Already in [invalid]`);
        } else {
          console.log(`   ⚠️  Moved to [invalid]`);
        }
        movedToInvalid++;
      } catch (err) {
        console.error(`   ❌ Error moving: ${getErrorMessage(err)}`);
      }
      console.log('');
    }

    console.log(`📦 Processed ${movedToInvalid} invalid file(s)\n`);
  }

  // Step 3: Organize valid files
  if (valid.length === 0) {
    console.log('ℹ️  No valid files to organize.');
    process.exit(0);
  }

  console.log(`✅ ${valid.length} file(s) with complete metadata\n`);
  console.log('📊 Organizing by release date...\n');

  let movedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const file of valid) {
    console.log(`📍 ${file.relativePath}`);

    try {
      const result = await moveToTarget(file.filePath, TARGET_DIRECTORY);

      if (result.success) {
        if (result.skipped) {
          console.log(`   ⏭️  Already in correct location`);
          skippedCount++;
        } else {
          console.log(`   ✅ Moved`);
          movedCount++;
        }
      } else {
        console.log(`   ⚠️  ${result.reason}`);
        failedCount++;
      }
    } catch (err) {
      console.error(`   ❌ Error: ${getErrorMessage(err)}`);
      failedCount++;
    }
  }

  // Step 4: Cleanup
  console.log('\n🧹 Cleaning up empty directories...\n');
  await cleanupEmptyDirectories(SOURCE_DIRECTORY, [SOURCE_DIRECTORY, TARGET_DIRECTORY], ['[invalid]']);

  // Summary
  console.log('='.repeat(60));
  console.log('✨ Organization Complete\n');
  if (invalid.length > 0) console.log(`📦 Moved to [invalid]: ${invalid.length} file(s)`);
  console.log(`✅ Organized: ${movedCount} file(s)`);
  console.log(`⏭️  Already organized: ${skippedCount} file(s)`);
  if (failedCount > 0) console.log(`❌ Failed: ${failedCount} file(s)`);
  console.log('='.repeat(60));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  main().catch(error => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });
}
