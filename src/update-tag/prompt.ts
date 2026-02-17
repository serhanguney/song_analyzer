import path from 'node:path';
import { REQUIRED_FIELD_NAMES } from '../common.ts';
import { isValidReleaseDateFormat } from '../fetch-tags/scan.ts';
import { downloadArtwork } from './metadata.ts';
import { confirm, textInput, select } from '../ui/prompts.ts';
import type { FileMetadata } from './types.ts';

const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

export async function selectFile(files: string[], baseDir: string): Promise<string | null> {
  console.log(`${BOLD}Found ${files.length} audio file(s):${RESET}\n`);

  const options = files.map(file => ({
    label: path.relative(baseDir, file),
    value: file,
  }));

  const selected = await select('Select a file:', options);
  return selected;
}

export async function promptFields(currentMetadata: FileMetadata): Promise<FileMetadata> {
  const updated = { ...currentMetadata };

  console.log(`${BOLD}Enter new values (press Enter to skip and keep current value):${RESET}\n`);

  // Title
  const newTitle = await textInput(`Title [${currentMetadata.title || 'empty'}]`);
  if (newTitle.trim()) updated.title = newTitle.trim();

  // Artist
  const newArtist = await textInput(`Artist [${currentMetadata.artist || 'empty'}]`);
  if (newArtist.trim()) updated.artist = newArtist.trim();

  // Album
  const newAlbum = await textInput(`Album [${currentMetadata.album || 'empty'}]`);
  if (newAlbum.trim()) updated.album = newAlbum.trim();

  // Release Date (with validation)
  const newReleaseDate = await textInput(
    `Release Date [${currentMetadata.releaseDate || 'empty'}] (YYYY-MM-DD)`,
    {
      validate(value) {
        if (!value || !value.trim()) return;
        const normalized = value.trim().replace(/\//g, '-');
        if (!isValidReleaseDateFormat(normalized)) {
          return 'Invalid format. Please enter date as YYYY-MM-DD (e.g., 2024-12-25)';
        }
      },
    },
  );
  if (newReleaseDate.trim()) {
    updated.releaseDate = newReleaseDate.trim().replace(/\//g, '-');
  }

  // Label
  const newLabel = await textInput(`Label [${currentMetadata.label || 'empty'}]`);
  if (newLabel.trim()) updated.label = newLabel.trim();

  // Genre
  const newGenre = await textInput(`Genre [${currentMetadata.genre || 'empty'}]`);
  if (newGenre.trim()) updated.genre = newGenre.trim();

  return updated;
}

export async function promptArtwork(metadata: FileMetadata): Promise<FileMetadata> {
  const updated = { ...metadata };

  console.log('');
  const artworkUrl = await textInput(
    `Artwork URL [${metadata.artwork}] (enter URL or press Enter to skip)`,
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

export async function confirmApply(): Promise<boolean> {
  console.log('');
  return confirm('Apply these changes?');
}
