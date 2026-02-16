import path from 'node:path';
import { getAudioFiles, extractMetadata } from '../spotify/index.ts';
import { REQUIRED_FIELD_NAMES } from '../common.ts';
import type { FileMetadata } from '../spotify/types.ts';
import type { ScannedFile } from './types.ts';

export function isValidReleaseDateFormat(dateString: string | null): boolean {
  if (!dateString) return false;

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateString)) return false;

  const [year, month, day] = dateString.split('-');
  const yearNum = parseInt(year);
  const monthNum = parseInt(month);
  const dayNum = parseInt(day);

  if (yearNum < 1900 || yearNum > new Date().getFullYear() + 1) return false;
  if (monthNum < 1 || monthNum > 12) return false;
  if (dayNum < 1 || dayNum > 31) return false;

  return !isNaN(new Date(dateString).getTime());
}

function getFieldValue(metadata: FileMetadata, field: string): unknown {
  const lookup: Record<string, unknown> = {
    title: metadata.title,
    artist: metadata.artist,
    album: metadata.album,
    releaseDate: metadata.releaseDate,
    artwork: metadata.artwork,
    label: metadata.label,
    genre: metadata.genre,
  };
  return lookup[field];
}

export function getMissingRequiredFields(
  metadata: FileMetadata,
): string[] {
  const missing: string[] = [];

  for (const fieldName of REQUIRED_FIELD_NAMES) {
    const value = getFieldValue(metadata, fieldName);

    if (fieldName === 'releaseDate') {
      if (!value || typeof value !== 'string' || !isValidReleaseDateFormat(value)) {
        missing.push(fieldName);
      }
    } else if (!value) {
      missing.push(fieldName);
    }
  }

  return missing;
}

export async function scanDirectory(directory: string): Promise<ScannedFile[]> {
  const audioFiles: string[] = await getAudioFiles(directory);
  const results: ScannedFile[] = [];

  for (const filePath of audioFiles) {
    const metadata = await extractMetadata(filePath);

    if (!metadata) {
      results.push({
        filePath,
        relativePath: path.relative(directory, filePath),
        metadata: {
          title: null, artist: null, album: null, genre: null,
          label: null, bpm: null, artwork: null, releaseDate: null,
          fileName: path.basename(filePath),
        },
        missingFields: [...REQUIRED_FIELD_NAMES],
      });
      continue;
    }

    const missingFields = getMissingRequiredFields(metadata);

    results.push({
      filePath,
      relativePath: path.relative(directory, filePath),
      metadata,
      missingFields,
    });
  }

  return results;
}
