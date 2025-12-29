# song_analyzer

An application written in Node JS for DJs to automate metadata management and library organization.

# Purpose

This application provides two main tools for DJs:

1. **Metadata Updater** (`index.js`) - Fetches and updates release dates from Spotify API
2. **Library Organizer** (`rearrange-by-release-date.js`) - Organizes your music library by release date into Year/Month folders

Both tools work together to help you maintain a well-organized and properly tagged music library.

## Metadata

The metadata of the songs in the given directory will be fetched using the Spotify Web API with intelligent search and failsafe mechanisms.

**API Documentation**: https://developer.spotify.com/documentation/web-api

**API endpoints used**:

1. **Authentication**: [Client Credentials Flow](https://developer.spotify.com/documentation/web-api/concepts/authorization) - OAuth token generation
2. **Primary Search**: [Search API (Album)](https://developer.spotify.com/documentation/web-api/reference/search) - Uses artist + album name
3. **Fallback Search**: [Search API (Track)](https://developer.spotify.com/documentation/web-api/reference/search) - Uses artist + track name
4. **Album Details**: [Get Album](https://developer.spotify.com/documentation/web-api/reference/get-an-album) - Retrieves complete album metadata including release dates

### How It Works

The script uses Spotify's comprehensive music database to fetch accurate release dates:

1. **Authenticates** with Spotify using Client Credentials (no user login required)
2. **Searches by Album** first if album name exists in file metadata
3. **Falls back to Track Search** if album search fails or album name is missing
4. **Extracts release date** from Spotify's album data (available in year, month, or day precision)

### Why Spotify?

✅ **Comprehensive database**: Millions of tracks with complete metadata  
✅ **Reliable release dates**: Nearly all albums and tracks have release date information  
✅ **High accuracy**: Professional music industry data  
✅ **Better for DJs**: Excellent coverage of electronic music, remixes, and singles  
✅ **No missing data**: Unlike Last.fm, Spotify rarely has albums without release dates

### Update Instructions

1. Fetch the song information from the API.
2. Update Release Date of the song (YYYY/MM/DD)
3. Delete Album Artist from Metadata
4. Update Album with the tracks release date in the following format (YYYY/MM)

## Update Process

The app will scan the directory and follow the below steps:

1. Log the following before proceeding with the update: Match found for {count} songs ✅ - No match found for {count} songs ⚠️: (list of missing filenames)
2. Ask the user wether to proceed with the update or not by allowing Yes or No options in the terminal.
3. If the user chooses No, exit the process. Otherwise proceed with the update.

## Installation

1. Install dependencies:

```bash
npm install
```

2. Create a `.env` file based on `env.example`:

```bash
cp env.example .env
```

3. **Get your Spotify API credentials:**

   a. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)

   b. Log in with your Spotify account (free account works fine)

   c. Click "Create app"

   d. Fill in the app details:

   - App name: "Song Metadata Analyzer" (or any name you prefer)
   - App description: "Metadata management for DJ library"
   - Redirect URI: `http://localhost` (required but not used)
   - APIs used: Select "Web API"

   e. Copy your **Client ID** and **Client Secret**

   f. Add them to your `.env` file:

```
CLIENT_ID=your_actual_client_id_here
CLIENT_SECRET=your_actual_client_secret_here
MUSIC_DIRECTORY=./music
```

4. Create a `music` directory and add your audio files (including subdirectories):

```bash
mkdir music
```

**Note:** The script will recursively scan all subdirectories within the music folder, making it easy to organize your tracks by artist, album, or genre in separate folders.

**Supported formats for metadata updates:**

- ✅ **MP3** - Full support
- ✅ **WAV** - Full support
- ✅ **AIFF/AIF** - Full support
- ⚠️ **M4A, FLAC** - Read-only (can search but cannot update metadata yet)

## Usage

### Tool 1: Metadata Updater

Run the metadata updater to fetch release dates from Spotify:

```bash
npm start
```

The script will:

- Authenticate with Spotify
- Recursively scan the music directory and all subdirectories for audio files
- Search Spotify for metadata (album first, then track as fallback)
- Display a summary of matches and non-matches with relative file paths
- Ask for confirmation before updating
- Update the metadata according to the instructions

### Tool 2: Library Organizer

After updating metadata, organize your library by release date:

```bash
npm run organize
```

This will:

- Validate all files have required metadata (title, artist, album, release date, artwork, label, BPM, genre)
- Organize files into `Year/Month/` folder structure based on release dates
- Clean up empty directories
- Provide detailed reporting of all operations

See [ORGANIZER_README.md](ORGANIZER_README.md) for detailed documentation on the organizer tool.

## Recommended Workflow

1. **Update Release Dates**: Run `npm start` to fetch release dates from Spotify
2. **Complete Metadata**: Use your DJ software to add BPM, genre, label, and artwork
3. **Organize Library**: Run `npm run organize` to structure your files by release date

## Dependencies

- **dotenv**: Environment variable management
- **axios**: HTTP client for Last.fm API calls
- **readline-sync**: Interactive command-line prompts
- **music-metadata**: Read audio file metadata
- **node-id3**: Write ID3 tags for MP3 files

## Tech stack

1. use pnpm for package management
