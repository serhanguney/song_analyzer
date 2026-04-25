import 'dotenv/config';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as p from '@clack/prompts';
import { AUDIO_EXTENSIONS } from './common.ts';

const HOTLIST_PATH =
  '/Users/serhanguney/Library/Mobile Documents/com~apple~CloudDocs/Musical/[archive]/hotlist.txt';

const DRY_RUN = process.argv.includes('--dry-run');

function parseTitlesFromUtf16Tsv(filePath: string): string[] {
  const raw = fs.readFileSync(filePath);
  const content = raw.toString('utf16le').replace(/^\uFEFF/, '');
  const lines = content.split('\n').map(l => l.replace(/\r$/, ''));
  const dataLines = lines.filter(l => l.trim().length > 0).slice(1);
  return dataLines
    .map(line => line.split('\t')[1]?.replace(/\s+/g, ' ').trim() ?? '')
    .filter(Boolean);
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
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
      } else if (
        (AUDIO_EXTENSIONS as readonly string[]).includes(
          path.extname(entry.name).toLowerCase(),
        )
      ) {
        results.push(full);
      }
    }
  }
  walk(dir);
  return results;
}

function findMatchingFile(title: string, audioFiles: string[]): string | undefined {
  const needle = normalize(title);
  return audioFiles.find(f =>
    normalize(path.basename(f, path.extname(f))).includes(needle),
  );
}

async function main() {
  p.intro('Copy Hotlist to Reference Directory');

  const playlistDir = process.env.PLAYLIST_DIRECTORY;
  const referenceDir = process.env.REFERENCE_DIRECTORY;

  if (!playlistDir || !fs.existsSync(playlistDir)) {
    p.cancel(`PLAYLIST_DIRECTORY not found: ${playlistDir ?? '(not set)'}`);
    process.exit(1);
  }
  if (!referenceDir) {
    p.cancel('REFERENCE_DIRECTORY is not set in .env');
    process.exit(1);
  }

  const spinner = p.spinner();

  spinner.start('Parsing hotlist.txt…');
  const titles = parseTitlesFromUtf16Tsv(HOTLIST_PATH);
  spinner.stop(`Parsed ${titles.length} track title(s)`);

  spinner.start('Scanning playlist directory…');
  const audioFiles = collectAudioFiles(playlistDir);
  spinner.stop(`Found ${audioFiles.length} audio file(s) in playlist directory`);

  type Match = { title: string; src: string };
  const matched: Match[] = [];
  const unmatched: string[] = [];

  for (const title of titles) {
    const found = findMatchingFile(title, audioFiles);
    if (found) {
      matched.push({ title, src: found });
    } else {
      unmatched.push(title);
    }
  }

  if (matched.length === 0) {
    p.outro('No matching files found. Nothing to copy.');
    return;
  }

  console.log('\nFiles to copy:');
  for (const { src, title } of matched) {
    const dest = path.join(referenceDir, path.basename(src));
    const exists = fs.existsSync(dest);
    console.log(
      `  ${exists ? '↺' : '+'} ${path.basename(src)}  (matched: "${title}")${exists ? '  [will replace]' : ''}`,
    );
  }

  if (unmatched.length > 0) {
    console.log('\nTitles with no match (will be skipped):');
    for (const t of unmatched) {
      console.log(`  ✗  ${t}`);
    }
  }

  console.log('');

  if (DRY_RUN) {
    p.outro(`Dry run — ${matched.length} file(s) would be copied to ${referenceDir}`);
    return;
  }

  const confirmed = await p.confirm({
    message: `Copy ${matched.length} file(s) to ${referenceDir}?`,
    initialValue: false,
  });

  if (p.isCancel(confirmed) || !confirmed) {
    p.cancel('Aborted.');
    process.exit(0);
  }

  await fsp.mkdir(referenceDir, { recursive: true });

  let copied = 0;
  let failed = 0;

  for (const { src } of matched) {
    const dest = path.join(referenceDir, path.basename(src));
    try {
      await fsp.copyFile(src, dest);
      copied++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  Failed: ${path.basename(src)}: ${msg}`);
      failed++;
    }
  }

  p.outro(`Copied ${copied} file(s)${failed > 0 ? `, ${failed} failed` : ''}.`);
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
