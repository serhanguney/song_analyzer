import path from 'node:path';
import { getAudioFiles, extractMetadata } from '../spotify.js';
import { REQUIRED_FIELD_NAMES } from '../common.js';
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

export function getMissingRequiredFields(
  metadata: Record<string, unknown>,
): string[] {
  const missing: string[] = [];

  for (const fieldName of REQUIRED_FIELD_NAMES) {
    if (fieldName === 'releaseDate') {
      if (!metadata[fieldName] || !isValidReleaseDateFormat(metadata[fieldName] as string)) {
        missing.push(fieldName);
      }
    } else if (!metadata[fieldName]) {
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
