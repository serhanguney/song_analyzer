# Spotify API Limitations

## Overview
While Spotify is an excellent source for metadata, it doesn't always have complete information for every track or album. This document explains what to expect and how to handle incomplete data.

## Fields Spotify May Not Have

### Label Information
- **Most Common Issue**: Many tracks/albums on Spotify don't have label information in their API data
- **Why**: Spotify's public API doesn't always include label/publisher data, especially for:
  - Independent releases
  - Self-released tracks
  - Older catalog items
  - Certain regional releases

### Genre Information
- Some albums have no genre classification
- Genres may be too broad or not specific to electronic music subgenres

### Artwork
- Most albums have artwork
- Very rare, but some may be missing

## What Happens When Data is Missing

### During `pnpm start`:
1. Script finds a match on Spotify ✅
2. Updates what it can from Spotify (title, artist, release date, artwork, etc.)
3. Shows warning: `⚠️ Still missing (Spotify has no data): label`
4. Shows reminder: `⚠️ This file will remain in [invalid] until these fields are added manually`

### During `pnpm organize`:
1. Script validates metadata
2. Finds that label is still missing
3. Keeps file in `[invalid]` directory
4. Shows: `⏭️ Already in [invalid]: [filename]`

## How to Handle Missing Fields

### Option 1: Manual Entry (Recommended)
Use a metadata editor to add missing fields:
- **macOS**: Yate, Kid3, Mp3tag
- **Windows**: Mp3tag, Kid3
- **Linux**: Kid3, EasyTAG

### Option 2: Alternative Sources
Research the track/album on:
- Discogs.com
- Beatport
- MusicBrainz
- Label websites

### Option 3: Use Label from Album Name
If your files follow a naming convention where the label is part of the path or album name, you could add custom logic to extract it.

## Example Log Flow

```
Processing: [invalid]/Who's Right.mp3
   📝 Missing fields: title, label
   Searching (album): Uto Karem - 2021/05
   ✅ Match found via album search
   📦 Spotify has: genre, artwork
   
[After user confirms update]

Updating: [invalid]/Who's Right.mp3
  ✅ Successfully updated metadata
     📝 Filled missing fields from Spotify: title, genre, artwork
     ⚠️  Still missing (Spotify has no data): label
     ⚠️  This file will remain in [invalid] until these fields are added manually
```

## Best Practices

1. **Check Spotify Data First**: The improved logging now shows what fields Spotify has before you confirm the update
2. **Batch Process**: After running `pnpm start`, check the console for files that still have missing data
3. **Manual Cleanup**: For files Spotify can't complete, do a manual cleanup session with your preferred metadata editor
4. **Verify Before Organizing**: Always run `pnpm organize` after manual edits to ensure all required fields are present

## Related Scripts

- **index.js**: Updates metadata from Spotify (shows what Spotify has/doesn't have)
- **rearrange-by-release-date.js**: Validates and organizes files (requires ALL fields to be present)
- **common.js**: Defines which fields are required

## Future Enhancements

Possible additions to handle missing data:
- Discogs API integration
- Beatport API integration
- CSV import for batch label assignment
- Custom label mapping based on file paths

