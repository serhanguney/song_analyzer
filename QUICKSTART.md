# Quick Start Guide

## Setup Steps

### 1. Configure Environment Variables
Copy the example environment file and edit it with your Spotify API credentials:

```bash
cp env.example .env
```

Then edit `.env` and add your Spotify credentials:

**How to get Spotify credentials:**
1. Go to https://developer.spotify.com/dashboard
2. Log in with your Spotify account
3. Click "Create app"
4. Fill in app details (any name/description works)
5. Add redirect URI: `http://localhost`
6. Select "Web API" 
7. Copy your Client ID and Client Secret

Add them to `.env`:
```
CLIENT_ID=your_actual_client_id
CLIENT_SECRET=your_actual_client_secret
MUSIC_DIRECTORY=./music
```

### 2. Prepare Your Music Files
Place your audio files in the `music` directory:

```bash
# The directory is already created, just add your files
cp /path/to/your/music/*.mp3 ./music/
```

**Supported formats:**
- ✅ **MP3** - Full metadata update support
- ✅ **WAV** - Full metadata update support
- ✅ **AIFF/AIF** - Full metadata update support
- ⚠️ **M4A, FLAC** - Can search and display info, but cannot update metadata yet

### 3. Run the Script
```bash
npm start
```

## What the Script Does

1. **Authenticates** with Spotify using Client Credentials flow
2. **Scans** the music directory for audio files
3. **Reads** metadata (artist, album, and track name) from each file
4. **Searches** Spotify for matching albums/tracks with smart failsafe:
   - First tries album search (if album name exists)
   - Falls back to track search (if album search fails or album name missing)
5. **Displays** a summary showing:
   - ✅ Number of matched songs
   - ⚠️ Number of unmatched songs (with filenames and reasons)
6. **Asks** for confirmation before making changes
7. **Updates** metadata for matched songs:
   - Sets Release Date from Spotify's album data
   - Updates Album field to YYYY/MM format
   - Removes Album Artist field

## Example Output

```
🎵 Song Metadata Analyzer (Spotify Edition)

🔐 Authenticating with Spotify...
✅ Successfully authenticated

📁 Scanning directory: ./music

Found 5 audio file(s)

🔍 Searching Spotify for track information...

   Searching (album): Daft Punk - Discovery
   ✅ Match found via album search
   Searching (album): The Beatles - Help!
   ✅ Match found via album search
   Searching (track): Artist Name - Track Name
   ✅ Match found via track search
   ...

============================================================
📊 Summary

Match found for 4 song(s) ✅
No match found for 1 song(s) ⚠️:

  - unknown_track.mp3 (Missing artist metadata)
============================================================

Do you want to proceed with the update? (Yes/No): 
```

## Troubleshooting

### "Spotify CLIENT_ID not configured" Error
Make sure you've created a `.env` file (not just `env.example`) and added your Spotify Client ID from the developer dashboard.

### "CLIENT_SECRET not configured" Error
Add your Spotify Client Secret to the `.env` file from the developer dashboard.

### "Failed to authenticate with Spotify" Error
- Double-check your Client ID and Client Secret are correct
- Make sure there are no extra spaces in your `.env` file
- Verify your Spotify app is active in the developer dashboard

### "Music directory not found" Error
Make sure the `music` directory exists and contains audio files.

### "No audio files found"
Verify that your files have supported extensions (.mp3, .m4a, .flac, .wav, .aiff).

### "No match found" for Songs
This can happen if:
- The artist metadata is missing from the file
- The artist/album/track names don't match Spotify's database
- The song is not available on Spotify

**Solution:** Ensure your files have at minimum:
- **Artist** name (required)
- **Album** name (preferred) OR **Track** name (fallback)

Spotify has excellent coverage, but some songs (bootlegs, unofficial remixes, very obscure releases) may not be in their database.

