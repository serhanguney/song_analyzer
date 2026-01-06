import 'dotenv/config';
import readlineSync from 'readline-sync';
import { parseFile } from 'music-metadata';
import NodeID3 from 'node-id3';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { REQUIRED_FIELD_NAMES, AUDIO_EXTENSIONS } from './common.js';

// ANSI color codes
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

/**
 * Get all audio files from a directory recursively
 */
function getAudioFiles(dir) {
  let audioFiles = [];
  
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      audioFiles = audioFiles.concat(getAudioFiles(fullPath));
    } else {
      const ext = path.extname(file).toLowerCase();
      if (AUDIO_EXTENSIONS.includes(ext)) {
        audioFiles.push(fullPath);
      }
    }
  }
  
  return audioFiles;
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
 * Download artwork from URL
 */
async function downloadArtwork(url) {
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 30000
    });
    
    // Get mime type from response headers
    const contentType = response.headers['content-type'];
    
    // Validate it's an image
    if (!contentType || !contentType.startsWith('image/')) {
      throw new Error('URL does not point to an image');
    }
    
    return {
      mime: contentType,
      type: {
        id: 3,
        name: 'front cover'
      },
      description: 'Cover Art',
      imageBuffer: Buffer.from(response.data)
    };
  } catch (error) {
    if (error.code === 'ECONNABORTED') {
      throw new Error('Download timeout - image too large or server too slow');
    }
    throw new Error(`Failed to download artwork: ${error.message}`);
  }
}

/**
 * Read current metadata from file
 */
async function readMetadata(filePath) {
  try {
    const metadata = await parseFile(filePath);
    const common = metadata.common;
    
    return {
      title: common.title || '',
      artist: common.artist || '',
      album: common.album || '',
      releaseDate: common.date || common.year || '',
      artwork: common.picture && common.picture.length > 0 ? '[Has artwork]' : '[No artwork]',
      artworkData: common.picture && common.picture.length > 0 ? common.picture[0] : null,
      label: common.label?.[0] || '',
      genre: common.genre?.[0] || ''
    };
  } catch (error) {
    console.error(`Error reading metadata: ${error.message}`);
    return null;
  }
}

/**
 * Write metadata to file
 */
