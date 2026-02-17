# fetch-tags refactor plan

## What it does

Scans a directory for audio files, finds missing metadata fields, searches Spotify for matches, and writes the missing tags back to the files.

## Current problems

### 1. `main()` is a 450-line god function
The scanning loop, Spotify matching, summary display, and update loop are all inline in `main()`. Each of these is a distinct phase that should be its own function.

### 2. `updateFileMetadata()` does too many things
It parses dates, builds ID3 tags, downloads artwork, writes tags, AND runs verbose verification — all in one 220-line function with deeply nested if/else branches. The verbose verification block (lines 293-338) reads back the file with two different libraries just for debug logging — this should be a separate debug utility, not inline.

### 3. Duplicate code with `spotify.js`
`searchSpotifyTrack` and `searchSpotifyAlbum` in `spotify.js` each repeat the same "build query → call API → check results" pattern 4 times with minor variations. This can be a loop over query strategies.

### 4. Verbose logging is scattered everywhere
`if (VERBOSE)` blocks are mixed into business logic throughout. Logging concerns should be separated from data processing.

### 5. `colors` object is duplicated
Defined identically in `fetch-tags.js` and `add-to-playlist.ts`. Should live in a shared module.

### 6. Module-level mutable state
`accessToken` is a module-level `let` that gets mutated. Functions in `spotify.js` already take it as a parameter (good), but `updateFileMetadata` still reads it from the closure to call `getSpotifyArtist`. It should be passed in.

### 7. `getRelativePath` is just `path.relative`
One-liner wrapper adds no value. Inline it.

### 8. Summary display logic is complex and duplicated
The summary section (lines 597-744) computes "updatable fields" twice — once for display and once for filtering. This should compute once and reuse.

## Proposed file structure

```
src/fetch-tags/
  index.ts          — Entry point: parse args, validate config, run pipeline
  scan.ts           — scanFiles(): get audio files + extract metadata + find missing fields
  match.ts          — matchFilesToSpotify(): search Spotify for each file, return results
  write-tags.ts     — buildTags(), writeTags(): construct ID3 tags from Spotify data, write to file
  summary.ts        — displaySummary(): format and print the results table
  types.ts          — Shared interfaces (ScanResult, MatchResult, etc.)
```

Existing shared modules stay where they are:
- `src/spotify.js` → Spotify API calls (search, album, artist)
- `src/common.js` → constants

## What goes where

| Function | Current location | New location | Testable? |
|---|---|---|---|
| `parseReleaseDate` | fetch-tags.js | write-tags.ts | Yes — pure function |
| `isValidReleaseDateFormat` | fetch-tags.js | scan.ts (or shared) | Yes — pure function |
| `getMissingRequiredFields` | fetch-tags.js | scan.ts | Yes — pure function |
| `updateFileMetadata` | fetch-tags.js | write-tags.ts (split into `buildTags` + `writeTags`) | Yes — `buildTags` is pure, `writeTags` needs mock |
| Scanning loop | main() lines 445-590 | scan.ts + match.ts | Yes |
| Summary display | main() lines 597-744 | summary.ts | Yes — given results, check output |
| Update loop | main() lines 774-813 | index.ts (thin orchestration) | Integration test |

## Key refactors for testability

1. **`buildTags(spotifyData, trackData, missingFields)` → pure function** returning a tags object. No I/O, no logging. Easy to unit test.
2. **`writeTags(filePath, tags)` → thin I/O wrapper** around NodeID3.update. Mock in tests.
3. **Artwork download extracted** into `downloadArtwork(url)` → returns Buffer. Mock `axios` in tests.
4. **Search deduplication** — `searchSpotifyTrack` and `searchSpotifyAlbum` should use a shared `searchWithFallback(strategies)` helper to eliminate the repeated query pattern.

## Unit test targets

- `parseReleaseDate` — various precisions, edge cases (empty, invalid)
- `isValidReleaseDateFormat` — valid dates, invalid formats, boundary years
- `getMissingRequiredFields` — all present, some missing, invalid releaseDate
- `buildTags` — maps Spotify data to correct ID3 fields, skips fields not in missingFields
- `filterUpdatableMatches` — separates matches with/without updatable data

## Design decisions

### Formatted date stored in Album Artist (TPE2), not Album

The formatted release date (YYYY/MM) is written to `performerInfo` (node-id3's name for the TPE2/Album Artist frame) instead of the `album` field. This prevents a feedback loop where:

1. First run writes `album = "2021/05"` (overwriting the real album name)
2. Second run searches Spotify with `album: "2021/05"` → wrong match
3. Wrong match's release date (e.g. 1987) propagates back

By using `performerInfo`/TPE2, the original album name is preserved for accurate Spotify searches on subsequent runs.

### Validation thresholds

- **Artist match**: Required — exact match or substring match (bidirectional, case-insensitive)
- **Album similarity**: 30% minimum for first 3 search strategies, 20% for last-resort general search
- **Suspicious match**: Release year < 1990 is flagged for user review (house/electronic music is typically post-1990)
