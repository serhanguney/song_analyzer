import path from 'node:path';
import { getAudioFiles, extractMetadata } from '../spotify/index.ts';
import { REQUIRED_FIELD_NAMES } from '../common.ts';
import { isValidReleaseDateFormat } from '../fetch-tags/scan.ts';
import type { FileMetadata } from '../spotify/types.ts';
import type { ValidatedFile, InvalidFile, ValidationResults } from './types.ts';

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

export function validateFile(
  metadata: FileMetadata,
): { isValid: boolean; missingFields: string[]; reason: string | null } {
  const missingFields: string[] = [];

  for (const fieldName of REQUIRED_FIELD_NAMES) {
    if (fieldName === 'releaseDate') {
      const rawDate = metadata.releaseDate;
      if (!rawDate || typeof rawDate !== 'string' || !isValidReleaseDateFormat(rawDate)) {
        missingFields.push('releaseDate');
      }
      continue;
    }
    if (!getFieldValue(metadata, fieldName)) {
      missingFields.push(fieldName);
    }
  }

  if (missingFields.length === 0) {
    return { isValid: true, missingFields: [], reason: null };
  }

  const reasons: string[] = [];

  if (missingFields.includes('releaseDate')) {
    const rawDate = metadata.releaseDate;
    if (rawDate && typeof rawDate === 'string') {
      reasons.push(`Invalid release date format: "${rawDate}" (must be YYYY-MM-DD)`);
    } else {
      reasons.push('Missing release date (must be YYYY-MM-DD format)');
    }
  }

  const otherMissing = missingFields.filter(f => f !== 'releaseDate');
  if (otherMissing.length > 0) {
    reasons.push(`Missing fields: ${otherMissing.join(', ')}`);
  }

  return { isValid: false, missingFields, reason: reasons.join(', ') };
}

export async function scanAndValidate(directory: string): Promise<ValidationResults> {
  const audioFiles = await getAudioFiles(directory);
  const valid: ValidatedFile[] = [];
  const invalid: InvalidFile[] = [];

  for (const filePath of audioFiles) {
    const relativePath = path.relative(directory, filePath);
    const metadata = await extractMetadata(filePath);

    if (!metadata) {
      invalid.push({ filePath, relativePath, reason: 'Failed to read metadata', metadata: null });
      continue;
    }

    const result = validateFile(metadata);

    if (result.isValid) {
      valid.push({ filePath, relativePath, metadata });
    } else {
      invalid.push({ filePath, relativePath, reason: result.reason ?? 'Unknown validation error', metadata });
    }
  }

  return { valid, invalid };
}
