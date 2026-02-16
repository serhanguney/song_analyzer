# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A DJ tool for automating audio file metadata management and library organization using the Spotify API. Node.js (ES Modules) with TypeScript support (via tsx) for new scripts, no build step, no tests, and no linter.

## Commands

```bash
npm install                        # Install dependencies
npm run fetch-tags                 # Fetch metadata from Spotify for files in SOURCE_DIRECTORY
npm run fetch-tags -- -v           # Verbose mode with debug output
npm run organize                   # Organize files into TARGET_DIRECTORY/YEAR/MONTH/
npm run organize -- -v             # Verbose mode
npm run update-tag                 # Interactive manual tag editor (reads from PREPARATION_DIRECTORY)
npm run find-references            # Find audio sample references across directories
npm run auth                       # Authorize Spotify user account (OAuth PKCE flow)
npm run add-to-playlist -- --playlist <id>  # Add matched songs to a Spotify playlist
npm run add-to-playlist -- --playlist <id> --dir <path> -v  # With custom dir + verbose
```

## Configuration

Copy `env.example` to `.env` and fill in Spotify API credentials (`CLIENT_ID`, `CLIENT_SECRET`), directory paths (`MUSIC_DIRECTORY`, `SOURCE_DIRECTORY`, `TARGET_DIRECTORY`, `PREPARATION_DIRECTORY`), and optionally `SPOTIFY_REDIRECT_URI` and `PLAYLIST_ID` for the playlist script.

## Architecture

All scripts live in `src/` and run independently via npm scripts. There is no shared state between runs.

**Workflow**: Place new tracks in SOURCE_DIRECTORY → `fetch-tags` enriches metadata via Spotify → `organize` moves files into YEAR/MONTH folder structure in TARGET_DIRECTORY.

### Key files

- **src/fetch-tags.js** — Main metadata fetcher. Authenticates with Spotify (Client Credentials OAuth), scans SOURCE_DIRECTORY recursively, searches Spotify with multi-level fallback (album → track → artist), validates results with string similarity, and writes metadata (release date, genre, label, artwork) via node-id3.
- **src/rearrange-by-release-date.js** — Library organizer. Validates all required fields are present, moves invalid files to `[invalid]/` folder, organizes valid files into YEAR/MONTH/ structure, handles filename conflicts with numeric suffixes.
- **src/update-tag.js** — Interactive CLI for manual metadata editing. Supports field-by-field editing and artwork download/embedding.
- **src/find-references.js** — Finds audio files referenced across directories by filename matching.
- **src/common.js** — Shared constants: `REQUIRED_FIELD_NAMES` (title, artist, album, releaseDate, artwork, label, genre) and `AUDIO_EXTENSIONS` (.mp3, .m4a, .flac, .wav, .aiff, .aif).
- **src/spotify.js** — Extracted reusable Spotify API utilities (search, auth, metadata extraction, file scanning). Shared by fetch-tags.js and the TypeScript playlist scripts.
- **src/spotify-auth.ts** — Spotify Authorization Code flow with PKCE. Caches tokens in `.spotify-tokens.json`, handles refresh automatically.
- **src/add-to-playlist.ts** — Scans audio files, matches to Spotify tracks, and adds them to a specified playlist in batches.

### File format support

Read metadata: MP3, WAV, AIFF, M4A, FLAC (via music-metadata). Write metadata: MP3, WAV, AIFF only (via node-id3). M4A and FLAC are read-only.

### TypeScript conventions

- Refrain from type casting when writing scripts with TypeScript. Instead refer to validation by using zod or alternative methods.

### Key patterns

- Release dates must be strictly YYYY-MM-DD format
- Spotify search uses cascading fallback: album search → track search → primary artist → general search
- String similarity matching validates Spotify results against file metadata
- All scripts prompt for user confirmation before destructive operations
- `-v` flag enables verbose colored terminal output across scripts
