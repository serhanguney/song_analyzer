import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAudioFiles } from '../spotify/index.ts';
import { readMetadata, writeFileMetadata } from './metadata.ts';
import {
  selectFile,
  promptFields,
  promptArtwork,
  displayChangeSummary,
  confirmApply,
} from './prompt.ts';

const BOLD = '\x1b[1m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const RESET = '\x1b[0m';

async function main() {
  console.log(`${BOLD}${CYAN}=== Manual ID3 Tag Updater ===${RESET}\n`);

  const preparationDir = process.env.PREPARATION_DIRECTORY;

  if (!preparationDir || !fs.existsSync(preparationDir)) {
    console.error(`${YELLOW}⚠️  Preparation directory not found: ${preparationDir}${RESET}`);
    console.log('Please set PREPARATION_DIRECTORY in your .env file');
    process.exit(1);
  }

  const audioFiles = await getAudioFiles(preparationDir);

  if (audioFiles.length === 0) {
    console.log(`${YELLOW}No audio files found in ${preparationDir}${RESET}`);
    return;
  }

  const selectedFile = await selectFile(audioFiles, preparationDir);
  if (!selectedFile) return;

  const fileName = path.basename(selectedFile);
  console.log(`\n${BOLD}Selected: ${fileName}${RESET}\n`);

  const currentMetadata = await readMetadata(selectedFile);
  if (!currentMetadata) {
    console.log(`${YELLOW}Could not read metadata from file${RESET}`);
    return;
  }

  // Show current values
  console.log(`${BOLD}Current metadata:${RESET}`);
  console.log(`  title: ${currentMetadata.title || '(empty)'}`);
  console.log(`  artist: ${currentMetadata.artist || '(empty)'}`);
  console.log(`  album: ${currentMetadata.album || '(empty)'}`);
  console.log(`  releaseDate: ${currentMetadata.releaseDate || '(empty)'}`);
  console.log(`  artwork: ${currentMetadata.artwork}`);
  console.log(`  label: ${currentMetadata.label || '(empty)'}`);
  console.log(`  genre: ${currentMetadata.genre || '(empty)'}`);
  console.log('');

  // Prompt for new values
  let updatedMetadata = await promptFields(currentMetadata);
  updatedMetadata = await promptArtwork(updatedMetadata);

  console.log('');

  // Show diff
  const hasChanges = displayChangeSummary(currentMetadata, updatedMetadata);

  if (!hasChanges) {
    console.log(`\n${YELLOW}No changes made. Exiting.${RESET}`);
    return;
  }

  if (!(await confirmApply())) {
    console.log(`${YELLOW}Update cancelled.${RESET}`);
    return;
  }

  const success = writeFileMetadata(selectedFile, updatedMetadata);

  if (success) {
    console.log(`\n${GREEN}✅ Metadata updated successfully!${RESET}`);
  } else {
    console.log(`\n${YELLOW}⚠️  Could not update metadata${RESET}`);
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  main().catch(error => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${message}`);
    process.exit(1);
  });
}
