/**
 * Clean and normalize search strings for better matching.
 * Removes common mix/version suffixes.
 */
export function cleanSearchString(str: string): string {
  if (!str) return '';

  return str
    .replace(/\s*\((Original Mix|Extended Mix|Radio Edit|Club Mix|Remix|Edit|Dub|Instrumental)\)/gi, '')
    .trim();
}

/**
 * Extract primary artist from multi-artist string.
 * Splits by common delimiters and returns the first artist.
 */
export function getPrimaryArtist(artistString: string): string {
  if (!artistString) return '';

  const delimiters = [',', ' & ', ' feat. ', ' ft. ', ' featuring ', ' vs ', ' x '];

  for (const delimiter of delimiters) {
    if (artistString.includes(delimiter)) {
      return artistString.split(delimiter)[0].trim();
    }
  }

  return artistString.trim();
}

/**
 * Validate if Spotify result artists match the search artist.
 * Checks if any Spotify artist name matches any search artist name
 * (exact, contains, or contained-by).
 */
export function validateArtistMatch(
  searchArtist: string,
  spotifyArtists: Array<{ name: string }>,
): boolean {
  const searchArtistNames = searchArtist.toLowerCase().trim().split(',').map(a => a.trim());

  return spotifyArtists.some(spotifyArtist => {
    const spotifyName = spotifyArtist.name.toLowerCase().trim();

    return searchArtistNames.some(searchName =>
      spotifyName === searchName ||
      spotifyName.includes(searchName) ||
      searchName.includes(spotifyName),
    );
  });
}

/**
 * Calculate string similarity between two strings (0-1).
 * Uses exact match, containment, and word overlap.
 */
export function stringSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();

  if (s1 === s2) return 1.0;

  if (s1.includes(s2) || s2.includes(s1)) return 0.8;

  const words1 = s1.split(/\s+/);
  const words2 = s2.split(/\s+/);
  const commonWords = words1.filter(w => words2.includes(w) && w.length > 2);

  if (words1.length === 0 || words2.length === 0) return 0;

  return commonWords.length / Math.max(words1.length, words2.length);
}
