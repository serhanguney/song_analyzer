import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import * as p from '@clack/prompts';
import { AUDIO_EXTENSIONS } from './common.ts';

function scanDirectory(dir: string, query: string): string[] {
  const results: string[] = [];
  const lower = query.toLowerCase();

  function walk(current: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (
        (AUDIO_EXTENSIONS as readonly string[]).includes(path.extname(entry.name).toLowerCase()) &&
        entry.name.toLowerCase().includes(lower)
      ) {
        results.push(fullPath);
      }
    }
  }

  walk(dir);
  return results;
}

async function main() {
  p.intro('Find in Playlist Directory');

  const playlistDir = process.env.PLAYLIST_DIRECTORY;
  if (!playlistDir || !fs.existsSync(playlistDir)) {
    p.cancel(`PLAYLIST_DIRECTORY not found: ${playlistDir ?? '(not set)'}`);
    process.exit(1);
  }

  const query = await p.text({ message: 'Search for:' });
  if (p.isCancel(query) || !query) {
    p.cancel('Cancelled.');
    process.exit(0);
  }

  const spinner = p.spinner();
  spinner.start('Scanning…');
  const matches = scanDirectory(playlistDir, query);
  spinner.stop(`Found ${matches.length} file(s)`);

  if (matches.length === 0) {
    p.outro('No matching files found.');
    return;
  }

  const selected = await p.select({
    message: 'Select a file:',
    options: matches.map(f => ({
      label: path.relative(playlistDir, f),
      value: f,
    })),
  });
  if (p.isCancel(selected)) {
    p.cancel('Cancelled.');
    process.exit(0);
  }

  const action = await p.select({
    message: 'What would you like to do?',
    options: [
      { label: 'Open enclosing folder', value: 'open' },
      { label: 'Copy file', value: 'copy' },
    ],
  });
  if (p.isCancel(action)) {
    p.cancel('Cancelled.');
    process.exit(0);
  }

  if (action === 'open') {
    execSync(`open -R "${selected}"`);
    p.outro('Opened in Finder.');
  } else {
    execSync(`osascript -e 'set the clipboard to (POSIX file "${selected}")'`);
    p.outro('File copied to clipboard.');
  }
}

main().catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exit(1);
});
