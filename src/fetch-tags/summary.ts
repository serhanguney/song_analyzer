import { parseReleaseDate } from './write-tags.ts';
import { isValidReleaseDateFormat } from './scan.ts';
import type { MatchResults, MatchedFile, UpdatableField, UpdatableMatch } from './types.ts';

const colors = {
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  reset: '\x1b[0m',
};

export function computeUpdatableFields(item: MatchedFile): UpdatableField[] {
  const fields: UpdatableField[] = [];

  if (item.missingFields.includes('releaseDate')) {
    const rd = parseReleaseDate(item.spotifyData.release_date, item.spotifyData.release_date_precision);
    if (rd) {
      let label = 'releaseDate';
      if (item.metadata.releaseDate && !isValidReleaseDateFormat(item.metadata.releaseDate)) {
        label = `releaseDate (fixing: ${item.metadata.releaseDate})`;
      }
      fields.push({ type: label, value: `${rd.formatted} (${rd.full})` });
    }
  }

  if (item.missingFields.includes('title') && item.trackData?.name) {
    fields.push({ type: 'title', value: `"${item.trackData.name}"` });
  }

  if (item.missingFields.includes('artist') && item.trackData?.artists?.length) {
    const artists = item.trackData.artists.map(a => a.name).join(', ');
    fields.push({ type: 'artist', value: `"${artists}"` });
  }

  if (item.missingFields.includes('genre')) {
    if (item.spotifyData.genres?.length > 0) {
      fields.push({ type: 'genre', value: `"${item.spotifyData.genres.join(', ')}" (from album)` });
    } else if (item.trackData?.artists?.length) {
      fields.push({ type: 'genre', value: '(will fetch from artist data)' });
    }
  }

  if (item.missingFields.includes('label') && item.spotifyData.label) {
    fields.push({ type: 'label', value: `"${item.spotifyData.label}"` });
  }

  if (item.missingFields.includes('artwork') && item.spotifyData.images?.length > 0) {
    const img = item.spotifyData.images[0];
    fields.push({ type: 'artwork', value: `${img.width}x${img.height} image` });
  }

  return fields;
}

export function filterUpdatableMatches(
  matched: MatchedFile[],
): { updatable: UpdatableMatch[]; noUpdate: MatchedFile[] } {
  const updatable: UpdatableMatch[] = [];
  const noUpdate: MatchedFile[] = [];

  for (const item of matched) {
    const fields = computeUpdatableFields(item);
    if (fields.length > 0) {
      updatable.push({ ...item, updatableFields: fields });
    } else {
      noUpdate.push(item);
    }
  }

  return { updatable, noUpdate };
}

export function displaySummary(results: MatchResults, verbose: boolean): void {
  const { updatable, noUpdate } = filterUpdatableMatches(results.matched);

  console.log('\n' + '='.repeat(60));
  console.log('📊 Summary\n');
  console.log(`Spotify matches found: ${results.matched.length} song(s) ✅`);

  if (results.matched.length > 0) {
    console.log('\nSongs to be updated:\n');

    // Files with updatable fields
    if (updatable.length > 0) {
      updatable.forEach((item, i) => {
        console.log(`  ${i + 1}. ${item.fileName}`);
        console.log(`     Fields to update:`);
        item.updatableFields.forEach(f => {
          console.log(`       • ${colors.yellow}${f.type}: ${colors.green}${f.value}${colors.reset}`);
        });
      });
      console.log('');
    }

    // Files matched but Spotify has no data for missing fields
    if (noUpdate.length > 0) {
      console.log(`${colors.yellow}⚠️  ${noUpdate.length} song(s) matched but Spotify has no data for missing fields:${colors.reset}\n`);
      for (const item of noUpdate) {
        console.log(`  - ${item.fileName}`);

        const invalidDate = item.missingFields.includes('releaseDate')
          && item.metadata.releaseDate
          && !isValidReleaseDateFormat(item.metadata.releaseDate);

        if (invalidDate) {
          console.log(`    Invalid releaseDate: ${colors.red}"${item.metadata.releaseDate}"${colors.reset} (needs YYYY-MM-DD)`);
        }

        const otherMissing = item.missingFields.filter(f =>
          f !== 'releaseDate' || !item.metadata.releaseDate,
        );
        if (otherMissing.length > 0) {
          console.log(`    Missing: ${colors.yellow}${otherMissing.join(', ')}${colors.reset}`);
        }
        console.log(`    ${colors.yellow}Spotify has no data for these fields${colors.reset}`);
      }
      console.log('');
    }
  }

  // Unmatched
  if (results.unmatched.length > 0) {
    console.log(`No match found for ${results.unmatched.length} song(s) ⚠️:\n`);
    for (const item of results.unmatched) {
      console.log(`  - ${item.fileName} (${item.reason})`);
    }
  }

  // Skipped
  if (results.skipped.length > 0) {
    console.log(`\n${colors.cyan}Skipped ${results.skipped.length} song(s) (already have all required fields) ℹ️${colors.reset}`);
    if (verbose) {
      console.log('');
      for (const item of results.skipped) {
        console.log(`  - ${item.fileName}`);
      }
    }
  }

  // Suspicious
  if (results.suspicious.length > 0) {
    console.log(`\n⚠️  SUSPICIOUS MATCHES (${results.suspicious.length}) - Please review carefully:\n`);
    for (const item of results.suspicious) {
      console.log(`  - ${item.fileName}`);
      console.log(`    Found: ${colors.yellow}"${item.foundAlbum}"${colors.reset} by ${colors.yellow}${item.foundArtist}${colors.reset}`);
      console.log(`    Release Date: ${colors.yellow}${item.releaseDate}${colors.reset}`);
      console.log(`    Reason: ${colors.red}${item.reason}${colors.reset}\n`);
    }
    console.log('These matches may be incorrect. Review them before proceeding!');
  }

  console.log('='.repeat(60) + '\n');
}
