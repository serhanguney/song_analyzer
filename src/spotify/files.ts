import fs from 'node:fs/promises';
import path from 'node:path';
import { parseFile } from 'music-metadata';
import { AUDIO_EXTENSIONS } from '../common.ts';
import type { FileMetadata } from './types.ts';

export async function getAudioFiles(directory: string): Promise<string[]> {
  let audioFiles: string[] = [];

  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        const subDirFiles = await getAudioFiles(fullPath);
        audioFiles = audioFiles.concat(subDirFiles);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if ((AUDIO_EXTENSIONS as readonly string[]).includes(ext)) {
          audioFiles.push(fullPath);
        }
      }
    }

    return audioFiles;
  } catch {
    return [];
  }
}

export async function extractMetadata(filePath: string): Promise<FileMetadata | null> {
  try {
    const metadata = await parseFile(filePath);
    const common = metadata.common;

    const labelValue = common.label || common.publisher;
    const label = Array.isArray(labelValue) ? labelValue.join(', ') : (labelValue || null);

    return {
      title: common.title || null,
      artist: common.artist || common.albumartist || null,
      album: common.album || null,
      genre: Array.isArray(common.genre) ? common.genre.join(', ') : (common.genre || null),
      label,
      bpm: common.bpm || null,
      artwork: (common.picture && common.picture.length > 0) || null,
      releaseDate: common.date || common.originaldate || common.year?.toString() || null,
      fileName: path.basename(filePath),
    };
  } catch {
    return null;
  }
}
