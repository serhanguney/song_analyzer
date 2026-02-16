// Spotify API response shapes (partial, only fields we use)

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
  id: string;
  name: string;
  release_date: string;
  release_date_precision: string;
  artists: SpotifyArtistRef[];
  genres: string[];
  label: string;
  images: SpotifyImage[];
  tracks?: { items: SpotifyTrackData[] };
}

export interface SpotifyArtistData {
  id: string;
  name: string;
  genres: string[];
}

// Local file metadata shape
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

// Search result with rejection info
export interface SearchResult<T> {
  data: T | null;
  rejected?: { reason: string; details?: string };
}
