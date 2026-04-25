import 'dotenv/config';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import * as p from '@clack/prompts';
import { AUDIO_EXTENSIONS } from './common.ts';

const DRY_RUN = process.argv.includes('--dry-run');

async function resolveConflict(targetPath: string): Promise<string> {
  try {
    await fsp.access(targetPath);
  } catch {
    return targetPath;
  }

  const ext = path.extname(targetPath);
  const base = path.basename(targetPath, ext);
  const dir = path.dirname(targetPath);

  for (let i = 1; i <= 999; i++) {
    const candidate = path.join(dir, `${base}_${i}${ext}`);
    try {
      await fsp.access(candidate);
    } catch {
      return candidate;
    }
  }

  throw new Error(`Too many filename conflicts for ${targetPath}`);
}

function collectNestedAudioFiles(targetDir: string): string[] {
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
        path.dirname(full) !== targetDir &&
        (AUDIO_EXTENSIONS as readonly string[]).includes(path.extname(entry.name).toLowerCase())
      ) {
        results.push(full);
      }
    }
  }

  walk(targetDir);
  return results;
}

async function main() {
  p.intro('Flatten Target Directory');

  const targetDir = process.env.TARGET_DIRECTORY;
  if (!targetDir || !fs.existsSync(targetDir)) {
    p.cancel(`TARGET_DIRECTORY not found: ${targetDir ?? '(not set)'}`);
    process.exit(1);
  }

  const spinner = p.spinner();
  spinner.start('Scanning for nested audio files…');
  const files = collectNestedAudioFiles(targetDir);
  spinner.stop(`Found ${files.length} nested audio file(s)`);

  if (files.length === 0) {
    p.outro('Nothing to move.');
    return;
  }

  console.log('');
  for (const f of files) {
    console.log(`  ${path.relative(targetDir, f)}`);
  }
  console.log('');

  if (DRY_RUN) {
    p.outro(`Dry run — ${files.length} file(s) would be moved to ${targetDir}`);
    return;
  }

  const confirmed = await p.confirm({
    message: `Move ${files.length} file(s) to the root of TARGET_DIRECTORY?`,
    initialValue: false,
  });

  if (p.isCancel(confirmed) || !confirmed) {
    p.cancel('Aborted.');
    process.exit(0);
  }

  let moved = 0;
  let failed = 0;

  for (const filePath of files) {
    const dest = await resolveConflict(path.join(targetDir, path.basename(filePath)));
    try {
      await fsp.rename(filePath, dest);
      moved++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  Failed: ${path.basename(filePath)}: ${msg}`);
      failed++;
    }
  }

  p.outro(`Moved ${moved} file(s)${failed > 0 ? `, ${failed} failed` : ''}.`);
}

main().catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exit(1);
});
