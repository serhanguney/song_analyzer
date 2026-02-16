import { describe, it, expect, vi, beforeEach } from 'vitest';
import { addTracksToPlaylist, matchFiles, getPlaylistTracks, filterDuplicates } from './add-to-playlist.ts';

// Mock spotify module — use real implementations for validation functions
import { validateArtistMatch as realValidateArtistMatch, stringSimilarity as realStringSimilarity } from './spotify/index.ts';
vi.mock('./spotify/index.ts', async (importOriginal) => {
  const orig = await importOriginal<typeof import('./spotify/index.ts')>();
  return {
    searchSpotifyTrack: vi.fn(),
    searchSpotifyAlbum: vi.fn(),
    getSpotifyAlbum: vi.fn(),
    getAudioFiles: vi.fn(),
    extractMetadata: vi.fn(),
    validateArtistMatch: orig.validateArtistMatch,
    stringSimilarity: orig.stringSimilarity,
  };
});

// Mock spotify-auth.ts
vi.mock('./spotify-auth.ts', () => ({
  getUserAccessToken: vi.fn(),
}));

// Mock dotenv
vi.mock('dotenv/config', () => ({}));

import { searchSpotifyTrack, searchSpotifyAlbum, getSpotifyAlbum, extractMetadata } from './spotify/index.ts';

const mockSearchTrack = vi.mocked(searchSpotifyTrack);
const mockSearchAlbum = vi.mocked(searchSpotifyAlbum);
const mockGetAlbum = vi.mocked(getSpotifyAlbum);
const mockExtractMetadata = vi.mocked(extractMetadata);

beforeEach(() => {
  vi.clearAllMocks();
  // Suppress stdout.write progress output during tests
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
});

