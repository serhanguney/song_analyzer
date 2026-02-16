import { describe, it, expect } from 'vitest';
import { isValidReleaseDateFormat, getMissingRequiredFields } from './scan.ts';

describe('isValidReleaseDateFormat', () => {
  it('accepts valid YYYY-MM-DD dates', () => {
    expect(isValidReleaseDateFormat('2023-05-15')).toBe(true);
    expect(isValidReleaseDateFormat('1990-01-01')).toBe(true);
    expect(isValidReleaseDateFormat('2025-12-31')).toBe(true);
  });

  it('rejects null and empty', () => {
    expect(isValidReleaseDateFormat(null)).toBe(false);
    expect(isValidReleaseDateFormat('')).toBe(false);
  });

  it('rejects wrong formats', () => {
    expect(isValidReleaseDateFormat('2023')).toBe(false);
    expect(isValidReleaseDateFormat('2023-05')).toBe(false);
    expect(isValidReleaseDateFormat('05-15-2023')).toBe(false);
    expect(isValidReleaseDateFormat('2023/05/15')).toBe(false);
    expect(isValidReleaseDateFormat('not-a-date')).toBe(false);
  });

  it('rejects out-of-range values', () => {
    expect(isValidReleaseDateFormat('1899-01-01')).toBe(false);
    expect(isValidReleaseDateFormat('2023-13-01')).toBe(false);
    expect(isValidReleaseDateFormat('2023-00-01')).toBe(false);
    expect(isValidReleaseDateFormat('2023-01-32')).toBe(false);
    expect(isValidReleaseDateFormat('2023-01-00')).toBe(false);
  });
});

describe('getMissingRequiredFields', () => {
  const complete = {
    title: 'Song',
    artist: 'Artist',
    album: 'Album',
    releaseDate: '2023-05-15',
    artwork: true,
    label: 'Label',
    genre: 'House',
  };

  it('returns empty array when all fields present', () => {
    expect(getMissingRequiredFields(complete)).toEqual([]);
  });

  it('detects missing fields', () => {
    const { genre, label, ...rest } = complete;
    expect(getMissingRequiredFields(rest)).toEqual(['label', 'genre']);
  });

  it('detects null fields as missing', () => {
    expect(getMissingRequiredFields({ ...complete, title: null })).toEqual(['title']);
  });

  it('detects invalid releaseDate format as missing', () => {
    expect(getMissingRequiredFields({ ...complete, releaseDate: '2023' })).toEqual(['releaseDate']);
    expect(getMissingRequiredFields({ ...complete, releaseDate: '05/2023' })).toEqual(['releaseDate']);
  });

  it('detects missing releaseDate', () => {
    expect(getMissingRequiredFields({ ...complete, releaseDate: null })).toEqual(['releaseDate']);
  });
});
