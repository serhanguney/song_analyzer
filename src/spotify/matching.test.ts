import { describe, it, expect } from 'vitest';
import { cleanSearchString, getPrimaryArtist, validateArtistMatch, stringSimilarity } from './matching.ts';

describe('cleanSearchString', () => {
  it('returns empty string for falsy input', () => {
    expect(cleanSearchString('')).toBe('');
  });

  it('removes Original Mix suffix', () => {
    expect(cleanSearchString('Blue Monday (Original Mix)')).toBe('Blue Monday');
  });

  it('removes Extended Mix suffix', () => {
    expect(cleanSearchString('Strobe (Extended Mix)')).toBe('Strobe');
  });

  it('removes Remix suffix', () => {
    expect(cleanSearchString('Levels (Remix)')).toBe('Levels');
  });

  it('leaves strings without mix suffixes unchanged', () => {
    expect(cleanSearchString('Blue Monday')).toBe('Blue Monday');
  });

  it('is case-insensitive for suffixes', () => {
    expect(cleanSearchString('Track (ORIGINAL MIX)')).toBe('Track');
  });
});

describe('getPrimaryArtist', () => {
  it('returns empty string for falsy input', () => {
    expect(getPrimaryArtist('')).toBe('');
  });

  it('returns the full string when no delimiter', () => {
    expect(getPrimaryArtist('Aphex Twin')).toBe('Aphex Twin');
  });

  it('splits on comma', () => {
    expect(getPrimaryArtist('Artist A, Artist B')).toBe('Artist A');
  });

  it('splits on ampersand', () => {
    expect(getPrimaryArtist('Bicep & Hammer')).toBe('Bicep');
  });

  it('splits on feat.', () => {
    expect(getPrimaryArtist('Main Artist feat. Guest')).toBe('Main Artist');
  });

  it('splits on ft.', () => {
    expect(getPrimaryArtist('Main Artist ft. Guest')).toBe('Main Artist');
  });

  it('uses first matching delimiter', () => {
    expect(getPrimaryArtist('A, B & C')).toBe('A');
  });
});

describe('validateArtistMatch', () => {
  it('matches exact artist name', () => {
    expect(validateArtistMatch('Bicep', [{ name: 'Bicep' }])).toBe(true);
  });

  it('matches case-insensitively', () => {
    expect(validateArtistMatch('bicep', [{ name: 'BICEP' }])).toBe(true);
  });

  it('matches when Spotify name contains search name', () => {
    expect(validateArtistMatch('Bicep', [{ name: 'Bicep Official' }])).toBe(true);
  });

  it('matches when search name contains Spotify name', () => {
    expect(validateArtistMatch('DJ Bicep', [{ name: 'Bicep' }])).toBe(true);
  });

  it('rejects when no artist matches', () => {
    expect(validateArtistMatch('Aphex Twin', [{ name: 'Bicep' }])).toBe(false);
  });

  it('handles comma-separated search artists', () => {
    expect(validateArtistMatch('Bicep, Hammer', [{ name: 'Hammer' }])).toBe(true);
  });

  it('handles multiple Spotify artists', () => {
    expect(validateArtistMatch('Bicep', [{ name: 'Other' }, { name: 'Bicep' }])).toBe(true);
  });
});

describe('stringSimilarity', () => {
  it('returns 1.0 for exact match', () => {
    expect(stringSimilarity('Blue Monday', 'Blue Monday')).toBe(1.0);
  });

  it('returns 1.0 for case-insensitive exact match', () => {
    expect(stringSimilarity('blue monday', 'Blue Monday')).toBe(1.0);
  });

  it('returns 0.8 when one contains the other', () => {
    expect(stringSimilarity('Blue Monday', 'Blue Monday (Extended)')).toBe(0.8);
  });

  it('returns word overlap ratio for partial matches', () => {
    const score = stringSimilarity('Blue Monday Night', 'Blue Monday Morning');
    // "Blue" and "Monday" are common (length > 2), out of max 3 words
    expect(score).toBeCloseTo(2 / 3);
  });

  it('returns 0 for completely different strings', () => {
    expect(stringSimilarity('abc', 'xyz')).toBe(0);
  });

  it('ignores short words (length <= 2) in overlap', () => {
    // "is" and "it" are <= 2 chars, won't count
    expect(stringSimilarity('is it', 'is it')).toBe(1.0); // exact match
    expect(stringSimilarity('is it ok', 'is it fine')).toBe(0); // no word > 2 chars overlap
  });
});
