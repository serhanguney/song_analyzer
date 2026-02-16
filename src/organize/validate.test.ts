import { describe, it, expect } from 'vitest';
import { parseOrganizeDate, validateFile } from './validate.ts';

describe('parseOrganizeDate', () => {
  it('parses a valid YYYY-MM-DD date', () => {
    const result = parseOrganizeDate('2024-03-15');
    expect(result).toEqual({
      year: '2024',
      month: '03',
      fullDate: '2024-03-15',
      formatted: '2024/03',
    });
  });

  it('returns null for null input', () => {
    expect(parseOrganizeDate(null)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseOrganizeDate('')).toBeNull();
  });

  it('returns null for invalid format (YYYY-MM)', () => {
    expect(parseOrganizeDate('2024-03')).toBeNull();
  });

  it('returns null for invalid format (DD/MM/YYYY)', () => {
    expect(parseOrganizeDate('15/03/2024')).toBeNull();
  });

  it('returns null for non-date string', () => {
    expect(parseOrganizeDate('not-a-date')).toBeNull();
  });
});

describe('validateFile', () => {
  const completeMetadata = {
    title: 'Test Song',
    artist: 'Test Artist',
    album: 'Test Album',
    releaseDate: '2024-03-15',
    artwork: 'https://example.com/art.jpg',
    label: 'Test Label',
    genre: 'Electronic',
  };

  it('returns valid for complete metadata', () => {
    const result = validateFile(completeMetadata);
    expect(result.isValid).toBe(true);
    expect(result.missingFields).toEqual([]);
    expect(result.releaseDate).toEqual({
      year: '2024',
      month: '03',
      fullDate: '2024-03-15',
      formatted: '2024/03',
    });
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
