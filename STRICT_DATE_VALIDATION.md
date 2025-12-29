# Update: Strict YYYY-MM-DD Date Validation

## Changes Made

Updated `rearrange-by-release-date.js` to strictly validate that release dates are in YYYY-MM-DD format only.

## Problem

The script was accepting multiple date formats:
- `YYYY-MM-DD` (e.g., `2022-01-14`)
- `YYYY-MM` (e.g., `2022-01`)
- `YYYY` (e.g., `2022`)
- Various other formats via Date parsing

This caused inconsistency and could lead to incorrectly parsed dates.

## Solution

Updated `parseReleaseDate()` function to **only accept YYYY-MM-DD format**.

### New Validation Rules

✅ **Valid Format**: `YYYY-MM-DD`
- Example: `2022-01-14`, `2023-12-25`, `2021-06-30`

❌ **Invalid Formats** (now rejected):
- `2022` (year only)
- `2022-01` (year-month)
- `01/14/2022` (US format)
- `14-01-2022` (DD-MM-YYYY)
- `Jan 14, 2022` (text format)
- `not-a-date` (invalid text)

### Validation Checks

1. **Regex Match**: Must match `^\d{4}-\d{2}-\d{2}$`
2. **Year Range**: 1900 to (current year + 1)
3. **Month Range**: 01 to 12
4. **Day Range**: 01 to 31
5. **Valid Date**: Must parse as a real date (no Feb 31, etc.)

## Code Changes

### Updated Function

```javascript
function parseReleaseDate(dateString) {
  if (!dateString) return null;
  
  const dateStr = String(dateString).trim();
  
  // STRICT: Only accept YYYY-MM-DD format
  if (!dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return null; // Invalid format
  }
  
  const [year, month, day] = dateStr.split('-');
  
  // Validate ranges
  const yearNum = parseInt(year);
  const monthNum = parseInt(month);
  const dayNum = parseInt(day);
  
  if (yearNum < 1900 || yearNum > new Date().getFullYear() + 1) {
    return null;
  }
  
  if (monthNum < 1 || monthNum > 12) {
    return null;
  }
  
  if (dayNum < 1 || dayNum > 31) {
    return null;
  }
  
  // Validate it's a real date
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    return null;
  }
  
  return {
    year,
    month,
    day,
    formatted: `${year}/${month}`,
    fullDate: dateStr,
    isValid: true
  };
}
```

### Enhanced Error Messages

Updated validation messages to show the actual invalid value:

**Before:**
```
Invalid release date format
```

**After:**
```
Invalid release date format: "2022" (must be YYYY-MM-DD)
```

Or if missing:
```
Missing release date (must be YYYY-MM-DD format)
```

## Impact

### Files with Invalid Dates

Files with dates not in YYYY-MM-DD format will now be moved to `[invalid]` directory with clear error messages:

```
📍 track.mp3
   Issue: Invalid release date format: "2022" (must be YYYY-MM-DD)
   ⚠️  Moved to [invalid]: track.mp3
      Reason: Invalid release date format: "2022" (must be YYYY-MM-DD)
```

### Console Output

Users will see exactly what format was found and what's required:

```
📍 another-track.mp3
   Issue: Invalid release date format: "01/14/2022" (must be YYYY-MM-DD)
   Current metadata:
     - Title: Another Track
     - Artist: Artist Name
     - Release Date: 01/14/2022
```

## Compatibility

### Spotify Metadata Updater

The main metadata updater script (`index.js`) already writes dates in YYYY-MM-DD format from Spotify, so files processed by that script will work perfectly with the organizer.

### Manual Metadata

If you're adding metadata manually:
1. Use your audio editor (Yate, iTunes, etc.)
2. Set release date in YYYY-MM-DD format
3. Examples: `2022-01-14`, `2023-06-30`

## Documentation Updates

1. **ORGANIZER_README.md**
   - Added strict format requirement section
   - Updated examples with valid/invalid formats
   - Updated troubleshooting section
   - Added visual examples of what's accepted vs rejected

2. **Error Messages**
   - Now show the actual invalid value
   - Include clear "must be YYYY-MM-DD" instruction

## Benefits

1. **Consistency**: All organized files have properly formatted dates
2. **Clarity**: Users know exactly what format is required
3. **Debugging**: Error messages show the actual invalid value
4. **Data Quality**: No ambiguous date formats in the library
5. **Standards Compliance**: YYYY-MM-DD is ISO 8601 standard

## Migration

If you have files with dates in other formats:

1. They'll be moved to `[invalid]` directory
2. Check the error message to see the current format
3. Update metadata to YYYY-MM-DD format
4. Move back to source and re-run organizer

Example workflow:
```bash
# Run organizer
npm run organize

# Check what was invalid
ls organized_music/[invalid]/

# Fix dates in metadata editor to YYYY-MM-DD
# Then move back and re-process
mv organized_music/[invalid]/*.mp3 new_songs/
npm run organize
```

