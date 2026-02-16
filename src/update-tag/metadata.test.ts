import { describe, it, expect } from 'vitest';
import { buildId3Tags } from './metadata.ts';
import type { FileMetadata } from './types.ts';

function makeMetadata(overrides: Partial<FileMetadata> = {}): FileMetadata {
  return {
    title: 'Test Song',
    artist: 'Test Artist',
    album: 'Test Album',
    releaseDate: '2024-03-15',
    artwork: '[No artwork]',
    artworkData: null,
    label: 'Test Label',
    genre: 'Electronic',
    ...overrides,
  };
}

describe('buildId3Tags', () => {
  it('maps basic fields to id3 tag names', () => {
    const tags = buildId3Tags(makeMetadata());
    expect(tags.title).toBe('Test Song');
    expect(tags.artist).toBe('Test Artist');
    expect(tags.album).toBe('Test Album');
    expect(tags.publisher).toBe('Test Label');
    expect(tags.genre).toBe('Electronic');
  });

  it('formats release date into multiple id3 fields', () => {
    const tags = buildId3Tags(makeMetadata({ releaseDate: '2024-03-15' }));
    expect(tags.year).toBe('2024');
    expect(tags.date).toBe('2024-03-15');
    expect(tags.performerInfo).toBe('2024/03');
    expect(tags.releaseTime).toBe('2024-03-15');
    expect(tags.originalReleaseTime).toBe('2024-03-15');
    expect(tags.recordingTime).toBe('2024-03-15');
  });

  it('defaults month to 01 when only year is provided', () => {
    const tags = buildId3Tags(makeMetadata({ releaseDate: '2024' }));
    expect(tags.performerInfo).toBe('2024/01');
  });

  it('omits date fields when releaseDate is empty', () => {
    const tags = buildId3Tags(makeMetadata({ releaseDate: '' }));
    expect(tags.year).toBeUndefined();
    expect(tags.date).toBeUndefined();
    expect(tags.performerInfo).toBeUndefined();
  });

  it('includes artwork image when artworkData is present', () => {
    const artworkData = {
      mime: 'image/jpeg',
      type: { id: 3, name: 'front cover' },
      description: 'Cover Art',
      imageBuffer: Buffer.from('fake-image'),
    };
    const tags = buildId3Tags(makeMetadata({ artworkData }));
    expect(tags.image).toEqual(artworkData);
  });

  it('omits image when artworkData is null', () => {
    const tags = buildId3Tags(makeMetadata({ artworkData: null }));
    expect(tags.image).toBeUndefined();
  });

  it('removes keys with undefined values', () => {
    const tags = buildId3Tags(makeMetadata({ title: '', artist: '', label: '', genre: '' }));
    expect('title' in tags).toBe(false);
    expect('artist' in tags).toBe(false);
    expect('publisher' in tags).toBe(false);
    expect('genre' in tags).toBe(false);
  });

  it('keeps album even when other fields are empty', () => {
    const tags = buildId3Tags(makeMetadata({ title: '', album: 'Still Here' }));
    expect(tags.album).toBe('Still Here');
    expect('title' in tags).toBe(false);
  });
});
