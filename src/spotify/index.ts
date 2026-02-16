// Re-export everything for convenient imports
export { getClientCredentialsToken } from './auth.ts';
export { cleanSearchString, getPrimaryArtist, validateArtistMatch, stringSimilarity } from './matching.ts';
export { searchSpotifyTrack, searchSpotifyAlbum } from './search.ts';
export { getSpotifyAlbum, getSpotifyArtist } from './api.ts';
export { getAudioFiles, extractMetadata } from './files.ts';

// Re-export types
export type {
  SpotifyArtistRef,
  SpotifyImage,
  SpotifyTrackData,
  SpotifyAlbumData,
  SpotifyArtistData,
  FileMetadata,
  SearchResult,
} from './types.ts';
