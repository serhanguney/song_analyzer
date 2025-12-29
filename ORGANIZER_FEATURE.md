# New Feature: Library Organizer by Release Date

## Overview

Created a new script `rearrange-by-release-date.js` that organizes your music library into a structured Year/Month folder hierarchy based on release dates.

## What It Does

### 1. Recursive File Scanning
- Scans all subdirectories for audio files
- Supports MP3, M4A, FLAC, WAV, AIFF/AIF formats

### 2. Metadata Validation
Checks for 8 required fields:
- ✅ Title
- ✅ Artist
- ✅ Album
- ✅ Release Date
- ✅ Artwork/Image
- ✅ Label
- ✅ BPM
- ✅ Genre

### 3. Smart Organization
- Creates folder structure: `Year/Month/filename.mp3`
- Example: `2022/01/track.mp3` for files released in January 2022
- Preserves original filenames

### 4. Safety Features
- Won't overwrite existing files
- Validates ALL files before moving ANY files
- Detailed error reporting for missing metadata
- Automatic cleanup of empty directories

## File Structure

### Before:
```
music/
├── artist1/
│   ├── album1/
│   │   ├── track1.mp3
│   │   └── track2.mp3
│   └── album2/
│       └── track3.mp3
└── artist2/
    └── track4.mp3
```

### After:
```
music/
├── 2022/
│   ├── 01/
│   │   ├── track1.mp3
│   │   └── track2.mp3
│   └── 03/
│       └── track3.mp3
└── 2023/
    └── 06/
        └── track4.mp3
```

## Usage

```bash
# Run the organizer
npm run organize

# Or directly
node rearrange-by-release-date.js
```

## Key Features

1. **Fail-Safe Validation**
   - If ANY file is missing required metadata, script exits without moving anything
   - Shows detailed report of which files need attention

2. **Detailed Console Output**
   - Shows each file being processed
   - Displays release date information
   - Reports success/skip/failure for each file

3. **Smart Handling**
   - Skips files already in correct location
   - Creates year/month folders automatically
   - Removes empty directories after organizing

4. **Release Date Parsing**
   - Handles multiple date formats (YYYY-MM-DD, YYYY-MM, YYYY)
   - Prioritizes originaldate > date > year fields
   - Defaults to January if only year is provided

## Documentation

- **ORGANIZER_README.md** - Complete user guide with examples
- **Updated README.md** - Added workflow and tool descriptions
- **Updated package.json** - Added `npm run organize` script

## Recommended Workflow

1. Run `npm start` to fetch release dates from Spotify
2. Add missing metadata (BPM, genre, label) using DJ software
3. Run `npm run organize` to structure your library

## Code Quality

- ✅ No linting errors
- ✅ Proper error handling
- ✅ Async/await pattern throughout
- ✅ Detailed comments
- ✅ Relative path display for readability
- ✅ Modular function structure

## Safety Considerations

- All validation happens before any file moves
- Won't overwrite existing files at destination
- Only removes empty directories (never files)
- Detailed error messages for troubleshooting
- Can be safely interrupted (already moved files stay moved)

