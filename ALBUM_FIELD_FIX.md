# Album Field Fix - 1987 Date Issue Resolution

## Problem
The script was creating a feedback loop that resulted in incorrect release dates (like 1987-01-01):

1. **First run**: Script overwrites `album` field with formatted date (e.g., "2021/05")
2. **Second run**: Script reads `album = "2021/05"` and searches Spotify with this
3. **Wrong match**: Spotify returns an album literally named "2021/05" or a random match
4. **Propagation**: Wrong album's release date (e.g., 1987-01-01) gets written back

## Root Cause
Using the `album` field for both:
- Spotify search queries (needs original album name)
- Storage of formatted date (YYYY/MM format)

This created a conflict where the album name was lost after the first update.

## Solution
Store the formatted date in the **Album Artist** field instead of the Album field.

### Changes Made

#### 1. Updated Tag Writing (index.js)
**Before:**
```javascript
const tags = {
  year: releaseDate.formatted.split('/')[0],
  date: releaseDate.full,
  album: releaseDate.formatted,  // ❌ Overwrites album name
  // ...
};
```

**After:**
```javascript
const tags = {
  year: releaseDate.formatted.split('/')[0],
  date: releaseDate.full,
  performerInfo: releaseDate.formatted,  // ✅ Stores in Album Artist (TPE2)
  // ...
};
```

#### 2. Field Mapping
- **NodeID3**: Uses `performerInfo` field → Maps to TPE2 frame (Album Artist)
- **music-metadata**: Reads as `common.albumartist`
- **ID3v2 Frame**: TPE2 (Band/Orchestra/Accompaniment)

#### 3. Album is Required
The `album` field is already in `REQUIRED_FIELD_NAMES`, so files without proper album names will be flagged as invalid.

## Benefits

1. ✅ **Preserves Album Name**: Original album name stays intact for accurate Spotify searches
2. ✅ **No Search Conflicts**: Subsequent runs use correct album name, not formatted dates
3. ✅ **Accurate Matches**: Spotify searches return correct albums
4. ✅ **Correct Dates**: No more 1987 or other wrong dates from mismatched albums
5. ✅ **Organized Storage**: Formatted date available in Album Artist field for other tools

## What to Expect

### After the Fix:
```
📋 Verified tags after update:
   Title: Track Name
   Artist: Artist Name
   Album: Actual Album Name          ← Preserved!
   Album Artist: 2021/05              ← Formatted date stored here
   Year: 2021
   Release Date: 2021-05-15
```

### Spotify Search Query:
- **Before**: `artist:"Artist Name" album:"2021/05"` ❌
- **After**: `artist:"Artist Name" album:"Actual Album Name"` ✅

## Migration

For files already affected by the issue:
1. If you know the original album name, manually update the `album` field in a metadata editor
2. Run `pnpm start` - it will now search with the correct album name
3. The formatted date will be stored in Album Artist, preserving the album name

## Related Files
- `src/index.js` - Tag writing logic updated
- `src/common.js` - Album already in required fields
- `src/rearrange-by-release-date.js` - Uses album field for validation

## Technical Notes
- Album Artist (TPE2) is typically used for compilation albums to store the compilation name
- We're repurposing it to store the formatted date (YYYY/MM)
- This is non-standard but preserves the critical Album field for searching
- Alternative fields considered: Comments, Grouping (but these are less structured)

