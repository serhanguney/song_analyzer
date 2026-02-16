import { describe, it, expect } from 'vitest';
import { parseReleaseDate, buildTags } from './write-tags.ts';
import type { SpotifyAlbumData, SpotifyTrackData } from './types.ts';

describe('parseReleaseDate', () => {
  it('parses day precision', () => {
    const result = parseReleaseDate('2023-05-15', 'day');
    expect(result).toEqual({
      full: '2023-05-15',
      formatted: '2023/05',
      precision: 'day',
    });
  });

  it('parses month precision', () => {
    const result = parseReleaseDate('2023-05', 'month');
    expect(result).toEqual({
      full: '2023-05',
      formatted: '2023/05',
      precision: 'month',
    });
  });

  it('parses year precision', () => {
    const result = parseReleaseDate('2023', 'year');
    expect(result).toEqual({
      full: '2023',
      formatted: '2023/01',
      precision: 'year',
    });
  });

  it('returns null for null/undefined/empty', () => {
    expect(parseReleaseDate(null, 'day')).toBeNull();
    expect(parseReleaseDate(undefined, 'day')).toBeNull();
    expect(parseReleaseDate('', 'day')).toBeNull();
    expect(parseReleaseDate('  ', 'day')).toBeNull();
  });

  it('returns null for invalid date strings', () => {
    expect(parseReleaseDate('not-a-date', 'day')).toBeNull();
  });
});

describe('buildTags', () => {
  const spotifyData: SpotifyAlbumData = {
    name: 'Test Album',
    release_date: '2023-05-15',
    release_date_precision: 'day',
    artists: [{ id: 'a1', name: 'Test Artist' }],
    genres: ['house', 'techno'],
    label: 'Test Label',
    images: [{ url: 'http://img.test/1.jpg', width: 640, height: 640 }],
  };

  const trackData: SpotifyTrackData = {
    uri: 'spotify:track:123',
    name: 'Test Track',
    artists: [{ id: 'a1', name: 'Test Artist' }],
    album: { id: 'alb1' },
  };

  it('builds release date tags when releaseDate is missing', () => {
    const { tags, fieldsFilledIn } = buildTags(
      spotifyData, trackData,
      ['releaseDate'], null, [],
    );

    expect(tags.year).toBe('2023');
    expect(tags.date).toBe('2023-05-15');
    expect(tags.releaseTime).toBe('2023-05-15');
    expect(tags.performerInfo).toBe('2023/05');
    expect(fieldsFilledIn).toContain('releaseDate');
  });

  it('builds title tag when title is missing', () => {
    const { tags, fieldsFilledIn } = buildTags(
      spotifyData, trackData,
      ['title'], null, [],
    );

    expect(tags.title).toBe('Test Track');
    expect(fieldsFilledIn).toEqual(['title']);
  });

  it('builds artist tag when artist is missing', () => {
    const { tags, fieldsFilledIn } = buildTags(
      spotifyData, trackData,
      ['artist'], null, [],
    );

    expect(tags.artist).toBe('Test Artist');
    expect(fieldsFilledIn).toEqual(['artist']);
  });

  it('builds genre tag from resolved genres', () => {
    const { tags, fieldsFilledIn } = buildTags(
      spotifyData, trackData,
      ['genre'], null, ['house', 'techno'],
    );

    expect(tags.genre).toBe('house, techno');
    expect(fieldsFilledIn).toEqual(['genre']);
  });

  it('builds label tag as publisher', () => {
    const { tags, fieldsFilledIn } = buildTags(
      spotifyData, trackData,
      ['label'], null, [],
    );

    expect(tags.publisher).toBe('Test Label');
    expect(fieldsFilledIn).toEqual(['label']);
  });

  it('skips fields not in missingFields', () => {
    const { tags, fieldsFilledIn } = buildTags(
      spotifyData, trackData,
      [], null, ['house'],
    );

    expect(tags).toEqual({});
    expect(fieldsFilledIn).toEqual([]);
  });

  it('handles multiple missing fields at once', () => {
    const { tags, fieldsFilledIn } = buildTags(
      spotifyData, trackData,
      ['releaseDate', 'title', 'artist', 'genre', 'label'],
      null,
      ['house'],
    );

    expect(fieldsFilledIn).toEqual(['releaseDate', 'title', 'artist', 'genre', 'label']);
    expect(tags.title).toBe('Test Track');
    expect(tags.artist).toBe('Test Artist');
    expect(tags.genre).toBe('house');
    expect(tags.publisher).toBe('Test Label');
  });

  it('skips title/artist when trackData is null', () => {
    const { tags, fieldsFilledIn } = buildTags(
      spotifyData, null,
      ['title', 'artist'], null, [],
    );

    expect(tags).toEqual({});
    expect(fieldsFilledIn).toEqual([]);
  });

  it('skips genre when resolved genres is empty', () => {
    const { tags, fieldsFilledIn } = buildTags(
      spotifyData, trackData,
      ['genre'], null, [],
    );

    expect(tags.genre).toBeUndefined();
    expect(fieldsFilledIn).toEqual([]);
  });
});
