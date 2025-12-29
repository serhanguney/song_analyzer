# Update: Source/Target Directory Separation

## Changes Made

Updated `rearrange-by-release-date.js` to use separate source and target directories for better workflow management.

## New Behavior

### Before
- Single directory: `TARGET_DIRECTORY`
- Script scanned and organized files in the same directory
- Files moved within the same directory tree

### After
- Two directories: `SOURCE_DIRECTORY` and `TARGET_DIRECTORY`
- Script scans from SOURCE, moves to TARGET
- Clean separation between new/unorganized and organized files

## Key Benefits

### 1. Drop Folder Workflow
```
new_songs/           ← Drop new files here
    └── (any structure)

organized_music/     ← Organized files end up here
    ├── [invalid]/
    ├── 2022/
    │   ├── 01/
    │   └── 02/
    └── 2023/
        └── 06/
```

### 2. Clean Organization
- New files go into SOURCE
- Run script
- Valid files → TARGET/YEAR/MONTH/
- Invalid files → TARGET/[invalid]/
- Empty folders in SOURCE cleaned up automatically

### 3. Easy Iteration
- Fix files in TARGET/[invalid]/
- Move back to SOURCE
- Run script again
- Now properly organized

## Configuration

### Environment Variables

Added `SOURCE_DIRECTORY` to `.env`:

```bash
# Source directory containing new songs to organize
SOURCE_DIRECTORY=./new_songs

# Target directory where organized songs will be moved to
TARGET_DIRECTORY=./organized_music
```

### Setup Commands

```bash
# Create directories
mkdir new_songs
mkdir organized_music

# Add to .env
echo "SOURCE_DIRECTORY=./new_songs" >> .env
echo "TARGET_DIRECTORY=./organized_music" >> .env
```

## Code Changes

### Modified Variables
- Added `SOURCE_DIRECTORY` constant
- Kept `TARGET_DIRECTORY` constant (user already renamed from MUSIC_DIRECTORY)

### Modified Functions

1. **`main()` validation**
   - Validates both SOURCE and TARGET directories exist
   - Creates TARGET if it doesn't exist (with recursive: true)
   - Shows both paths in console output

2. **File scanning**
   - `getAudioFiles(SOURCE_DIRECTORY)` - scans from source
   - Relative paths displayed relative to SOURCE

3. **File moving**
   - `moveFileByReleaseDate()` - moves to TARGET/YEAR/MONTH/
   - `moveToInvalidDirectory()` - moves to TARGET/[invalid]/

4. **Cleanup**
   - `cleanupEmptyDirectories(SOURCE_DIRECTORY, true)` - cleans source
   - Added `isSource` parameter to distinguish source vs target cleanup
   - Protects both SOURCE and TARGET root directories from removal

### Console Output

Updated to show both directories:

```
📁 Source directory: ./new_songs
📁 Target directory: ./organized_music
🔍 Scanning source directory recursively...
```

And cleanup messages:

```
🧹 Cleaning up empty directories in source...
```

## Example Workflow

### Day 1: Organize New Batch
```bash
# Download new tracks
cp ~/Downloads/*.mp3 ./new_songs/

# Organize them
npm run organize
```

**Result:**
- `new_songs/` becomes empty (cleaned up)
- Valid files in `organized_music/2023/12/`
- Invalid files in `organized_music/[invalid]/`

### Day 2: Fix and Re-organize
```bash
# Fix metadata for invalid files
# (use Yate, Rekordbox, etc.)

# Move back to source
mv organized_music/[invalid]/*.mp3 new_songs/

# Re-organize
npm run organize
```

**Result:**
- Fixed files now in `organized_music/2023/12/`
- `new_songs/` empty again

### Day 3: New Batch
```bash
# Add more new tracks
cp ~/Downloads/week2/*.mp3 ./new_songs/

# Organize (only processes new files)
npm run organize
```

**Result:**
- Only new files processed
- Existing organized files untouched
- Growing organized library in TARGET

## Files Updated

1. **`rearrange-by-release-date.js`**
   - Added SOURCE_DIRECTORY configuration
   - Updated all path references
   - Modified cleanup logic

2. **`env.example`**
   - Added SOURCE_DIRECTORY
   - Added TARGET_DIRECTORY
   - Clear comments for each

3. **`ORGANIZER_README.md`**
   - Complete rewrite of workflow section
   - Updated all examples to show source/target
   - New directory structure diagrams
   - Updated configuration instructions

## Migration Guide

If you were using the old single-directory version:

```bash
# Old .env
TARGET_DIRECTORY=./music

# New .env
SOURCE_DIRECTORY=./new_songs    # Create this for new files
TARGET_DIRECTORY=./music        # Keep your existing organized files
```

Then just add new files to `new_songs/` and run the script!

