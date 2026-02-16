import path from 'node:path';
import readlineSync from 'readline-sync';
import { REQUIRED_FIELD_NAMES } from '../common.ts';
import { isValidReleaseDateFormat } from '../fetch-tags/scan.ts';
import { downloadArtwork } from './metadata.ts';
import type { FileMetadata } from './types.ts';

const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

export function selectFile(files: string[], baseDir: string): string | null {
  console.log(`${BOLD}Found ${files.length} audio file(s):${RESET}\n`);

  for (let i = 0; i < files.length; i++) {
    const relativePath = path.relative(baseDir, files[i]);
    console.log(`${i + 1}. ${relativePath}`);
  }

  console.log('');

  const fileIndex = readlineSync.questionInt(
    `${CYAN}Select a file number (1-${files.length}): ${RESET}`,
  ) - 1;

  if (fileIndex < 0 || fileIndex >= files.length) {
    console.log(`${YELLOW}Invalid selection${RESET}`);
    return null;
  }

  return files[fileIndex];
}

export function promptFields(currentMetadata: FileMetadata): FileMetadata {
  const updated = { ...currentMetadata };

  console.log(`${BOLD}Enter new values (press Enter to skip and keep current value):${RESET}\n`);

  // Title
  const newTitle = readlineSync.question(
    `${CYAN}Title${RESET} [${currentMetadata.title || 'empty'}]: `,
  );
  if (newTitle.trim()) updated.title = newTitle.trim();

  // Artist
  const newArtist = readlineSync.question(
    `${CYAN}Artist${RESET} [${currentMetadata.artist || 'empty'}]: `,
  );
  if (newArtist.trim()) updated.artist = newArtist.trim();

  // Album
  const newAlbum = readlineSync.question(
    `${CYAN}Album${RESET} [${currentMetadata.album || 'empty'}]: `,
  );
  if (newAlbum.trim()) updated.album = newAlbum.trim();

  // Release Date (with validation loop)
  let releaseDateValid = false;
  while (!releaseDateValid) {
    const newReleaseDate = readlineSync.question(
      `${CYAN}Release Date${RESET} [${currentMetadata.releaseDate || 'empty'}] (YYYY-MM-DD format required): `,
    );

    if (!newReleaseDate.trim()) {
      releaseDateValid = true;
      break;
    }

    const normalizedDate = newReleaseDate.trim().replace(/\//g, '-');

    if (isValidReleaseDateFormat(normalizedDate)) {
      updated.releaseDate = normalizedDate;
      releaseDateValid = true;
    } else {
      console.log(`${YELLOW}⚠️  Invalid format. Please enter date as YYYY-MM-DD (e.g., 2024-12-25)${RESET}`);
      console.log(`${YELLOW}   Or press Enter to skip and keep current value${RESET}`);
    }
  }

  // Label
  const newLabel = readlineSync.question(
    `${CYAN}Label${RESET} [${currentMetadata.label || 'empty'}]: `,
  );
  if (newLabel.trim()) updated.label = newLabel.trim();

  // Genre
  const newGenre = readlineSync.question(
    `${CYAN}Genre${RESET} [${currentMetadata.genre || 'empty'}]: `,
  );
  if (newGenre.trim()) updated.genre = newGenre.trim();

  return updated;
}

export async function promptArtwork(metadata: FileMetadata): Promise<FileMetadata> {
  const updated = { ...metadata };

  console.log('');
  const artworkUrl = readlineSync.question(
    `${CYAN}Artwork URL${RESET} [${metadata.artwork}] (enter URL or press Enter to skip): `,
  );

  if (artworkUrl.trim()) {
    try {
      console.log(`${YELLOW}Downloading artwork...${RESET}`);
      updated.artworkData = await downloadArtwork(artworkUrl.trim());
      updated.artwork = '[New artwork from URL]';
      console.log(`${GREEN}✓ Artwork downloaded successfully${RESET}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`${YELLOW}⚠️  ${message}${RESET}`);
      console.log(`${YELLOW}Keeping current artwork${RESET}`);
    }
  }

  return updated;
}

export function displayChangeSummary(
  currentMetadata: FileMetadata,
  newMetadata: FileMetadata,
): boolean {
  console.log(`\n${BOLD}${CYAN}=== Summary of Changes ===${RESET}\n`);

  let hasChanges = false;

  for (const field of REQUIRED_FIELD_NAMES) {
    if (field === 'artwork') {
      const oldValue = currentMetadata.artwork;
      const newValue = newMetadata.artwork;

      if (newMetadata.artworkData && oldValue !== newValue) {
        hasChanges = true;
        console.log(`  ${field}:`);
        console.log(`    Old: ${oldValue}`);
        console.log(`    New: ${GREEN}${newValue}${RESET}`);
      } else {
        console.log(`  ${field}: ${oldValue} (unchanged)`);
      }
      continue;
    }

    const oldValue = currentMetadata[field as keyof FileMetadata] || '(empty)';
    const newValue = newMetadata[field as keyof FileMetadata] || '(empty)';

    if (oldValue !== newValue) {
      hasChanges = true;
      console.log(`  ${field}:`);
      console.log(`    Old: ${oldValue}`);
      console.log(`    New: ${GREEN}${newValue}${RESET}`);
    } else {
      console.log(`  ${field}: ${oldValue} (unchanged)`);
    }
  }

  return hasChanges;
}

export function confirmApply(): boolean {
  console.log('');
  return readlineSync.keyInYNStrict(`${CYAN}Apply these changes?${RESET}`);
}
