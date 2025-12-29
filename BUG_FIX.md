# Bug Fix: Metadata Being Wiped Out

## Problem

The script was removing all existing metadata (title, artist, genre, BPM, etc.) when updating files, leaving only the date-related fields.

## Root Cause

The issue was on **line 418-420** where the `include` option was being passed to `NodeID3.update()`:

```javascript
const success = NodeID3.update(tags, filePath, {
  include: ['TYER', 'TDAT', 'TDRC']
});
```

### Why This Caused the Problem

The `include` option in node-id3 is designed for **reading** operations to filter which tags to read. When used with `update()`, it tells the library to **only preserve** those specific tags, effectively removing everything else from the file.

This meant:
- ❌ Title was removed
- ❌ Artist was removed  
- ❌ Genre was removed
- ❌ BPM was removed
- ❌ Track number was removed
- ❌ Comments were removed
- ❌ All other metadata was removed

## Solution

Removed the `include` option entirely and called `NodeID3.update()` with just the tags object:

```javascript
const success = NodeID3.update(tags, filePath);
```

### How This Works

Without the `include` option, `NodeID3.update()` performs a proper **partial update**:
- ✅ Updates only the fields specified in the `tags` object
- ✅ Preserves all other existing metadata
- ✅ Title, artist, genre, BPM, etc. remain untouched

## What Gets Updated Now

Only these fields are modified:
- `year` - Release year
- `date` - Full release date
- `album` - Formatted date (YYYY/MM) - intentional per requirements
- `releaseTime` - Release timestamp
- `originalReleaseTime` - Original release timestamp
- `recordingTime` - Recording timestamp
- `performerInfo` - Cleared (empty string) - intentional per requirements

## Verification

Added detailed verification output to show what's preserved:
```
📋 Verified tags after update:
   Title: [preserved]
   Artist: [preserved]
   Album: 2022/01
   Year: 2022
   Release Date: 2022-01-14
   Genre: [preserved]
   BPM: [preserved]
```

This allows you to confirm that all existing metadata is being properly preserved while only the intended fields are updated.

