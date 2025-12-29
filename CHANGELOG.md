# Changelog

## [Unreleased] - 2025-12-28

### Added
- **Recursive Directory Scanning**: The script now recursively scans all subdirectories within the music folder
  - Previously only scanned files in the root music directory
  - Now finds audio files in any nested folder structure
  - Supports organizing music by artist, album, genre, etc. in separate folders

### Changed
- **Improved Console Output**: 
  - Shows "recursively" in the directory scanning message
  - Displays relative file paths instead of just filenames for better context
  - Added "Processing:" indicator for each file being analyzed
  - Updated summary messages to mention "subdirectories"
  
- **File Path Handling**:
  - Added `getRelativePath()` helper function for cleaner display
  - File results now store relative paths for better readability
  - Full paths still used internally for file operations

### Technical Details
- Modified `getAudioFiles()` function to use recursive algorithm with `fs.readdir()` and `withFileTypes` option
- Enhanced metadata extraction and search flow to handle nested directory structures
- Updated README.md with information about recursive scanning feature

### Benefits
- Organize large music libraries with folder structures
- Process entire artist or album catalogs at once
- Better visibility of which files are being processed and where they're located
- Scalable for libraries with thousands of tracks across multiple folders

