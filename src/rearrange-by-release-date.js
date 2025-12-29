import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { parseFile } from 'music-metadata';
import { REQUIRED_FIELD_NAMES, AUDIO_EXTENSIONS } from './common.js';

// Configuration
const SOURCE_DIRECTORY = process.env.SOURCE_DIRECTORY;
const TARGET_DIRECTORY = process.env.TARGET_DIRECTORY;

/**
 * Get all audio files from directory recursively
 */
async function getAudioFiles(directory) {
  let audioFiles = [];
  
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      
      if (entry.isDirectory()) {
        // Recursively scan subdirectories (including [invalid])
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
 * Get relative path for display
 */
function getRelativePath(filePath, baseDir) {
  return path.relative(baseDir, filePath);
}

/**
 * Extract and validate metadata from audio file
 */
async function extractAndValidateMetadata(filePath) {
  try {
    const metadata = await parseFile(filePath);
    const common = metadata.common;
    
    // Extract metadata fields
    const fileMetadata = {
      title: common.title || null,
      artist: common.artist || common.artists?.join(', ') || null,
      album: common.album || null,
      genre: common.genre?.join(', ') || null,
      bpm: common.bpm || null,
      label: common.label?.join(', ') || null,
      artwork: (common.picture && common.picture.length > 0) ? true : false,
      releaseDate: null,
      releaseDateRaw: null,
      fileName: path.basename(filePath)
    };
    
    // Try to extract release date from various possible fields
    // Priority: originalReleaseTime > releaseTime > date > year
    if (common.originaldate) {
      fileMetadata.releaseDate = parseReleaseDate(common.originaldate);
      fileMetadata.releaseDateRaw = common.originaldate;
    } else if (common.date) {
      fileMetadata.releaseDate = parseReleaseDate(common.date);
      fileMetadata.releaseDateRaw = common.date;
    } else if (common.year) {
      fileMetadata.releaseDate = parseReleaseDate(common.year.toString());
      fileMetadata.releaseDateRaw = common.year.toString();
    }
    
    return fileMetadata;
  } catch (error) {
    console.error(`Error reading metadata from ${filePath}:`, error.message);
    return null;
  }
}

/**
 * Parse release date - strictly requires YYYY-MM-DD format
 */
function parseReleaseDate(dateString) {
  if (!dateString) return null;
  
  try {
    const dateStr = String(dateString).trim();
    
    // STRICT: Only accept YYYY-MM-DD format
    if (!dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
      return null; // Invalid format
    }
    
    const [year, month, day] = dateStr.split('-');
    
    // Validate year and month are reasonable
    const yearNum = parseInt(year);
    const monthNum = parseInt(month);
    const dayNum = parseInt(day);
    
    if (yearNum < 1900 || yearNum > new Date().getFullYear() + 1) {
      return null; // Invalid year
    }
    
    if (monthNum < 1 || monthNum > 12) {
      return null; // Invalid month
    }
    
    if (dayNum < 1 || dayNum > 31) {
      return null; // Invalid day
    }
    
    // Validate it's a real date
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      return null; // Invalid date
    }
    
    return {
      year,
      month,
      day,
      formatted: `${year}/${month}`,
      fullDate: dateStr,
      isValid: true
    };
  } catch (error) {
    return null;
  }
}

/**
 * Validate if all required fields are present
 */
function validateMetadata(metadata, filePath, baseDir) {
  const missingFields = [];
  const relativePath = getRelativePath(filePath, baseDir);
  
  // Check each required field
  for (const fieldName of REQUIRED_FIELD_NAMES) {
    if (!metadata[fieldName]) {
      missingFields.push(fieldName);
    }
  }
  
  return {
    isValid: missingFields.length === 0,
    missingFields,
    relativePath
  };
}

/**
 * Move file to [invalid] directory
 */
async function moveToInvalidDirectory(filePath, reason, baseDir) {
  try {
    const fileName = path.basename(filePath);
    const invalidDir = path.join(baseDir, '[invalid]');
    const newFilePath = path.join(invalidDir, fileName);
    
    // Check if file is already in [invalid] directory
    const fileDir = path.dirname(filePath);
    if (fileDir === invalidDir) {
      console.log(`   ⏭️  Already in [invalid]: ${fileName}`);
      console.log(`      Reason: ${reason}`);
      return { success: true, skipped: true };
    }
    
    // Create [invalid] directory if it doesn't exist
    await fs.mkdir(invalidDir, { recursive: true });
    
    // Check if destination file already exists
    let finalPath = newFilePath;
    let counter = 1;
    while (true) {
      try {
        await fs.access(finalPath);
        // File exists, try with counter
        const ext = path.extname(fileName);
        const nameWithoutExt = path.basename(fileName, ext);
        finalPath = path.join(invalidDir, `${nameWithoutExt}_${counter}${ext}`);
        counter++;
      } catch {
        // File doesn't exist, use this path
        break;
      }
    }
    
    // Move the file
    await fs.rename(filePath, finalPath);
    console.log(`   ⚠️  Moved to [invalid]: ${getRelativePath(filePath, baseDir)}`);
    console.log(`      Reason: ${reason}`);
    
    return { success: true };
  } catch (error) {
    console.error(`   ❌ Error moving file to [invalid]: ${error.message}`);
    return { success: false, reason: error.message };
  }
}

/**
 * Move file to new location based on release date
 */
async function moveFileByReleaseDate(filePath, releaseDate, baseDir, dryRun = false) {
  try {
    const fileName = path.basename(filePath);
    const yearFolder = path.join(baseDir, releaseDate.year);
    const monthFolder = path.join(yearFolder, releaseDate.month);
    const newFilePath = path.join(monthFolder, fileName);
    
    // Check if file already exists at destination
    if (filePath === newFilePath) {
      console.log(`   ⏭️  Already in correct location: ${getRelativePath(filePath, baseDir)}`);
      return { success: true, skipped: true };
    }
    
    if (dryRun) {
      console.log(`   📋 Would move: ${getRelativePath(filePath, baseDir)} → ${releaseDate.year}/${releaseDate.month}/${fileName}`);
      return { success: true, dryRun: true };
    }
    
    // Create year and month folders if they don't exist
    await fs.mkdir(monthFolder, { recursive: true });
    
    // Check if destination file already exists
    try {
      await fs.access(newFilePath);
      console.log(`   ⚠️  File already exists at destination: ${getRelativePath(newFilePath, baseDir)}`);
      console.log(`      Skipping to avoid overwrite.`);
      return { success: false, reason: 'File already exists at destination' };
    } catch {
      // File doesn't exist, proceed with move
    }
    
    // Move the file
    await fs.rename(filePath, newFilePath);
    console.log(`   ✅ Moved: ${getRelativePath(filePath, baseDir)} → ${releaseDate.year}/${releaseDate.month}/${fileName}`);
    
    return { success: true };
  } catch (error) {
    console.error(`   ❌ Error moving file: ${error.message}`);
    return { success: false, reason: error.message };
  }
}

/**
 * Clean up empty directories
 */
async function cleanupEmptyDirectories(directory, isSource = false) {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    
    // Recursively clean subdirectories first
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const subDir = path.join(directory, entry.name);
        // Skip [invalid] directory when cleaning source (since invalid files are stored there)
        if (isSource && entry.name === '[invalid]') {
          continue;
        }
        await cleanupEmptyDirectories(subDir, isSource);
      }
    }
    
    // Check if directory is now empty
    const updatedEntries = await fs.readdir(directory);
    // Don't remove the root SOURCE or TARGET directories
    if (updatedEntries.length === 0 && 
        directory !== SOURCE_DIRECTORY && 
        directory !== TARGET_DIRECTORY) {
      await fs.rmdir(directory);
      const baseDir = isSource ? SOURCE_DIRECTORY : TARGET_DIRECTORY;
      console.log(`   🧹 Removed empty directory: ${getRelativePath(directory, baseDir)}`);
    }
  } catch (error) {
    // Ignore errors for cleanup
  }
}

