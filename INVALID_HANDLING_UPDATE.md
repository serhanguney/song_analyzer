# Update: Invalid File Handling

## Changes Made

Updated `rearrange-by-release-date.js` to automatically handle files with missing or invalid metadata instead of exiting the script.

## New Behavior

### Before

- Script would validate all files
- If ANY file had missing/invalid metadata, script would exit
- User had to fix all issues before organizing any files

### After

- Script validates all files
- Files with missing/invalid metadata are moved to `[invalid]/` directory
- Valid files are organized normally
- Script continues to completion regardless of invalid files

## Key Features Added

### 1. Invalid Directory Creation

- Automatically creates `[invalid]` directory at music root level
- If directory already exists, uses it
- Files with issues are moved there with detailed logging

### 2. Enhanced Date Validation

- Checks if release date is in valid format (YYYY-MM-DD, YYYY-MM, YYYY)
- Validates year is between 1900 and current year + 1
- Validates month is between 1-12
- Marks dates with invalid format for [invalid] directory

### 3. Smart File Handling

- Duplicate filename handling: adds `_1`, `_2`, etc. suffix if file exists
- Skips `[invalid]` directory during scanning (prevents reprocessing)
- Skips `[invalid]` directory during cleanup (preserves invalid files)

### 4. Improved Logging

- Shows reason for each invalid file
- Displays current metadata for context
- Summary includes count of invalid files moved

## Code Changes

### Added Functions

1. **`moveToInvalidDirectory()`** (lines ~170-205)
   - Moves files to `[invalid]` directory
   - Creates directory if needed
   - Handles duplicate filenames
   - Logs reason for move

### Modified Functions

1. **`parseReleaseDate()`**

   - Added year/month validation
   - Returns `isValid` flag
   - Validates date ranges

2. **`getAudioFiles()`**

   - Skips `[invalid]` directory during scanning
   - Prevents reprocessing invalid files

3. **`cleanupEmptyDirectories()`**

   - Skips `[invalid]` directory during cleanup
   - Preserves invalid files for review

4. **`main()` process**
   - Enhanced validation to check date format
   - Moves invalid files before organizing valid ones
   - Updated summary to include invalid file count
   - Continues even if all files are invalid

## Example Output

```
📂 Audio File Organizer by Release Date

Found 150 audio file(s)

🔍 Validating metadata...

⚠️  Found 5 file(s) with invalid or missing metadata

📦 Moving invalid files to [invalid] directory...

📍 artist/album/track-no-bpm.mp3
   Issue: Missing fields: bpm
   ⚠️  Moved to [invalid]: artist/album/track-no-bpm.mp3
      Reason: Missing fields: bpm

📦 Moved 5 file(s) to [invalid] directory

✅ 145 file(s) have complete and valid metadata

📊 Organizing files by release date...
[... organization continues ...]

============================================================
✨ Organization Complete

📦 Moved to [invalid]: 5 file(s)
✅ Organized: 143 file(s)
⏭️  Already organized: 2 file(s)
============================================================
```

## Benefits

1. **No Manual Intervention Required**: Script handles problematic files automatically
2. **Clear Separation**: Invalid files in one easy-to-find location
3. **Iterative Workflow**: Fix files in `[invalid]` and re-run script
4. **No Data Loss**: All files preserved, just reorganized
5. **Detailed Feedback**: Know exactly why each file was marked invalid

## Workflow

1. Run `npm run organize`
2. Valid files get organized by date
3. Invalid files go to `[invalid]/`
4. Review console output for reasons
5. Fix metadata for files in `[invalid]/`
6. Move fixed files back to music directory
7. Re-run `npm run organize`
8. Previously invalid files now get organized properly

## Documentation Updated

- **ORGANIZER_README.md**: Complete rewrite of examples and workflow
- Shows all three scenarios: mixed files, all valid, all invalid
- Updated troubleshooting section
- Added tips for handling invalid files