function writeMetadata(filePath, tags) {
  try {
    const ext = path.extname(filePath).toLowerCase();
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/e2c15320-3c63-447f-b3cf-ff696aca89e0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'update-tag.js:writeMetadata_entry',message:'writeMetadata called',data:{ext:ext,hasArtworkData:!!tags.artworkData,artworkDataMime:tags.artworkData?.mime,tagsKeys:Object.keys(tags)},timestamp:Date.now(),sessionId:'debug-session',runId:'initial',hypothesisId:'B,C,E'})}).catch(()=>{});
    // #endregion
    
    if (ext === '.mp3') {
      // For MP3 files, use node-id3
      const id3Tags = {
        title: tags.title,
        artist: tags.artist,
        album: tags.album,
        publisher: tags.label,
        genre: tags.genre
      };
      
      // Handle release date - write to multiple fields for compatibility
      if (tags.releaseDate) {
        const releaseDateStr = tags.releaseDate.trim();
        // Extract year and month for formatted date
        const dateParts = releaseDateStr.split(/[-/]/);
        const year = dateParts[0];
        const month = dateParts[1] || '01';
        const formatted = `${year}/${month}`;
        
        id3Tags.year = year;
        id3Tags.date = releaseDateStr;
        id3Tags.performerInfo = formatted;  // Album Artist field (TPE2 frame)
        id3Tags.releaseTime = releaseDateStr;
        id3Tags.originalReleaseTime = releaseDateStr;
        id3Tags.recordingTime = releaseDateStr;
      }
      
      // Add artwork if provided
      if (tags.artworkData) {
        id3Tags.image = {
          mime: tags.artworkData.mime,
          type: tags.artworkData.type,
          description: tags.artworkData.description,
          imageBuffer: tags.artworkData.imageBuffer
        };
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/e2c15320-3c63-447f-b3cf-ff696aca89e0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'update-tag.js:writeMetadata_artwork_added',message:'Artwork added to id3Tags',data:{hasImageField:!!id3Tags.image,imageMime:id3Tags.image?.mime},timestamp:Date.now(),sessionId:'debug-session',runId:'initial',hypothesisId:'B,C'})}).catch(()=>{});
        // #endregion
      } else {
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/e2c15320-3c63-447f-b3cf-ff696aca89e0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'update-tag.js:writeMetadata_no_artwork',message:'No artwork in tags.artworkData',data:{hasImageField:!!id3Tags.image,id3TagsHasImage:'image' in id3Tags},timestamp:Date.now(),sessionId:'debug-session',runId:'initial',hypothesisId:'B,D,E'})}).catch(()=>{});
        // #endregion
      }
      
      // Remove undefined values
      Object.keys(id3Tags).forEach(key => 
        id3Tags[key] === undefined && delete id3Tags[key]
      );
      
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/e2c15320-3c63-447f-b3cf-ff696aca89e0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'update-tag.js:writeMetadata_before_update',message:'Before NodeID3.update',data:{id3TagsKeys:Object.keys(id3Tags),hasImageInTags:'image' in id3Tags,imageFieldValue:id3Tags.image?'present':'absent'},timestamp:Date.now(),sessionId:'debug-session',runId:'initial',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      
      NodeID3.update(id3Tags, filePath);
      return true;
    } else if (ext === '.wav' || ext === '.aiff' || ext === '.aif') {
      // For WAV and AIFF, also use node-id3 (it supports these formats)
      const id3Tags = {
        title: tags.title,
        artist: tags.artist,
        album: tags.album,
        publisher: tags.label,
        genre: tags.genre
      };
      
      // Handle release date - write to multiple fields for compatibility
      if (tags.releaseDate) {
        const releaseDateStr = tags.releaseDate.trim();
        // Extract year and month for formatted date
        const dateParts = releaseDateStr.split(/[-/]/);
        const year = dateParts[0];
        const month = dateParts[1] || '01';
        const formatted = `${year}/${month}`;
        
        id3Tags.year = year;
        id3Tags.date = releaseDateStr;
        id3Tags.performerInfo = formatted;  // Album Artist field (TPE2 frame)
        id3Tags.releaseTime = releaseDateStr;
        id3Tags.originalReleaseTime = releaseDateStr;
        id3Tags.recordingTime = releaseDateStr;
      }
      
      // Add artwork if provided
      if (tags.artworkData) {
        id3Tags.image = {
          mime: tags.artworkData.mime,
          type: tags.artworkData.type,
          description: tags.artworkData.description,
          imageBuffer: tags.artworkData.imageBuffer
        };
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/e2c15320-3c63-447f-b3cf-ff696aca89e0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'update-tag.js:writeMetadata_wav_artwork_added',message:'Artwork added to id3Tags (WAV/AIFF)',data:{hasImageField:!!id3Tags.image,imageMime:id3Tags.image?.mime},timestamp:Date.now(),sessionId:'debug-session',runId:'initial',hypothesisId:'B,C'})}).catch(()=>{});
        // #endregion
      } else {
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/e2c15320-3c63-447f-b3cf-ff696aca89e0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'update-tag.js:writeMetadata_wav_no_artwork',message:'No artwork in tags.artworkData (WAV/AIFF)',data:{hasImageField:!!id3Tags.image},timestamp:Date.now(),sessionId:'debug-session',runId:'initial',hypothesisId:'B,D,E'})}).catch(()=>{});
        // #endregion
      }
      
      // Remove undefined values
      Object.keys(id3Tags).forEach(key => 
        id3Tags[key] === undefined && delete id3Tags[key]
      );
      
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/e2c15320-3c63-447f-b3cf-ff696aca89e0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'update-tag.js:writeMetadata_wav_before_update',message:'Before NodeID3.update (WAV/AIFF)',data:{id3TagsKeys:Object.keys(id3Tags),hasImageInTags:'image' in id3Tags},timestamp:Date.now(),sessionId:'debug-session',runId:'initial',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      
      NodeID3.update(id3Tags, filePath);
      return true;
    } else {
      console.log(`${YELLOW}⚠️  Warning: ${ext} format is read-only. Cannot update metadata.${RESET}`);
      return false;
    }
  } catch (error) {
    console.error(`Error writing metadata: ${error.message}`);
    return false;
  }
}

/**
 * Main interactive update function
 */
