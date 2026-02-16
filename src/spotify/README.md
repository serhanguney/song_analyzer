# spotify.js refactor plan

## What it does

Shared utility module used by every other script. Contains Spotify API calls (auth, search, album/artist lookup), string matching helpers (similarity, artist validation, search cleanup), and audio file utilities (recursive directory scan, metadata extraction).

## Problems

1. **Plain JS with `.d.ts` workaround** — The file is `spotify.js` with a separate `spotify.d.ts` for type declarations. Converting to TypeScript eliminates the hand-maintained `.d.ts` file and gets proper type safety.

2. **Mixed responsibilities** — Spotify API calls, string utilities, and file I/O are all in one module. These are three distinct concerns:
   - **Spotify API** — auth, search, album/artist fetch
   - **String matching** — `cleanSearchString`, `getPrimaryArtist`, `validateArtistMatch`, `stringSimilarity`
   - **File I/O** — `getAudioFiles`, `extractMetadata`

3. **Massive code duplication in search functions** — `searchSpotifyTrack()` (lines 119-204) repeats the same axios call 4 times with minor query variations. `searchSpotifyAlbum()` (lines 209-358) repeats it 4 times AND duplicates the validation block (artist match + similarity check) 4 times. Both should use a loop over search strategies.

4. **`searchSpotifyAlbum` has console.log side effects** — Logs rejection messages directly, making it impure and harder to test. The caller should handle logging.

5. **`any` return types on search/fetch functions** — `searchSpotifyTrack`, `searchSpotifyAlbum`, `getSpotifyAlbum`, `getSpotifyArtist` all return `Promise<any>`. Should return typed responses.

6. **`extractMetadata` returns nulls on error** — Returns a full object with all null fields plus fileName on read failure. A simple `null` return (like the update-tag version) is cleaner — callers already check for this.

## Proposed structure

```
src/spotify/
├── README.md
├── types.ts        — Spotify API response shapes, metadata types
├── auth.ts         — getClientCredentialsToken()
├── search.ts       — searchSpotifyTrack(), searchSpotifyAlbum() (deduplicated)
├── api.ts          — getSpotifyAlbum(), getSpotifyArtist()
├── matching.ts     — cleanSearchString, getPrimaryArtist, validateArtistMatch, stringSimilarity
├── files.ts        — getAudioFiles(), extractMetadata()
└── index.ts        — Re-exports everything for backward compatibility
```

### Key changes

- **Deduplicate search**: Extract a `spotifySearch(accessToken, query, type)` helper. Both `searchSpotifyTrack` and `searchSpotifyAlbum` become a loop over search strategies calling this helper.
- **Remove console.log from `searchSpotifyAlbum`**: Return rejection reason in result instead. Let callers log.
- **Type Spotify responses**: Define `SpotifyTrack`, `SpotifyAlbum`, `SpotifyArtist` types based on the API fields actually used.
- **`index.ts` re-exports**: So all existing import paths (`from '../spotify.js'`) can be updated to `from '../spotify/index.ts'` with no functional change.
- **Delete `spotify.d.ts`**: No longer needed once the module is TypeScript.

### Importers to update

| File | Imports used |
|------|-------------|
| `src/fetch-tags/index.ts` | `getClientCredentialsToken` |
| `src/fetch-tags/match.ts` | `searchSpotifyTrack`, `searchSpotifyAlbum`, `getSpotifyAlbum`, `cleanSearchString`, `getPrimaryArtist`, `validateArtistMatch`, `stringSimilarity` |
| `src/fetch-tags/write-tags.ts` | `getSpotifyArtist` |
| `src/fetch-tags/scan.ts` | `getAudioFiles`, `extractMetadata` |
| `src/add-to-playlist.ts` | `searchSpotifyTrack`, `searchSpotifyAlbum`, `getSpotifyAlbum`, `extractMetadata`, `getAudioFiles`, `cleanSearchString`, `getPrimaryArtist`, `validateArtistMatch`, `stringSimilarity` |
| `src/add-to-playlist.test.ts` | same as above (mocked) |
| `src/update-tag/index.ts` | `getAudioFiles` |
| `src/organize/validate.ts` | `getAudioFiles`, `extractMetadata` |

## Tests

- `matching.ts` — All 4 functions are pure. Test edge cases for `cleanSearchString`, `getPrimaryArtist`, `validateArtistMatch`, `stringSimilarity`.
- `search.ts` — Test that the search strategy loop calls the helper in correct order and validates results.
- `files.ts` — `extractMetadata` field mapping can be tested against mock `parseFile` output.
