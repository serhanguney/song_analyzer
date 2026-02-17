# organize refactor plan

## What it does

Scans SOURCE_DIRECTORY for audio files, validates that all required metadata fields are present, moves invalid files to `[invalid]/`, and organizes valid files into TARGET_DIRECTORY/YEAR/MONTH/ folders. Cleans up empty directories afterwards.

## Current problems

### 1. Duplicates `getAudioFiles` and metadata extraction
`getAudioFiles()` is copy-pasted from `spotify.js`. `extractAndValidateMetadata()` overlaps heavily with `extractMetadata()` in `spotify.js` — both read the same fields from `music-metadata` but with slightly different field mappings (e.g. `common.artists?.join(', ')` vs `common.albumartist`).

### 2. `parseReleaseDate` is duplicated
Nearly identical to the one in `fetch-tags/scan.ts` (`isValidReleaseDateFormat`) and `fetch-tags/write-tags.ts` (`parseReleaseDate`). Three copies of date validation across the codebase.

### 3. `validateMetadata` doesn't check releaseDate format
It just checks truthiness (`!metadata[fieldName]`), but releaseDate needs format validation. The caller then does a separate `hasInvalidDate` check — this should be one operation, not two.

### 4. `moveToInvalidDirectory` conflict resolution is an infinite loop
The `while(true)` loop checking `fs.access` to find a free filename is unbounded and makes one syscall per attempt. A simple approach: check once, append timestamp if conflict.

### 5. `getRelativePath` wrapper (same as fetch-tags)
One-liner around `path.relative`. Inline it.

### 6. `cleanupEmptyDirectories` references module-level `SOURCE_DIRECTORY` and `TARGET_DIRECTORY`
These should be parameters, not globals.

### 7. `main()` is a ~200-line orchestrator
The validation loop (lines 383-436) and the invalid-files display loop (lines 445-466) mix data processing with console output.

## Proposed file structure

```
src/organize/
  index.ts          — Entry point: parse config, run pipeline, print summary
  validate.ts       — validateFile(): check required fields + releaseDate format
  move.ts           — moveToInvalidDir(), moveByReleaseDate(), resolveConflict()
  cleanup.ts        — cleanupEmptyDirectories()
  types.ts          — Shared interfaces
```

Reuses from existing shared modules:
- `src/spotify.js` → `getAudioFiles()`, `extractMetadata()`
- `src/common.js` → `REQUIRED_FIELD_NAMES`
- `src/fetch-tags/scan.ts` → `isValidReleaseDateFormat()` (instead of a third copy)

## What goes where

| Function | Current location | New location | Testable? |
|---|---|---|---|
| `getAudioFiles` | rearrange.js (duplicate) | Remove, import from spotify.js | — |
| `extractAndValidateMetadata` | rearrange.js | Remove, use `extractMetadata` from spotify.js + `validateFile` | — |
| `parseReleaseDate` | rearrange.js | Remove, reuse `isValidReleaseDateFormat` from scan.ts | — |
| `validateMetadata` | rearrange.js | validate.ts as `validateFile()` — single pass, includes date check | Yes — pure |
| `moveToInvalidDirectory` | rearrange.js | move.ts | Needs fs mock |
| `moveFileByReleaseDate` | rearrange.js | move.ts | Needs fs mock |
| `cleanupEmptyDirectories` | rearrange.js | cleanup.ts — takes dirs as params | Needs fs mock |
| Validation loop + display | main() | index.ts + validate.ts | — |

## Key refactors for testability

1. **`validateFile(metadata)` → pure function** returning `{ isValid, missingFields, releaseDate, reason }`. Single function replaces `validateMetadata` + inline date checks.
2. **`parseReleaseDate(dateString)` → reuse** from `fetch-tags/scan.ts` (`isValidReleaseDateFormat`) + a small parser that returns `{ year, month }`. No third copy.
3. **`resolveFilenameConflict(targetPath)` → extracted** from `moveToInvalidDirectory`. Shared by both move functions. Bounded retry with counter.
4. **`cleanupEmptyDirectories(dir, skipDirs)` → takes parameters** instead of reading globals.

## Unit test targets

- `validateFile` — all fields present, missing fields, invalid releaseDate, missing releaseDate
- `parseOrganizeDate` — valid YYYY-MM-DD → `{ year, month }`, invalid formats → null
- `resolveFilenameConflict` — no conflict returns same path, existing file appends suffix

## Intended workflow

The script uses separate source and target directories to support a "drop folder" workflow:

```
SOURCE_DIRECTORY/       ← Drop new files here
    └── (any structure)

TARGET_DIRECTORY/       ← Organized files end up here
    ├── [invalid]/
    ├── 2022/
    │   ├── 01/
    │   └── 02/
    └── 2023/
        └── 06/
```

**Typical cycle:**
1. Add new tracks to `SOURCE_DIRECTORY`
2. Run `npm run organize`
3. Valid files move to `TARGET_DIRECTORY/YEAR/MONTH/`
4. Invalid files move to `SOURCE_DIRECTORY/[invalid]/`
5. Empty directories in source are cleaned up

**Fixing invalid files:**
1. Fix metadata in `[invalid]/` using a metadata editor
2. Move fixed files back to `SOURCE_DIRECTORY`
3. Run `npm run organize` again
