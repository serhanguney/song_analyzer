import 'dotenv/config';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as p from '@clack/prompts';
import { AUDIO_EXTENSIONS } from './common.ts';

const DRY_RUN = process.argv.includes('--dry-run');

function parseTitlesFromUtf16Tsv(filePath: string): string[] {
  const raw = fs.readFileSync(filePath);
  // Detect and strip UTF-16 LE BOM (FF FE)
  const hasBom = raw[0] === 0xff && raw[1] === 0xfe;
  const content = raw.toString('utf16le');
  const lines = content
    .replace(/^\uFEFF/, '')
    .split('\n')
    .map(l => l.replace(/\r$/, ''));

  // First non-empty line is the header — skip it
  const dataLines = lines.filter(l => l.trim().length > 0).slice(1);

  return dataLines.map(line => {
    const cols = line.split('\t');
    // Column layout: # \t Track Title \t Key \t ...
    return cols[1]?.trim() ?? '';
  }).filter(Boolean);
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

function findMatchingFile(title: string, audioFiles: string[]): string | undefined {
  const needle = title.toLowerCase();
  return audioFiles.find(f => path.basename(f, path.extname(f)).toLowerCase().includes(needle));
}

async function main() {
  p.intro('Delete tracks from Playlist Directory');

  const playlistDir = process.env.PLAYLIST_DIRECTORY;
  if (!playlistDir || !fs.existsSync(playlistDir)) {
    p.cancel(`PLAYLIST_DIRECTORY not found: ${playlistDir ?? '(not set)'}`);
    process.exit(1);
  }

  const listPath = '/Users/serhanguney/Library/Mobile Documents/com~apple~CloudDocs/Musical/[archive]/to_delete.txt';
  if (!fs.existsSync(listPath)) {
    p.cancel(`to_delete.txt not found at: ${listPath}`);
    process.exit(1);
  }

  const spinner = p.spinner();

  spinner.start('Parsing to_delete.txt…');
  const titles = parseTitlesFromUtf16Tsv(listPath);
  spinner.stop(`Parsed ${titles.length} track title(s)`);

  spinner.start('Scanning playlist directory…');
  const audioFiles = collectAudioFiles(playlistDir);
  spinner.stop(`Found ${audioFiles.length} audio file(s) in directory`);

  type Match = { title: string; filePath: string };
  const matched: Match[] = [];
  const unmatched: string[] = [];

  for (const title of titles) {
    const found = findMatchingFile(title, audioFiles);
    if (found) {
      matched.push({ title, filePath: found });
    } else {
      unmatched.push(title);
    }
  }

  if (matched.length === 0) {
    p.outro('No matching files found. Nothing to delete.');
    return;
  }

  console.log('\nFiles to be deleted:');
  for (const { title, filePath } of matched) {
    console.log(`  ✓  ${path.relative(playlistDir, filePath)}  (matched: "${title}")`);
  }

  if (unmatched.length > 0) {
    console.log('\nTitles with no match (will be skipped):');
    for (const t of unmatched) {
      console.log(`  ✗  ${t}`);
    }
  }

  console.log('');

  if (DRY_RUN) {
    p.outro(`Dry run — ${matched.length} file(s) would be deleted.`);
    return;
  }

  const confirmed = await p.confirm({
    message: `Delete ${matched.length} file(s)? This cannot be undone.`,
    initialValue: false,
  });

  if (p.isCancel(confirmed) || !confirmed) {
    p.cancel('Aborted. No files deleted.');
    process.exit(0);
  }

  let deleted = 0;
  let failed = 0;

  for (const { filePath } of matched) {
    try {
      await fsp.unlink(filePath);
      deleted++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  Failed to delete ${path.basename(filePath)}: ${msg}`);
      failed++;
    }
  }

  p.outro(
    `Deleted ${deleted} file(s)${failed > 0 ? `, ${failed} failed` : ''}.`,
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