describe('addTracksToPlaylist', () => {
  it('sends track URIs to the Spotify API', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', mockFetch);

    const uris = ['spotify:track:abc', 'spotify:track:def'];
    await addTracksToPlaylist('token123', 'playlist456', uris);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.spotify.com/v1/playlists/playlist456/tracks',
      {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer token123',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ uris }),
      },
    );
  });

  it('batches requests when more than 100 URIs', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', mockFetch);

    const uris = Array.from({ length: 150 }, (_, i) => `spotify:track:${i}`);
    await addTracksToPlaylist('token', 'playlist', uris);

    expect(mockFetch).toHaveBeenCalledTimes(2);

    // First batch: 100 tracks
    const firstCall = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(firstCall.uris).toHaveLength(100);

    // Second batch: 50 tracks
    const secondCall = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(secondCall.uris).toHaveLength(50);
  });

  it('throws on API error', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: () => Promise.resolve('Forbidden'),
    });
    vi.stubGlobal('fetch', mockFetch);

    await expect(
      addTracksToPlaylist('token', 'playlist', ['spotify:track:1']),
    ).rejects.toThrow('Failed to add tracks (batch 1): 403 Forbidden');
  });

  it('handles empty URI list without calling API', async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    await addTracksToPlaylist('token', 'playlist', []);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('matchFiles', () => {
  it('matches files via track search', async () => {
    mockExtractMetadata.mockResolvedValue({
      title: 'Blue Monday',
      artist: 'New Order',
      album: 'Substance',
      genre: null,
      label: null,
      bpm: null,
      artwork: null,
      releaseDate: null,
      fileName: 'blue-monday.mp3',
    });

    mockSearchTrack.mockResolvedValue({
      uri: 'spotify:track:abc123',
      name: 'Blue Monday',
      artists: [{ id: '1', name: 'New Order' }],
      album: { id: 'alb1' },
    });

    const result = await matchFiles('token', ['/music/blue-monday.mp3'], '/music');

    expect(result.matched).toHaveLength(1);
    expect(result.matched[0]).toEqual({
      fileName: 'blue-monday.mp3',
      uri: 'spotify:track:abc123',
      spotifyName: 'Blue Monday',
      spotifyArtist: 'New Order',
    });
    expect(result.unmatched).toHaveLength(0);
  });

  it('falls back to album search when track search fails', async () => {
    mockExtractMetadata.mockResolvedValue({
      title: 'Intro',
      artist: 'The xx',
      album: 'xx',
      genre: null,
      label: null,
      bpm: null,
      artwork: null,
      releaseDate: null,
      fileName: 'intro.mp3',
    });

    mockSearchTrack.mockResolvedValue(null);
    mockSearchAlbum.mockResolvedValue({
      data: {
        id: 'album123',
        name: 'xx',
        release_date: '2009-08-17',
        release_date_precision: 'day',
        artists: [{ id: '2', name: 'The xx' }],
        genres: [],
        label: '',
        images: [],
      },
    });
    mockGetAlbum.mockResolvedValue({
      id: 'album123',
      name: 'xx',
      release_date: '2009-08-17',
      release_date_precision: 'day',
      artists: [{ id: '2', name: 'The xx' }],
      genres: [],
      label: '',
      images: [],
      tracks: {
        items: [
          { uri: 'spotify:track:xyz', name: 'Intro', artists: [{ id: '2', name: 'The xx' }], album: { id: 'album123' } },
          { uri: 'spotify:track:other', name: 'VCR', artists: [{ id: '2', name: 'The xx' }], album: { id: 'album123' } },
        ],
      },
    });

    const result = await matchFiles('token', ['/music/intro.mp3'], '/music');

    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].uri).toBe('spotify:track:xyz');
    expect(mockSearchAlbum).toHaveBeenCalledWith('token', 'The xx', 'xx');
    expect(mockGetAlbum).toHaveBeenCalledWith('token', 'album123');
  });

  it('marks files as unmatched when no artist metadata', async () => {
    mockExtractMetadata.mockResolvedValue({
      title: 'Unknown',
      artist: null,
      album: null,
      genre: null,
      label: null,
      bpm: null,
      artwork: null,
      releaseDate: null,
      fileName: 'unknown.mp3',
    });

    const result = await matchFiles('token', ['/music/unknown.mp3'], '/music');

    expect(result.matched).toHaveLength(0);
    expect(result.unmatched).toHaveLength(1);
    expect(result.unmatched[0].reason).toBe('No artist metadata');
    expect(mockSearchTrack).not.toHaveBeenCalled();
  });

  it('marks files as unmatched when Spotify returns no results', async () => {
    mockExtractMetadata.mockResolvedValue({
      title: 'Obscure Track',
      artist: 'Unknown Artist',
      album: null,
      genre: null,
      label: null,
      bpm: null,
      artwork: null,
      releaseDate: null,
      fileName: 'obscure.mp3',
    });

    mockSearchTrack.mockResolvedValue(null);

    const result = await matchFiles('token', ['/music/obscure.mp3'], '/music');

    expect(result.matched).toHaveLength(0);
    expect(result.unmatched).toHaveLength(1);
    expect(result.unmatched[0].reason).toBe('No Spotify match found');
  });

  it('processes multiple files and separates matched from unmatched', async () => {
    mockExtractMetadata
      .mockResolvedValueOnce({
        title: 'Track A', artist: 'Artist A', album: null,
        genre: null, label: null, bpm: null, artwork: null, releaseDate: null,
        fileName: 'a.mp3',
      })
      .mockResolvedValueOnce({
        title: 'Track B', artist: null, album: null,
        genre: null, label: null, bpm: null, artwork: null, releaseDate: null,
        fileName: 'b.mp3',
      })
      .mockResolvedValueOnce({
        title: 'Track C', artist: 'Artist C', album: null,
        genre: null, label: null, bpm: null, artwork: null, releaseDate: null,
        fileName: 'c.mp3',
      });

    mockSearchTrack
      .mockResolvedValueOnce({
        uri: 'spotify:track:a', name: 'Track A', artists: [{ id: '1', name: 'Artist A' }], album: { id: 'alb1' },
      })
      .mockResolvedValueOnce(null);

    const result = await matchFiles(
      'token',
      ['/music/a.mp3', '/music/b.mp3', '/music/c.mp3'],
      '/music',
    );

    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].fileName).toBe('a.mp3');
    expect(result.unmatched).toHaveLength(2);
    expect(result.unmatched.map(u => u.fileName)).toEqual(['b.mp3', 'c.mp3']);
  });

  it('rejects track result when artist does not match', async () => {
    mockExtractMetadata.mockResolvedValue({
      title: 'daydream', artist: 'Jørd', album: null,
      genre: null, label: null, bpm: null, artwork: null, releaseDate: null,
      fileName: 'daydream.mp3',
    });

    mockSearchTrack.mockResolvedValue({
      uri: 'spotify:track:wrong',
      name: 'Daydreams',
      artists: [{ id: '3', name: 'Jordan Plant' }, { id: '4', name: 'Mac White' }],
      album: { id: 'alb2' },
    });

    const result = await matchFiles('token', ['/music/daydream.mp3'], '/music');

    expect(result.matched).toHaveLength(0);
    expect(result.unmatched).toHaveLength(1);
    expect(result.unmatched[0].reason).toBe('No Spotify match found');
  });

  it('rejects track result when title similarity is too low', async () => {
    mockExtractMetadata.mockResolvedValue({
      title: 'Magnolia', artist: 'Some Artist', album: null,
      genre: null, label: null, bpm: null, artwork: null, releaseDate: null,
      fileName: 'magnolia.mp3',
    });

    mockSearchTrack.mockResolvedValue({
      uri: 'spotify:track:wrong',
      name: 'Completely Different Song',
      artists: [{ id: '5', name: 'Some Artist' }],
      album: { id: 'alb3' },
    });

    const result = await matchFiles('token', ['/music/magnolia.mp3'], '/music');

    expect(result.matched).toHaveLength(0);
    expect(result.unmatched).toHaveLength(1);
  });

  it('rejects album fallback track when artist does not match', async () => {
    mockExtractMetadata.mockResolvedValue({
      title: 'Intro', artist: 'Artist A', album: 'My Album',
      genre: null, label: null, bpm: null, artwork: null, releaseDate: null,
      fileName: 'intro.mp3',
    });

    mockSearchTrack.mockResolvedValue(null);
    mockSearchAlbum.mockResolvedValue({
      data: {
        id: 'album1',
        name: 'My Album',
        release_date: '2023-01-01',
        release_date_precision: 'day',
        artists: [{ id: '6', name: 'Artist A' }],
        genres: [],
        label: '',
        images: [],
      },
    });
    mockGetAlbum.mockResolvedValue({
      id: 'album1',
      name: 'My Album',
      release_date: '2023-01-01',
      release_date_precision: 'day',
      artists: [{ id: '6', name: 'Artist A' }],
      genres: [],
      label: '',
      images: [],
      tracks: {
        items: [
          { uri: 'spotify:track:wrong', name: 'Intro', artists: [{ id: '7', name: 'Wrong Artist' }], album: { id: 'album1' } },
        ],
      },
    });

    const result = await matchFiles('token', ['/music/intro.mp3'], '/music');

    expect(result.matched).toHaveLength(0);
    expect(result.unmatched).toHaveLength(1);
  });
});

