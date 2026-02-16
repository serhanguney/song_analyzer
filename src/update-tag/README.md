# update-tag refactor plan

## What it does

Interactive CLI for manually editing audio file metadata. Scans `PREPARATION_DIRECTORY` for audio files, lets the user select one, displays current metadata, prompts field-by-field for new values (title, artist, album, release date, label, genre, artwork URL), shows a diff summary, and writes the changes via node-id3. Supports MP3, WAV, and AIFF for writing; M4A and FLAC are read-only.

## Problems

1. **Debug instrumentation** — 10+ `fetch('http://127.0.0.1:7244/...')` calls with `// #region agent log` blocks. Leftover debugging, must be removed.

2. **Duplicated `getAudioFiles()`** — Already exists in `src/spotify.js`. This copy also uses sync fs (`readdirSync`/`statSync`) while the shared version is async.

3. **Duplicated `isValidReleaseDateFormat()`** — Already exists in `src/fetch-tags/scan.ts`.

4. **Duplicated `downloadArtwork()`** — Already exists in `src/fetch-tags/write-tags.ts`.

5. **Duplicated tag-writing code** — `writeMetadata()` has two nearly identical branches for MP3 (lines 145-199) and WAV/AIFF (lines 200-254). Only difference is the `else` branch for unsupported formats. Should be a single code path.

6. **`readMetadata()` duplicates `extractMetadata()`** — Similar to `src/spotify.js:extractMetadata()` but returns a slightly different shape (adds `artworkData` field for preserving existing artwork). Could extend the shared version.

7. **No separation of concerns** — Interactive prompts (readline), metadata I/O, and business logic are all interleaved in one function.

## Proposed structure

```
src/update-tag/
├── README.md
├── types.ts        — Metadata shape with artworkData field
├── metadata.ts     — readMetadata(), writeMetadata() (deduplicated branches)
├── prompt.ts       — Interactive field prompts, file selection, change summary
├── index.ts        — Entry point: wire prompt → metadata → write
```

### Reuse from existing modules

| Function | Import from |
|----------|-------------|
| `getAudioFiles()` | `src/spotify.js` |
| `isValidReleaseDateFormat()` | `src/fetch-tags/scan.ts` |
| `downloadArtwork()` | `src/fetch-tags/write-tags.ts` |
| `REQUIRED_FIELD_NAMES` | `src/common.js` |

### `metadata.ts`
- `readMetadata(filePath)` — Wraps `music-metadata.parseFile()`, returns typed metadata including `artworkData` for round-tripping existing artwork.
- `writeMetadata(filePath, tags)` — Single code path for MP3/WAV/AIFF (they use the same node-id3 API). Returns success boolean. Rejects unsupported formats.
- `buildId3Tags(tags)` — Pure function that converts our metadata shape to node-id3 tag object. Testable.

### `prompt.ts`
- `selectFile(files, baseDir)` — Display numbered list, return selected path.
- `promptFields(currentMetadata)` — Prompt for each field, return updated metadata.
- `promptArtwork(currentMetadata)` — Handle artwork URL input + download.
- `displayChangeSummary(old, new)` — Show diff and return boolean for whether changes exist.

### `index.ts`
- Validate `PREPARATION_DIRECTORY` env var.
- Scan → select → read → prompt → confirm → write pipeline.

## Tests

Unit tests for `metadata.ts`:
- `buildId3Tags()` — Pure function, test date formatting, artwork inclusion, undefined cleanup.

The prompt functions are inherently interactive (readline) and not worth unit testing.
