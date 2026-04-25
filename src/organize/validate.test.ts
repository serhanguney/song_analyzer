import { describe, it, expect } from 'vitest';
import { validateFile } from './validate.ts';

describe('validateFile', () => {
  const completeMetadata = {
    title: 'Test Song',
    artist: 'Test Artist',
    album: 'Test Album',
    releaseDate: '2024-03-15',
    artwork: true,
    label: 'Test Label',
    genre: 'Electronic',
    bpm: null,
    fileName: 'test.mp3',
  };

  it('returns valid for complete metadata', () => {
    const result = validateFile(completeMetadata);
    expect(result.isValid).toBe(true);
    expect(result.missingFields).toEqual([]);
    expect(result.reason).toBeNull();
  });

  it('returns invalid when title is missing', () => {
    const result = validateFile({ ...completeMetadata, title: '' });
    expect(result.isValid).toBe(false);
    expect(result.missingFields).toContain('title');
  });

  it('returns invalid when releaseDate is missing', () => {
    const result = validateFile({ ...completeMetadata, releaseDate: '' });
    expect(result.isValid).toBe(false);
    expect(result.missingFields).toContain('releaseDate');
    expect(result.reason).toContain('Missing release date');
  });

  it('returns invalid when releaseDate has wrong format', () => {
    const result = validateFile({ ...completeMetadata, releaseDate: '03-2024' });
    expect(result.isValid).toBe(false);
    expect(result.missingFields).toContain('releaseDate');
    expect(result.reason).toContain('Invalid release date format');
  });

  it('reports multiple missing fields', () => {
    const result = validateFile({ ...completeMetadata, title: '', artist: '', album: '' });
    expect(result.isValid).toBe(false);
    expect(result.missingFields).toContain('title');
    expect(result.missingFields).toContain('artist');
    expect(result.missingFields).toContain('album');
    expect(result.reason).toContain('Missing fields: title, artist, album');
  });

  it('reports both invalid date and missing fields', () => {
    const result = validateFile({ ...completeMetadata, releaseDate: 'bad', genre: '' });
    expect(result.isValid).toBe(false);
    expect(result.reason).toContain('Invalid release date format');
    expect(result.reason).toContain('Missing fields: genre');
  });
});
