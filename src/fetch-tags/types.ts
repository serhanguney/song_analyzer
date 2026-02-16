import type {
  FileMetadata,
  SpotifyArtistRef,
  SpotifyImage,
  SpotifyTrackData,
  SpotifyAlbumData,
} from '../spotify/types.ts';

export type {
  FileMetadata,
  SpotifyArtistRef,
  SpotifyImage,
  SpotifyTrackData,
  SpotifyAlbumData,
};

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