describe('getPlaylistTracks', () => {
  it('fetches all tracks from a single page', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        items: [
          { track: { name: 'Song A', artists: [{ name: 'Artist A' }] } },
          { track: { name: 'Song B', artists: [{ name: 'Artist B' }, { name: 'Artist C' }] } },
        ],
        next: null,
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const tracks = await getPlaylistTracks('token', 'playlist123');

    expect(tracks).toEqual([
      { name: 'Song A', artists: ['Artist A'] },
      { name: 'Song B', artists: ['Artist B', 'Artist C'] },
    ]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toContain('playlists/playlist123/tracks');
  });

  it('paginates through multiple pages', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          items: [{ track: { name: 'Song A', artists: [{ name: 'Artist A' }] } }],
          next: 'https://api.spotify.com/v1/playlists/p/tracks?offset=100',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          items: [{ track: { name: 'Song B', artists: [{ name: 'Artist B' }] } }],
          next: null,
        }),
      });
    vi.stubGlobal('fetch', mockFetch);

    const tracks = await getPlaylistTracks('token', 'p');

    expect(tracks).toHaveLength(2);
    expect(tracks[0].name).toBe('Song A');
    expect(tracks[1].name).toBe('Song B');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('skips null tracks (deleted/unavailable)', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        items: [
          { track: null },
          { track: { name: 'Valid', artists: [{ name: 'Artist' }] } },
        ],
        next: null,
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const tracks = await getPlaylistTracks('token', 'p');

    expect(tracks).toHaveLength(1);
    expect(tracks[0].name).toBe('Valid');
  });

  it('throws on API error', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: () => Promise.resolve('Not Found'),
    });
    vi.stubGlobal('fetch', mockFetch);

    await expect(getPlaylistTracks('token', 'bad')).rejects.toThrow(
      'Failed to fetch playlist tracks: 404 Not Found',
    );
  });
});

