import { describe, it, expect } from 'vitest';
import { computeUpdatableFields, filterUpdatableMatches } from './summary.ts';
import type { MatchedFile, SpotifyAlbumData, SpotifyTrackData } from './types.ts';

function makeMatch(overrides: Partial<MatchedFile> = {}): MatchedFile {
  return {
    filePath: '/music/test.mp3',
    fileName: 'test.mp3',
    spotifyData: {
      name: 'Album',
      release_date: '2023-05-15',
      release_date_precision: 'day',
      artists: [{ id: 'a1', name: 'Artist' }],
      genres: ['house'],
      label: 'Label Co',
      images: [{ url: 'http://img/1.jpg', width: 640, height: 640 }],
    },
    trackData: {
      uri: 'spotify:track:1',
      name: 'Track',
      artists: [{ id: 'a1', name: 'Artist' }],
      album: { id: 'alb1' },
    },
    metadata: {
      title: null, artist: null, album: null, genre: null,
      label: null, bpm: null, artwork: null, releaseDate: null,
      fileName: 'test.mp3',
    },
    missingFields: ['releaseDate', 'title', 'genre', 'label', 'artwork'],
    suspicious: false,
    ...overrides,
  };
}

describe('computeUpdatableFields', () => {
  it('computes all updatable fields', () => {
    const fields = computeUpdatableFields(makeMatch());

    const types = fields.map(f => f.type);
    expect(types).toContain('releaseDate');
    expect(types).toContain('title');
    expect(types).toContain('genre');
    expect(types).toContain('label');
    expect(types).toContain('artwork');
  });

  it('returns empty when no missing fields', () => {
    const fields = computeUpdatableFields(makeMatch({ missingFields: [] }));
    expect(fields).toEqual([]);
  });

  it('labels invalid releaseDate as fix', () => {
    const match = makeMatch({
      missingFields: ['releaseDate'],
      metadata: {
        title: null, artist: null, album: null, genre: null,
        label: null, bpm: null, artwork: null,
        releaseDate: '2023',
        fileName: 'test.mp3',
      },
    });
    const fields = computeUpdatableFields(match);
    expect(fields[0].type).toContain('fixing: 2023');
  });

  it('skips fields when Spotify has no data', () => {
    const match = makeMatch({
      missingFields: ['genre', 'label'],
      spotifyData: {
        name: 'Album',
        release_date: '2023-05-15',
        release_date_precision: 'day',
        artists: [{ id: 'a1', name: 'Artist' }],
        genres: [],
        label: '',
        images: [],
      },
      trackData: null,
    });
    const fields = computeUpdatableFields(match);
    expect(fields).toEqual([]);
  });
});

describe('filterUpdatableMatches', () => {
  it('separates updatable from non-updatable', () => {
    const updatableMatch = makeMatch();
    const noDataMatch = makeMatch({
      missingFields: ['genre'],
      spotifyData: {
        name: 'Album',
        release_date: '2023-05-15',
        release_date_precision: 'day',
        artists: [{ id: 'a1', name: 'Artist' }],
        genres: [],
        label: '',
        images: [],
      },
      trackData: null,
    });

    const { updatable, noUpdate } = filterUpdatableMatches([updatableMatch, noDataMatch]);

    expect(updatable).toHaveLength(1);
    expect(updatable[0].fileName).toBe('test.mp3');
    expect(updatable[0].updatableFields.length).toBeGreaterThan(0);
    expect(noUpdate).toHaveLength(1);
  });

  it('handles empty input', () => {
    const { updatable, noUpdate } = filterUpdatableMatches([]);
    expect(updatable).toEqual([]);
    expect(noUpdate).toEqual([]);
  });
});
