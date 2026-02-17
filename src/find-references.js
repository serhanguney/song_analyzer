import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { AUDIO_EXTENSIONS } from './common.js';
import { textInput } from './ui/prompts.ts';

// Check for verbose flag
const VERBOSE = process.argv.includes('-v') || process.argv.includes('--verbose');

// ANSI color codes
const colors = {
  green: '\x1b[32m',
  reset: '\x1b[0m'
};

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
 * Get filename without extension
 */
function getBaseName(filePath) {
  const fileName = path.basename(filePath);
  const ext = path.extname(fileName);
  return fileName.slice(0, fileName.length - ext.length);
}

/**
 * Prompt user for a directory path and validate it exists
 */
async function promptForDirectory(promptMessage) {
  while (true) {
    const dirPath = await textInput(promptMessage);

    if (!dirPath.trim()) {
      console.error('❌ Please enter a directory path.\n');
      continue;
    }

    try {
      const stats = await fs.stat(dirPath.trim());
      if (!stats.isDirectory()) {
        console.error(`❌ Error: "${dirPath}" is not a directory. Please try again.\n`);
        continue;
      }
      return dirPath.trim();
    } catch {
      console.error(`❌ Error: Directory "${dirPath}" not found. Please try again.\n`);
    }
  }
}

/**
 * Find references to source files in target directory
 */
async function findReferences() {
  console.log('🔍 Audio File Reference Finder\n');
  console.log('This script will find references to audio files from a source directory');
  console.log('within a target directory (e.g., Ableton projects).\n');
  if (!VERBOSE) {
    console.log('💡 Tip: Use -v or --verbose flag for detailed reference paths\n');
  } else {
    console.log('🔍 Running in verbose mode\n');
  }
  console.log('💡 Tip: Press Ctrl+C at any prompt to cancel.\n');
  
  // Prompt for SOURCE_DIRECTORY
  const SOURCE_DIRECTORY = await promptForDirectory(
    'Enter the SOURCE directory path (containing audio samples): '
  );
  console.log(`✅ Source directory set: ${SOURCE_DIRECTORY}\n`);
  
  // Prompt for TARGET_DIRECTORY
  const TARGET_DIRECTORY = await promptForDirectory(
    'Enter the TARGET directory path (to search for references): '
  );
  console.log(`✅ Target directory set: ${TARGET_DIRECTORY}\n`);
  
  // Get all audio files from source directory
  console.log('🔎 Scanning source directory...');
  const sourceFiles = await getAudioFiles(SOURCE_DIRECTORY);
  
  if (sourceFiles.length === 0) {
    console.log('ℹ️  No audio files found in source directory.');
    process.exit(0);
  }
  
  console.log(`Found ${sourceFiles.length} audio file(s) in source directory\n`);
  
  // Get all audio files from target directory
  console.log('🔎 Scanning target directory...');
  const targetFiles = await getAudioFiles(TARGET_DIRECTORY);
  
  if (targetFiles.length === 0) {
    console.log('ℹ️  No audio files found in target directory.');
    process.exit(0);
  }
  
  console.log(`Found ${targetFiles.length} audio file(s) in target directory\n`);
  
  // Find references
  console.log('🔍 Finding references...\n');
  console.log('='.repeat(80));
  
  const results = [];
  
  for (const sourceFile of sourceFiles) {
    const sourceBaseName = getBaseName(sourceFile);
    const matches = [];
    
    for (const targetFile of targetFiles) {
      const targetBaseName = getBaseName(targetFile);
      
      // Check if source basename is included in target basename
      if (targetBaseName.includes(sourceBaseName)) {
        matches.push(targetFile);
      }
    }
    
    if (matches.length > 0) {
      results.push({
        sourceFile,
        sourceBaseName,
        matches
      });
    }
  }
  
  // Display results
  if (results.length === 0) {
    console.log('\nℹ️  No references found.');
  } else {
    console.log(`\n✅ Found references for ${results.length} source file(s):\n`);
    
    for (const result of results) {
      const relativePath = path.relative(SOURCE_DIRECTORY, result.sourceFile);
      console.log(`📄 Source: ${relativePath}`);
      console.log(`   Base name: ${colors.green}${result.sourceBaseName}${colors.reset}`);
      console.log(`   Found ${result.matches.length} reference(s)`);
      
      if (VERBOSE) {
        console.log('');
        for (const match of result.matches) {
          const relativeMatchPath = path.relative(TARGET_DIRECTORY, match);
          const matchBaseName = getBaseName(match);
          console.log(`     ➜ ${relativeMatchPath}`);
          console.log(`       Base name: ${colors.green}${matchBaseName}${colors.reset}`);
          console.log(`       Full path: ${match}\n`);
        }
      }
      
      console.log('');
    }
  }
  
  console.log('='.repeat(80));
  
  // Summary
  const totalMatches = results.reduce((sum, result) => sum + result.matches.length, 0);
  console.log('\n📊 Summary:');
  console.log(`   Source files scanned: ${sourceFiles.length}`);
  console.log(`   Source files with references: ${results.length}`);
  console.log(`   Total references found: ${totalMatches}`);
  console.log(`   Source files without references: ${sourceFiles.length - results.length}\n`);
}

// Run the script
findReferences().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});

