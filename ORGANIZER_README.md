# Audio File Organizer by Release Date

## Overview

This script scans a source directory for audio files and organizes them into a target directory with a structured folder hierarchy based on release dates. Files with missing or invalid metadata are automatically moved to an `[invalid]` directory in the target for later review.

## How It Works

The script operates with two separate directories:
- **SOURCE_DIRECTORY**: Where your new/unorganized songs are located
- **TARGET_DIRECTORY**: Where organized songs will be moved to (organized by Year/Month)

This separation allows you to:
1. Drop new songs into a source folder
2. Run the script to automatically organize them
3. Keep your organized library separate and clean

## Features

- ✅ **Source/Target Separation**: Scans from SOURCE_DIRECTORY, moves to TARGET_DIRECTORY
- ✅ **Recursive Directory Scanning**: Scans all subdirectories in source
- ✅ **Metadata Validation**: Ensures all required fields are present
- ✅ **Smart Organization**: Organizes by Year/Month folders in target
- ✅ **Invalid File Handling**: Automatically moves files with issues to `[invalid]` directory in target
- ✅ **Safety Checks**: Won't overwrite existing files in target
- ✅ **Automatic Cleanup**: Removes empty directories in source after moving files
- ✅ **Detailed Reporting**: Shows exactly what's being moved and where

## Required Metadata Fields

The script checks for these required fields before organizing:

1. **Title** - Track name
2. **Artist** - Artist name
3. **Album** - Album name
4. **Release Date** - **Must be in YYYY-MM-DD format** (e.g., `2022-01-14`)
5. **Artwork/Image** - Album cover art
6. **Label** - Record label
7. **BPM** - Beats per minute
8. **Genre** - Music genre

### Release Date Format

⚠️ **STRICT REQUIREMENT**: Release dates must be in `YYYY-MM-DD` format:
- ✅ **Valid**: `2022-01-14`, `2023-12-25`, `2021-06-30`
- ❌ **Invalid**: `2022`, `2022-01`, `01/14/2022`, `Jan 14, 2022`, `not-a-date`

Files with invalid date formats will be moved to the `[invalid]` directory.

## File Organization Structure

### Directory Setup

```
project/
├── new_songs/           # SOURCE_DIRECTORY
│   ├── artist1/
│   │   └── new-track1.mp3
│   ├── artist2/
│   │   └── new-track2.mp3
│   └── unsorted/
│       └── track3.mp3
│
└── organized_music/     # TARGET_DIRECTORY
    ├── [invalid]/       # Files with issues
    │   ├── bad-track.mp3
    │   └── no-date.mp3
    ├── 2022/
    │   ├── 01/
    │   │   └── track1.mp3
    │   └── 12/
    │       └── track2.mp3
    └── 2023/
        └── 06/
            └── track3.mp3
```

### What Happens

1. **Source**: Files remain in `new_songs/` until processed
2. **Target Valid**: Moved to `organized_music/YEAR/MONTH/`
3. **Target Invalid**: Moved to `organized_music/[invalid]/`
4. **Source Cleanup**: Empty directories in `new_songs/` are removed

Where:
- **`[invalid]/` folder** = Files with missing or invalid metadata (in TARGET)
- **Year folder** (e.g., `2022/`) = Release year (in TARGET)
- **Month folder** (e.g., `01/`, `02/`) = Release month 01-12 (in TARGET)
- **Files** remain with their original names

### Invalid File Handling

Files are moved to `[invalid]/` in the TARGET directory if they have:
- Missing required metadata (title, artist, album, release date, artwork, label, BPM, genre)
- Invalid release date format (not in YYYY-MM-DD format)
- Unreadable metadata

The script automatically:
- Creates `[invalid]` directory in TARGET if it doesn't exist
- Adds numeric suffix if filename already exists (e.g., `track_1.mp3`, `track_2.mp3`)
- Moves files from SOURCE to TARGET/[invalid]
- Shows the actual date value and why it's invalid in the console output

## Usage

### Basic Usage

Run the organizer script:

```bash
npm run organize
```

Or directly:

```bash
node rearrange-by-release-date.js
```

### What Happens

1. **Scanning**: Recursively scans SOURCE_DIRECTORY for audio files
2. **Validation**: Checks each file for required metadata
3. **Invalid Files**: Files with missing/invalid metadata are moved to `TARGET/[invalid]/`
4. **Organization**: Valid files are moved to `TARGET/YEAR/MONTH/` folders
5. **Cleanup**: Removes any empty directories left in SOURCE
6. **Summary**: Shows count of organized vs invalid files and their destinations

## Output Examples

### Successful Run with Some Invalid Files

```
📂 Audio File Organizer by Release Date

📁 Source directory: ./new_songs
📁 Target directory: ./organized_music

🔍 Scanning source directory recursively...

Found 150 audio file(s)

🔍 Validating metadata...

⚠️  Found 5 file(s) with invalid or missing metadata

📦 Moving invalid files to [invalid] directory in target...

📍 artist/album/track-no-bpm.mp3
   Issue: Missing fields: bpm
   Current metadata:
     - Title: Track Name
     - Artist: Artist Name
     - Album: Album Name
     - Release Date: 2022-01-14
     - Genre: House
     - Label: Label Name
     - Artwork: Yes
   ⚠️  Moved to [invalid]: artist/album/track-no-bpm.mp3
      Reason: Missing fields: bpm

📍 artist/album/track-bad-date.mp3
   Issue: Invalid release date format: "2022" (must be YYYY-MM-DD)
   Current metadata:
     - Title: Another Track
     - Artist: Artist Name
     - Release Date: 2022
   ⚠️  Moved to [invalid]: artist/album/track-bad-date.mp3
      Reason: Invalid release date format: "2022" (must be YYYY-MM-DD)

📦 Moved 5 file(s) to [invalid] directory

✅ 145 file(s) have complete and valid metadata

📊 Organizing files by release date...

📍 Processing: artist/album/track.mp3
   Release Date: 2022/01 (2022-01-14)
   ✅ Moved: artist/album/track.mp3 → 2022/01/track.mp3

🧹 Cleaning up empty directories in source...
   🧹 Removed empty directory: artist/album
   🧹 Removed empty directory: artist

============================================================
✨ Organization Complete

📦 Moved to [invalid]: 5 file(s)
✅ Organized: 143 file(s)
⏭️  Already organized: 2 file(s)
============================================================
```