describe('filterDuplicates', () => {
  it('filters out tracks already in the playlist', () => {
    const matched = [
      { fileName: 'a.mp3', uri: 'spotify:track:a', spotifyName: 'Song A', spotifyArtist: 'Artist A' },
      { fileName: 'b.mp3', uri: 'spotify:track:b', spotifyName: 'Song B', spotifyArtist: 'Artist B' },
      { fileName: 'c.mp3', uri: 'spotify:track:c', spotifyName: 'Song C', spotifyArtist: 'Artist C' },
    ];
    const existing = [
      { name: 'Song A', artists: ['Artist A'] },
      { name: 'Song C', artists: ['Artist C'] },
    ];

    const { toAdd, duplicates } = filterDuplicates(matched, existing);

    expect(toAdd).toHaveLength(1);
    expect(toAdd[0].spotifyName).toBe('Song B');
    expect(duplicates).toHaveLength(2);
    expect(duplicates.map(d => d.spotifyName)).toEqual(['Song A', 'Song C']);
  });

  it('matches case-insensitively', () => {
    const matched = [
      { fileName: 'a.mp3', uri: 'spotify:track:a', spotifyName: 'blue monday', spotifyArtist: 'new order' },
    ];
    const existing = [
      { name: 'Blue Monday', artists: ['New Order'] },
    ];

    const { toAdd, duplicates } = filterDuplicates(matched, existing);

    expect(toAdd).toHaveLength(0);
    expect(duplicates).toHaveLength(1);
  });

  it('does not filter when artist differs', () => {
    const matched = [
      { fileName: 'a.mp3', uri: 'spotify:track:a', spotifyName: 'Song A', spotifyArtist: 'Artist X' },
    ];
    const existing = [
      { name: 'Song A', artists: ['Artist Y'] },
    ];

    const { toAdd, duplicates } = filterDuplicates(matched, existing);

    expect(toAdd).toHaveLength(1);
    expect(duplicates).toHaveLength(0);
  });

  it('handles multiple artists in existing tracks', () => {
    const matched = [
      { fileName: 'a.mp3', uri: 'spotify:track:a', spotifyName: 'Collab', spotifyArtist: 'A, B' },
    ];
    const existing = [
      { name: 'Collab', artists: ['A', 'B'] },
    ];

    const { toAdd, duplicates } = filterDuplicates(matched, existing);

    expect(toAdd).toHaveLength(0);
    expect(duplicates).toHaveLength(1);
  });

  it('returns all as toAdd when playlist is empty', () => {
    const matched = [
      { fileName: 'a.mp3', uri: 'spotify:track:a', spotifyName: 'Song A', spotifyArtist: 'Artist A' },
      { fileName: 'b.mp3', uri: 'spotify:track:b', spotifyName: 'Song B', spotifyArtist: 'Artist B' },
    ];

    const { toAdd, duplicates } = filterDuplicates(matched, []);

    expect(toAdd).toHaveLength(2);
    expect(duplicates).toHaveLength(0);
  });
});
