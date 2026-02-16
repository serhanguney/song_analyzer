export interface FileMetadata {
  title: string | null;
  artist: string | null;
  album: string | null;
  genre: string | null;
  label: string | null;
  bpm: number | null;
  artwork: boolean | null;
  releaseDate: string | null;
  fileName: string;
}

export interface ScannedFile {
  filePath: string;
  relativePath: string;
  metadata: FileMetadata;
  missingFields: string[];
}

export interface MatchedFile {
  filePath: string;
  fileName: string;
  spotifyData: SpotifyAlbumData;
  trackData: SpotifyTrackData | null;
  metadata: FileMetadata;
  missingFields: string[];
  suspicious: boolean;
}

export interface UnmatchedFile {
  fileName: string;
  reason: string;
}

export interface SkippedFile {
  fileName: string;
}

export interface SuspiciousMatch {
  fileName: string;
  foundAlbum: string;
  foundArtist: string;
  releaseDate: string;
  reason: string;
}

export interface MatchResults {
  matched: MatchedFile[];
  unmatched: UnmatchedFile[];
  skipped: SkippedFile[];
  suspicious: SuspiciousMatch[];
}

export interface ParsedReleaseDate {
  full: string;
  formatted: string;
  precision: string;
}

export interface UpdatableField {
  type: string;
  value: string;
}

export interface UpdatableMatch extends MatchedFile {
  updatableFields: UpdatableField[];
}

// Spotify API response shapes (partial, only what we use)

export interface SpotifyArtistRef {
  id: string;
  name: string;
}

export interface SpotifyImage {
  url: string;
  width: number;
  height: number;
}

export interface SpotifyTrackData {
  uri: string;
  name: string;
  artists: SpotifyArtistRef[];
  album: { id: string };
}

export interface SpotifyAlbumData {
  name: string;
  release_date: string;
  release_date_precision: string;
  artists: SpotifyArtistRef[];
  genres: string[];
  label: string;
  images: SpotifyImage[];
  tracks?: { items: SpotifyTrackData[] };
}
