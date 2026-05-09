import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as p from '@clack/prompts';
import { parseFile } from 'music-metadata';
import { AUDIO_EXTENSIONS } from './common.ts';
import { writeTags, isWritableFormat } from './update-tag/write-tags.ts';

type Filename = 'to_house' | 'to_tech_house' | 'to_indie_dance' | "to_minimal_tech" | "to_deep_house";
type Genre = 'House' | 'Tech House' | 'Indie Dance' | 'Minimal / Deep Tech' | 'Deep House';

const ARCHIVE_DIR =
  '/Users/serhanguney/Library/Mobile Documents/com~apple~CloudDocs/Musical/[archive]';

const FILENAME_GENRE_MAP: Record<Filename, Genre> = {
  to_house: 'House',
  to_tech_house: 'Tech House',
  to_indie_dance: 'Indie Dance',
  to_minimal_tech: 'Minimal / Deep Tech',
  to_deep_house: 'Deep House'
};

function parseTitlesFromUtf16Tsv(filePath: string): string[] {
  const raw = fs.readFileSync(filePath);
  const content = raw.toString('utf16le').replace(/^﻿/, '');
  const lines = content.split('\n').map(l => l.replace(/\r$/, ''));
  const dataLines = lines.filter(l => l.trim().length > 0).slice(1);
  return dataLines
    .map(line => line.split('\t')[1]?.replace(/\s+/g, ' ').trim() ?? '')
    .filter(Boolean);
}

function collectAudioFiles(dir: string): string[] {
  const results: string[] = [];
  function walk(current: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if ((AUDIO_EXTENSIONS as readonly string[]).includes(path.extname(entry.name).toLowerCase())) {
        results.push(full);
      }
    }
  }
  walk(dir);
  return results;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

function findMatchingFile(title: string, audioFiles: string[]): string | undefined {
  const needle = normalize(title);
  return audioFiles.find(f => normalize(path.basename(f, path.extname(f))).includes(needle));
}

async function main() {
  p.intro('Update Genre Tags');

  const playlistDir = process.env.PLAYLIST_DIRECTORY;
  if (!playlistDir || !fs.existsSync(playlistDir)) {
    p.cancel(`PLAYLIST_DIRECTORY not found: ${playlistDir ?? '(not set)'}`);
    process.exit(1);
  }

  const spinner = p.spinner();

  spinner.start('Reading genre lists…');
  const titleGenreMap = new Map<string, Genre>();

  for (const [filename, genre] of Object.entries(FILENAME_GENRE_MAP) as [Filename, Genre][]) {
    const filePath = path.join(ARCHIVE_DIR, `${filename}.txt`);
    if (!fs.existsSync(filePath)) {
      continue;
    }
    const titles = parseTitlesFromUtf16Tsv(filePath);
    for (const title of titles) {
      titleGenreMap.set(normalize(title), genre);
    }
  }

  spinner.stop(`Loaded ${titleGenreMap.size} track(s) across genre lists`);

  if (titleGenreMap.size === 0) {
    p.outro('No genre list files found in archive. Nothing to do.');
    return;
  }

  spinner.start('Scanning playlist directory…');
  const audioFiles = collectAudioFiles(playlistDir);
  spinner.stop(`Found ${audioFiles.length} audio file(s)`);

  type Match = { filePath: string; genre: Genre; previousGenre: string };
  const matched: Match[] = [];
  const unmatched: string[] = [];

  spinner.start('Reading current genre tags…');
  for (const [normalizedTitle, genre] of titleGenreMap) {
    const found = findMatchingFile(normalizedTitle, audioFiles);
    if (found) {
      let previousGenre = '(none)';
      try {
        const meta = await parseFile(found);
        previousGenre = meta.common.genre?.[0] ?? '(none)';
      } catch {
        // leave as (none)
      }
      matched.push({ filePath: found, genre, previousGenre });
    } else {
      unmatched.push(normalizedTitle);
    }
  }
  spinner.stop(`Matched ${matched.length} file(s)`);

  if (matched.length === 0) {
    p.outro('No matching audio files found. Nothing to update.');
    return;
  }

  console.log('\nFiles to update:');
  for (const { filePath, genre, previousGenre } of matched) {
    console.log(`  ✓  ${path.relative(playlistDir, filePath)}  "${previousGenre}"  →  "${genre}"`);
  }

  if (unmatched.length > 0) {
    console.log('\nTracks with no matching file (will be skipped):');
    for (const t of unmatched) {
      console.log(`  ✗  ${t}`);
    }
  }

  console.log('');

  const confirmed = await p.confirm({
    message: `Update genre tag on ${matched.length} file(s)?`,
    initialValue: true,
  });

  if (p.isCancel(confirmed) || !confirmed) {
    p.cancel('Aborted. No files updated.');
    process.exit(0);
  }

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const { filePath, genre } of matched) {
    if (!isWritableFormat(filePath)) {
      console.log(`  ⚠️  Skipped (read-only format): ${path.basename(filePath)}`);
      skipped++;
      continue;
    }
    const success = writeTags(filePath, { genre });
    if (success) {
      updated++;
    } else {
      console.error(`  ✗  Failed: ${path.basename(filePath)}`);
      failed++;
    }
  }

  p.outro(
    `Updated ${updated} file(s)${skipped > 0 ? `, ${skipped} skipped (read-only)` : ''}${failed > 0 ? `, ${failed} failed` : ''}.`,
  );
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  main().catch(error => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${message}`);
    process.exit(1);
  });
}