/**
 * Main process
 */
async function main() {
  console.log('📂 Audio File Organizer by Release Date\n');
  
  // Validate configuration
  if (!SOURCE_DIRECTORY) {
    console.error('❌ Error: SOURCE_DIRECTORY not configured.');
    console.error('Please set SOURCE_DIRECTORY in your .env file.');
    process.exit(1);
  }
  
  if (!TARGET_DIRECTORY) {
    console.error('❌ Error: TARGET_DIRECTORY not configured.');
    console.error('Please set TARGET_DIRECTORY in your .env file.');
    process.exit(1);
  }
  
  // Validate source directory exists
  try {
    await fs.access(SOURCE_DIRECTORY);
  } catch (error) {
    console.error(`❌ Error: Source directory "${SOURCE_DIRECTORY}" not found.`);
    console.error('Please create the directory or update SOURCE_DIRECTORY in your .env file.');
    process.exit(1);
  }
  
  // Create target directory if it doesn't exist
  try {
    await fs.mkdir(TARGET_DIRECTORY, { recursive: true });
  } catch (error) {
    console.error(`❌ Error: Could not create target directory "${TARGET_DIRECTORY}".`);
    process.exit(1);
  }
  
  console.log(`📁 Source directory: ${SOURCE_DIRECTORY}`);
  console.log(`📁 Target directory: ${TARGET_DIRECTORY}\n`);
  console.log(`🔍 Scanning source directory recursively...\n`);
  
  // Get all audio files from source directory
  const audioFiles = await getAudioFiles(SOURCE_DIRECTORY);
  
  if (audioFiles.length === 0) {
    console.log('ℹ️  No audio files found in the source directory or subdirectories.');
    process.exit(0);
  }
  
  console.log(`Found ${audioFiles.length} audio file(s)\n`);
  console.log('🔍 Validating metadata...\n');
  
  // Step 1: Validate all files and categorize them
  const validationResults = [];
  const invalidFiles = [];
  
  for (const filePath of audioFiles) {
    const metadata = await extractAndValidateMetadata(filePath);
    
    if (!metadata) {
      invalidFiles.push({
        filePath,
        reason: 'Failed to read metadata',
        relativePath: getRelativePath(filePath, SOURCE_DIRECTORY)
      });
      continue;
    }
    
    const validation = validateMetadata(metadata, filePath, SOURCE_DIRECTORY);
    
    // Check if release date is invalid or missing
    let hasInvalidDate = false;
    let dateReason = '';
    
    if (!metadata.releaseDate) {
      hasInvalidDate = true;
      if (metadata.releaseDateRaw) {
        dateReason = `Invalid release date format: "${metadata.releaseDateRaw}" (must be YYYY-MM-DD)`;
      } else {
        dateReason = 'Missing release date (must be YYYY-MM-DD format)';
      }
    } else if (!metadata.releaseDate.isValid) {
      hasInvalidDate = true;
      dateReason = `Invalid release date format: "${metadata.releaseDateRaw}" (must be YYYY-MM-DD)`;
    }
    
    if (!validation.isValid || hasInvalidDate) {
      let reason;
      if (hasInvalidDate && !validation.isValid) {
        reason = `${dateReason}, Missing fields: ${validation.missingFields.join(', ')}`;
      } else if (hasInvalidDate) {
        reason = dateReason;
      } else {
        reason = `Missing fields: ${validation.missingFields.join(', ')}`;
      }
      
      invalidFiles.push({
        filePath,
        relativePath: validation.relativePath,
        reason,
        missingFields: validation.missingFields,
        metadata
      });
    } else {
      validationResults.push({
        filePath,
        metadata
      });
    }
  }
  
  // Step 2: Move invalid files to [invalid] directory in SOURCE
  if (invalidFiles.length > 0) {
    console.log(`⚠️  Found ${invalidFiles.length} file(s) with invalid or missing metadata\n`);
    console.log('📦 Moving invalid files to [invalid] directory in source...\n');
    
    let movedToInvalidCount = 0;
    
    for (const file of invalidFiles) {
      console.log(`📍 ${file.relativePath}`);
      console.log(`   Issue: ${file.reason}`);
      
      if (file.metadata) {
        console.log(`   Current metadata:`);
        if (file.metadata.title) console.log(`     - Title: ${file.metadata.title}`);
        if (file.metadata.artist) console.log(`     - Artist: ${file.metadata.artist}`);
        if (file.metadata.album) console.log(`     - Album: ${file.metadata.album}`);
        if (file.metadata.releaseDateRaw) console.log(`     - Release Date: ${file.metadata.releaseDateRaw}`);
        if (file.metadata.genre) console.log(`     - Genre: ${file.metadata.genre}`);
        if (file.metadata.bpm) console.log(`     - BPM: ${file.metadata.bpm}`);
        if (file.metadata.label) console.log(`     - Label: ${file.metadata.label}`);
        console.log(`     - Artwork: ${file.metadata.artwork ? 'Yes' : 'No'}`);
      }
      
      const result = await moveToInvalidDirectory(file.filePath, file.reason, SOURCE_DIRECTORY);
      if (result.success) {
        movedToInvalidCount++;
      }
      console.log('');
    }
    
    console.log(`📦 Moved ${movedToInvalidCount} file(s) to [invalid] directory\n`);
  }
  
  // Check if there are any valid files to organize
  if (validationResults.length === 0) {
    console.log('ℹ️  No valid files to organize. All files moved to [invalid] directory.');
    process.exit(0);
  }
  
  // All valid files
  console.log(`✅ ${validationResults.length} file(s) have complete and valid metadata\n`);
  console.log('📊 Organizing files by release date...\n');
  
  // Step 3: Move valid files to their release date folders in TARGET
  let movedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  
  for (const item of validationResults) {
    const { filePath, metadata } = item;
    const relativePath = getRelativePath(filePath, SOURCE_DIRECTORY);
    
    console.log(`\n📍 Processing: ${relativePath}`);
    console.log(`   Release Date: ${metadata.releaseDate.formatted} (${metadata.releaseDateRaw})`);
    
    const result = await moveFileByReleaseDate(
      filePath,
      metadata.releaseDate,
      TARGET_DIRECTORY,
      false // Set to true for dry run
    );
    
    if (result.success) {
      if (result.skipped) {
        skippedCount++;
      } else {
        movedCount++;
      }
    } else {
      failedCount++;
    }
  }
  
  // Step 4: Clean up empty directories in SOURCE
  console.log('\n🧹 Cleaning up empty directories in source...\n');
  await cleanupEmptyDirectories(SOURCE_DIRECTORY, true);
  
  // Final summary
  console.log('\n' + '='.repeat(60));
  console.log('✨ Organization Complete\n');
  
  if (invalidFiles.length > 0) {
    console.log(`📦 Moved to [invalid]: ${invalidFiles.length} file(s)`);
  }
  console.log(`✅ Organized: ${movedCount} file(s)`);
  console.log(`⏭️  Already organized: ${skippedCount} file(s)`);
  if (failedCount > 0) {
    console.log(`❌ Failed: ${failedCount} file(s)`);
  }
  console.log('='.repeat(60));
}

// Run the main process
main().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});