async function updateTagInteractive() {
  console.log(`${BOLD}${CYAN}=== Manual ID3 Tag Updater ===${RESET}\n`);
  
  // Get preparation directory from environment or use default
  const preparationDir = process.env.PREPARATION_DIRECTORY;
  
  if (!fs.existsSync(preparationDir)) {
    console.error(`${YELLOW}⚠️  Preparation directory not found: ${preparationDir}${RESET}`);
    console.log('Please set PREPARATION_DIRECTORY in your .env file or create a music directory');
    return;
  }
  
  // Get all audio files
  const audioFiles = getAudioFiles(preparationDir);
  
  if (audioFiles.length === 0) {
    console.log(`${YELLOW}No audio files found in ${preparationDir}${RESET}`);
    return;
  }
  
  // Display files with numbers
  console.log(`${BOLD}Found ${audioFiles.length} audio file(s):${RESET}\n`);
  audioFiles.forEach((file, index) => {
    const relativePath = path.relative(preparationDir, file);
    console.log(`${index + 1}. ${relativePath}`);
  });
  
  console.log('');
  
  // Select file
  const fileIndex = readlineSync.questionInt(`${CYAN}Select a file number (1-${audioFiles.length}): ${RESET}`) - 1;
  
  if (fileIndex < 0 || fileIndex >= audioFiles.length) {
    console.log(`${YELLOW}Invalid selection${RESET}`);
    return;
  }
  
  const selectedFile = audioFiles[fileIndex];
  const fileName = path.basename(selectedFile);
  
  console.log(`\n${BOLD}Selected: ${fileName}${RESET}\n`);
  
  // Read current metadata
  const currentMetadata = await readMetadata(selectedFile);
  
  if (!currentMetadata) {
    console.log(`${YELLOW}Could not read metadata from file${RESET}`);
    return;
  }
  
  // Show current values
  console.log(`${BOLD}Current metadata:${RESET}`);
  REQUIRED_FIELD_NAMES.forEach(field => {
    console.log(`  ${field}: ${currentMetadata[field] || '(empty)'}`);
  });
  console.log('');
  
  // Collect new values
  const newMetadata = { ...currentMetadata };
  
  console.log(`${BOLD}Enter new values (press Enter to skip and keep current value):${RESET}\n`);
  
  // Title
  const newTitle = readlineSync.question(
    `${CYAN}Title${RESET} [${currentMetadata.title || 'empty'}]: `
  );
  if (newTitle.trim()) {
    newMetadata.title = newTitle.trim();
  }
  
  // Artist
  const newArtist = readlineSync.question(
    `${CYAN}Artist${RESET} [${currentMetadata.artist || 'empty'}]: `
  );
  if (newArtist.trim()) {
    newMetadata.artist = newArtist.trim();
  }
  
  // Album
  const newAlbum = readlineSync.question(
    `${CYAN}Album${RESET} [${currentMetadata.album || 'empty'}]: `
  );
  if (newAlbum.trim()) {
    newMetadata.album = newAlbum.trim();
  }
  
  // Release Date
  let releaseDateValid = false;
  while (!releaseDateValid) {
    const newReleaseDate = readlineSync.question(
      `${CYAN}Release Date${RESET} [${currentMetadata.releaseDate || 'empty'}] (YYYY-MM-DD format required): `
    );
    
    if (!newReleaseDate.trim()) {
      // User pressed Enter to skip
      releaseDateValid = true;
      break;
    }
    
    // Convert YYYY/MM/DD to YYYY-MM-DD if user used slashes
    const normalizedDate = newReleaseDate.trim().replace(/\//g, '-');
    
    if (isValidReleaseDateFormat(normalizedDate)) {
      newMetadata.releaseDate = normalizedDate;
      releaseDateValid = true;
    } else {
      console.log(`${YELLOW}⚠️  Invalid format. Please enter date as YYYY-MM-DD (e.g., 2024-12-25)${RESET}`);
      console.log(`${YELLOW}   Or press Enter to skip and keep current value${RESET}`);
    }
  }
  
  // Label
  const newLabel = readlineSync.question(
    `${CYAN}Label${RESET} [${currentMetadata.label || 'empty'}]: `
  );
  if (newLabel.trim()) {
    newMetadata.label = newLabel.trim();
  }
  
  // Genre
  const newGenre = readlineSync.question(
    `${CYAN}Genre${RESET} [${currentMetadata.genre || 'empty'}]: `
  );
  if (newGenre.trim()) {
    newMetadata.genre = newGenre.trim();
  }
  
  // Artwork URL
  console.log('');
  // #region agent log
  fetch('http://127.0.0.1:7244/ingest/e2c15320-3c63-447f-b3cf-ff696aca89e0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'update-tag.js:artwork_before_prompt',message:'Before artwork prompt',data:{hasCurrentArtwork:!!currentMetadata.artworkData,currentArtworkType:currentMetadata.artworkData?.mime,artworkDisplay:currentMetadata.artwork},timestamp:Date.now(),sessionId:'debug-session',runId:'initial',hypothesisId:'A,C,E'})}).catch(()=>{});
  // #endregion
  const artworkUrl = readlineSync.question(
    `${CYAN}Artwork URL${RESET} [${currentMetadata.artwork}] (enter URL or press Enter to skip): `
  );
  // #region agent log
  fetch('http://127.0.0.1:7244/ingest/e2c15320-3c63-447f-b3cf-ff696aca89e0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'update-tag.js:artwork_after_prompt',message:'After artwork prompt',data:{userInput:artworkUrl,trimmedInput:artworkUrl.trim(),skipped:!artworkUrl.trim()},timestamp:Date.now(),sessionId:'debug-session',runId:'initial',hypothesisId:'A,E'})}).catch(()=>{});
  // #endregion
  if (artworkUrl.trim()) {
    try {
      console.log(`${YELLOW}Downloading artwork...${RESET}`);
      newMetadata.artworkData = await downloadArtwork(artworkUrl.trim());
      newMetadata.artwork = '[New artwork from URL]';
      console.log(`${GREEN}✓ Artwork downloaded successfully${RESET}`);
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/e2c15320-3c63-447f-b3cf-ff696aca89e0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'update-tag.js:artwork_downloaded',message:'Artwork downloaded',data:{hasNewArtwork:!!newMetadata.artworkData,newArtworkMime:newMetadata.artworkData?.mime},timestamp:Date.now(),sessionId:'debug-session',runId:'initial',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
    } catch (error) {
      console.log(`${YELLOW}⚠️  ${error.message}${RESET}`);
      console.log(`${YELLOW}Keeping current artwork${RESET}`);
    }
  } else {
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/e2c15320-3c63-447f-b3cf-ff696aca89e0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'update-tag.js:artwork_skipped',message:'User skipped artwork',data:{hasCurrentArtworkData:!!currentMetadata.artworkData,hasNewArtworkData:!!newMetadata.artworkData,shouldPreserve:!!currentMetadata.artworkData},timestamp:Date.now(),sessionId:'debug-session',runId:'initial',hypothesisId:'A,E'})}).catch(()=>{});
    // #endregion
  }
  
  console.log('');
  
  // Show comparison
  console.log(`\n${BOLD}${CYAN}=== Summary of Changes ===${RESET}\n`);
  
  let hasChanges = false;
  REQUIRED_FIELD_NAMES.forEach(field => {
    // Handle artwork comparison differently
    if (field === 'artwork') {
      const oldValue = currentMetadata[field];
      const newValue = newMetadata[field];
      
      if (newMetadata.artworkData && oldValue !== newValue) {
        hasChanges = true;
        console.log(`  ${field}:`);
        console.log(`    Old: ${oldValue}`);
        console.log(`    New: ${GREEN}${newValue}${RESET}`);
      } else {
        console.log(`  ${field}: ${oldValue} (unchanged)`);
      }
      return;
    }
    
    const oldValue = currentMetadata[field] || '(empty)';
    const newValue = newMetadata[field] || '(empty)';
    
    if (oldValue !== newValue) {
      hasChanges = true;
      console.log(`  ${field}:`);
      console.log(`    Old: ${oldValue}`);
      console.log(`    New: ${GREEN}${newValue}${RESET}`);
    } else {
      console.log(`  ${field}: ${oldValue} (unchanged)`);
    }
  });
  
  if (!hasChanges) {
    console.log(`\n${YELLOW}No changes made. Exiting.${RESET}`);
    return;
  }
  
  // Confirm update
  console.log('');
  const confirm = readlineSync.keyInYNStrict(`${CYAN}Apply these changes?${RESET}`);
  
  if (!confirm) {
    console.log(`${YELLOW}Update cancelled.${RESET}`);
    return;
  }
  
  // Write metadata
  const success = writeMetadata(selectedFile, newMetadata);
  
  if (success) {
    console.log(`\n${GREEN}✅ Metadata updated successfully!${RESET}`);
  } else {
    console.log(`\n${YELLOW}⚠️  Could not update metadata${RESET}`);
  }
}

// Run the script
updateTagInteractive().catch(error => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});

