import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';
import readlineSync from 'readline-sync';
import { parseFile } from 'music-metadata';
import NodeID3 from 'node-id3';
import { REQUIRED_FIELD_NAMES, AUDIO_EXTENSIONS } from './common.js';

// Configuration
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const SOURCE_DIRECTORY = process.env.SOURCE_DIRECTORY;
const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/api/token';
const SPOTIFY_API_URL = 'https://api.spotify.com/v1';

// Global access token
let accessToken = null;

/**
 * Get Spotify access token using Client Credentials flow
 */
async function getSpotifyAccessToken() {
  try {
    const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
    
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
function cleanSearchString(str) {
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
function getPrimaryArtist(artistString) {
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
function validateArtistMatch(searchArtist, spotifyArtists) {
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
function stringSimilarity(str1, str2) {
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
async function searchSpotifyTrack(artist, track) {
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
async function searchSpotifyAlbum(artist, album) {
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
async function getSpotifyAlbum(albumId) {
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
async function getSpotifyArtist(artistId) {
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
 * Get relative path for display
 */
function getRelativePath(filePath, baseDir) {
  return path.relative(baseDir, filePath);
}

/**
 * Extract artist, track name, and album from metadata
 */
async function extractMetadata(filePath) {
  try {
    const metadata = await parseFile(filePath);
    const common = metadata.common;
    
    // Get label from either 'label' or 'publisher' field (different tag formats use different names)
    const labelValue = common.label || common.publisher;
    const label = Array.isArray(labelValue) ? labelValue.join(', ') : (labelValue || null);
    
    return {
      title: common.title || null,  // Changed from 'track' to 'title' to match REQUIRED_FIELD_NAMES
      artist: common.artist || common.albumartist || null,
      album: common.album || null,
      genre: Array.isArray(common.genre) ? common.genre.join(', ') : (common.genre || null),
      label: label,  // Check both 'label' and 'publisher' fields
      bpm: common.bpm || null,
      artwork: (common.picture && common.picture.length > 0) || null,
      releaseDate: common.date || common.originaldate || common.year?.toString() || null,
      fileName: path.basename(filePath),
    };
  } catch (error) {
    console.error(`Error reading metadata from ${filePath}:`, error.message);
    return { 
      title: null,  // Changed from 'track' to 'title' to match REQUIRED_FIELD_NAMES
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

/**
 * Check which required fields are missing from metadata
 */
function getMissingRequiredFields(metadata) {
  const missing = [];
  
  for (const fieldName of REQUIRED_FIELD_NAMES) {
    if (!metadata[fieldName]) {
      missing.push(fieldName);
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
      console.warn(`⚠️  No release date found for ${path.basename(filePath)}`);
      console.log('\n📋 Full Spotify Response:');
      console.log(JSON.stringify(spotifyData, null, 2));
      console.log(''); // Empty line for readability
      return false;
    }
    
    // node-id3 supports MP3, WAV, and AIFF files
    if (ext === '.mp3' || ext === '.wav' || ext === '.aiff' || ext === '.aif') {
      try {
        // Prepare tags to write - always update date fields
        // Note: We store the formatted date in performerInfo (Album Artist) to avoid overwriting the actual album name
        const tags = {
          year: releaseDate.formatted.split('/')[0],
          date: releaseDate.full,
          performerInfo: releaseDate.formatted,  // Album Artist field (TPE2 frame)
          releaseTime: releaseDate.full,
          originalReleaseTime: releaseDate.full,
          recordingTime: releaseDate.full
        };
        
        // Fill in missing required fields from Spotify data
        const fieldsFilledIn = [];
        
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
              const artistData = await getSpotifyArtist(trackData.artists[0].id);
              if (artistData?.genres?.length > 0) {
                genres = artistData.genres;
                genreSource = 'artist';
              }
            } catch (error) {
              console.warn(`   ⚠️  Failed to fetch artist genres: ${error.message}`);
            }
          }
          
          if (genres.length > 0) {
            console.log(`   🎸 Writing genre from ${genreSource}: "${genres.join(', ')}"`);
            tags.genre = genres.join(', ');
            fieldsFilledIn.push('genre');
          } else {
            console.log(`   ⚠️  Genre missing - no genre data from Spotify (album or artist)`);
          }
        }
        
        // Label - from album data (NodeID3 uses 'publisher' field for record label)
        if (missingFields.includes('label') && spotifyData?.label) {
          console.log(`   🏷️  Writing label: "${spotifyData.label}"`);
          tags.publisher = spotifyData.label;  // NodeID3 uses 'publisher' not 'label'
          fieldsFilledIn.push('label');
        } else if (missingFields.includes('label')) {
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
            console.warn(`   ⚠️  Failed to download artwork: ${imageError.message}`);
          }
        }
        
        // Note: BPM cannot be filled from Spotify API
        // This needs to be added manually or through other means
        
        // Debug: Show what we're about to write
        console.log(`   📝 Tags to write:`, JSON.stringify(tags, null, 2));
        
        // Update only the specified tags, preserving all other existing metadata
        const success = NodeID3.update(tags, filePath);
        
        if (!success) {
          console.warn(`⚠️  Failed to write tags to ${ext} file`);
          return false;
        }
        
        console.log(`✅ Successfully updated metadata for ${path.basename(filePath)}`);
        if (fieldsFilledIn.length > 0) {
          console.log(`   📝 Filled missing fields from Spotify: ${fieldsFilledIn.join(', ')}`);
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
          console.log(`   ⚠️  Still missing (Spotify has no data): ${stillMissing.join(', ')}`);
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
        
        return true;
      } catch (writeError) {
        console.error(`Error writing tags to ${ext} file:`, writeError.message);
        return false;
      }
    } else if (ext === '.m4a' || ext === '.flac') {
      // For M4A and FLAC, we would need format-specific libraries
      console.warn(`⚠️  Metadata update not supported for ${ext} files yet`);
      console.log(`   Consider converting to MP3, WAV, or AIFF for metadata updates`);
      return false;
    } else {
      console.warn(`⚠️  Unknown file format: ${ext}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Error updating metadata for ${path.basename(filePath)}:`, error.message);
    console.log('\n📋 Full Spotify Response (on error):');
    console.log(JSON.stringify(spotifyData, null, 2));
    console.log(''); // Empty line for readability
    return false;
  }
}

/**
 * Main process
 */
async function main() {
  console.log('🎵 Song Metadata Analyzer (Spotify Edition)\n');
  
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
    accessToken = await getSpotifyAccessToken();
    console.log('✅ Successfully authenticated\n');
  } catch (error) {
    console.error('❌ Failed to authenticate with Spotify');
    process.exit(1);
  }
  
  // Validate directory
  try {
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
    suspicious: []
  };
  
  console.log('🔍 Searching Spotify for track information...\n');
  
  for (const filePath of audioFiles) {
    const relativePath = getRelativePath(filePath, SOURCE_DIRECTORY);
    const metadata = await extractMetadata(filePath);
    
    console.log(`\n📍 Processing: ${relativePath}`);
    
    // Check for missing required fields
    const missingFields = getMissingRequiredFields(metadata);
    if (missingFields.length > 0) {
      console.log(`   📝 Missing fields: ${missingFields.join(', ')}`);
    }
    
    if (!metadata.artist) {
      console.log(`   ⚠️  Cannot search without artist name`);
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
      console.log(`   Searching (track): ${metadata.artist} - ${metadata.title}`);
      const trackResult = await searchSpotifyTrack(metadata.artist, metadata.title);
      
      if (trackResult && trackResult.album) {
        // Store track data for metadata filling
        trackData = trackResult;
        // Get full album details to ensure we have label and other complete info
        spotifyData = await getSpotifyAlbum(trackResult.album.id);
        if (spotifyData && spotifyData.release_date) {
          console.log(`   ✅ Match found via track search`);
          // Log what fields Spotify has
          const spotifyFields = [];
          if (spotifyData.genres?.length > 0) spotifyFields.push('genre');
          if (spotifyData.label) spotifyFields.push('label');
          if (spotifyData.images?.length > 0) spotifyFields.push('artwork');
          if (trackData.name) spotifyFields.push('title');
          if (trackData.artists?.length > 0) spotifyFields.push('artist');
          if (spotifyFields.length > 0) {
            console.log(`   📦 Spotify has: ${spotifyFields.join(', ')}`);
          } else {
            console.log(`   ⚠️  Spotify has no additional metadata`);
          }
        }
      }
    }
    
    // Fallback to album search if track search failed or no track name
    if (!spotifyData && metadata.album) {
      console.log(`   Searching (album): ${metadata.artist} - ${metadata.album}`);
      const albumResult = await searchSpotifyAlbum(metadata.artist, metadata.album);
      
      if (albumResult) {
        // Get full album details
        spotifyData = await getSpotifyAlbum(albumResult.id);
        if (spotifyData && spotifyData.release_date) {
          console.log(`   ✅ Match found via album search`);
          // Log what fields Spotify has
          const spotifyFields = [];
          if (spotifyData.genres?.length > 0) spotifyFields.push('genre');
          if (spotifyData.label) spotifyFields.push('label');
          if (spotifyData.images?.length > 0) spotifyFields.push('artwork');
          if (spotifyFields.length > 0) {
            console.log(`   📦 Spotify has: ${spotifyFields.join(', ')}`);
          } else {
            console.log(`   ⚠️  Spotify has no additional metadata (no genre/label/artwork)`);
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
      console.log(`   ⚠️  ${spotifyData ? 'Found but no release date' : 'No match found'}`);
    }
  }
  
  // Display summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Summary\n');
  console.log(`Match found for ${results.matched.length} song(s) ✅`);
  
  if (results.notMatched.length > 0) {
    console.log(`No match found for ${results.notMatched.length} song(s) ⚠️:\n`);
    results.notMatched.forEach(item => {
      console.log(`  - ${item.fileName} (${item.reason})`);
    });
  }
  
  // Display suspicious matches
  if (results.suspicious.length > 0) {
    console.log(`\n⚠️  SUSPICIOUS MATCHES (${results.suspicious.length}) - Please review carefully:\n`);
    results.suspicious.forEach(item => {
      console.log(`  - ${item.fileName}`);
      console.log(`    Found: "${item.foundAlbum}" by ${item.foundArtist}`);
      console.log(`    Release Date: ${item.releaseDate}`);
      console.log(`    Reason: ${item.reason}\n`);
    });
    console.log('These matches may be incorrect. Review them before proceeding!');
  }
  
  console.log('='.repeat(60) + '\n');
  
  // Ask user for confirmation
  if (results.matched.length === 0) {
    console.log('ℹ️  No songs to update. Exiting.');
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
  
  for (const item of results.matched) {
    console.log(`\nUpdating: ${item.fileName}`);
    const success = await updateFileMetadata(
      item.filePath, 
      item.spotifyData, 
      item.trackData,
      item.metadata,
      item.missingFields
    );
    
    if (success) {
      successCount++;
      console.log(`  ✅ Updated successfully`);
    } else {
      failCount++;
      console.log(`  ❌ Update failed`);
    }
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