### All Files Valid

```
📂 Audio File Organizer by Release Date

Found 150 audio file(s)

🔍 Validating metadata...

✅ 150 file(s) have complete and valid metadata

📊 Organizing files by release date...

[... organization progress ...]

============================================================
✨ Organization Complete

✅ Organized: 148 file(s)
⏭️  Already organized: 2 file(s)
============================================================
```

### All Files Invalid

```
📂 Audio File Organizer by Release Date

Found 50 audio file(s)

🔍 Validating metadata...

⚠️  Found 50 file(s) with invalid or missing metadata

📦 Moving invalid files to [invalid] directory...

[... moving progress ...]

📦 Moved 50 file(s) to [invalid] directory

ℹ️  No valid files to organize. All files moved to [invalid] directory.
```

## Workflow Recommendation

### Step 1: Add New Songs
Drop new songs into your SOURCE_DIRECTORY:

```bash
cp ~/Downloads/*.mp3 ./new_songs/
```

### Step 2: (Optional) Update Metadata
If songs don't have release dates, run the metadata updater first:

```bash
# Temporarily set MUSIC_DIRECTORY to your source
MUSIC_DIRECTORY=./new_songs npm start
```

### Step 3: Organize Files
Run the organizer to move and organize:

```bash
npm run organize
```

Valid files → `organized_music/YEAR/MONTH/`
Invalid files → `organized_music/[invalid]/`

### Step 4: Fix Invalid Files (if any)
Check `organized_music/[invalid]/` and fix any files with issues:
- Use your DJ software (Rekordbox, Yate, etc.) to add missing metadata
- Verify release dates are in valid format
- Add BPM, genre, label, artwork as needed

### Step 5: Re-process Fixed Files
Move fixed files back to source and run again:

```bash
mv organized_music/[invalid]/*.mp3 new_songs/
npm run organize
```

Previously fixed files will now be organized properly!

## Safety Features

- ✅ **No Overwrites**: Won't move files if destination already exists
- ✅ **Invalid File Isolation**: Automatically moves problematic files to `[invalid]` directory
- ✅ **Duplicate Handling**: Adds numeric suffix to duplicate filenames in `[invalid]` folder
- ✅ **Error Reporting**: Shows exactly which files have issues and why
- ✅ **Preserves Names**: Keeps original file names
- ✅ **Cleanup**: Only removes empty directories (never removes files)
- ✅ **Skips Invalid Directory**: Won't re-process files already in `[invalid]/`

## Supported File Formats

- MP3 (.mp3)
- M4A (.m4a)
- FLAC (.flac)
- WAV (.wav)
- AIFF/AIF (.aiff, .aif)

## Configuration

The organizer requires two directory paths in your `.env` file:

```
# Source directory containing new songs to organize
SOURCE_DIRECTORY=./new_songs

# Target directory where organized songs will be moved to
TARGET_DIRECTORY=./organized_music
```

### Setup

1. Create both directories:

```bash
mkdir new_songs
mkdir organized_music
```

2. Add new songs to `new_songs/` directory (any folder structure is fine)
3. Run the organizer script
4. Songs will be moved and organized in `organized_music/`

## Tips

1. **Backup First**: Always backup your music library before running organization scripts
2. **Run Multiple Times**: You can safely run the script multiple times - it will skip already organized files
3. **Fix Invalid Files**: Check `[invalid]/` directory after each run and fix metadata issues
4. **Complete Metadata**: Use the main script (`npm start`) to update release dates first
5. **DJ Software**: Keep your DJ software closed while organizing to avoid database issues
6. **Review Invalid**: The `[invalid]/` directory makes it easy to see which files need attention

## Troubleshooting

### Files in [invalid] directory
- Check the console output to see why each file was moved there
- Common issues: missing BPM, missing label, invalid date format
- Fix the metadata and move files back to music directory to re-process

### "Missing release date" or "Invalid release date format"
- Release date **must be in YYYY-MM-DD format** (e.g., `2022-01-14`)
- Formats like `2022`, `2022-01`, or `01/14/2022` are **not accepted**
- Run `npm start` first to fetch release dates from Spotify (usually in correct format)
- Or manually add release dates in your audio editor in YYYY-MM-DD format
- The script will show the actual invalid value in the error message

### "Missing label" error
- This field might not be in Spotify data
- Add manually using Yate, iTunes, or other metadata editor
- Or leave files in `[invalid]` if label info is not critical

### "Missing BPM" error
- Use your DJ software's BPM analysis feature
- Or add manually if you know the BPM
- Most DJ software can auto-detect BPM

### Files not moving
- Check console output for specific errors
- Ensure you have write permissions
- Verify destination file doesn't already exist
- Check that `[invalid]` directory is not locked

### Want to review before organizing?
- Set `dryRun: true` on line 437 to see what would happen without actually moving files

