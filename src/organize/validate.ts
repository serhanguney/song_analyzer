import path from 'node:path';
import { getAudioFiles, extractMetadata } from '../spotify.js';
import { REQUIRED_FIELD_NAMES } from '../common.js';
import { isValidReleaseDateFormat } from '../fetch-tags/scan.ts';
import type { ReleaseDate, ValidatedFile, InvalidFile, ValidationResults } from './types.ts';

export function parseOrganizeDate(dateString: string | null): ReleaseDate | null {
  if (!dateString || !isValidReleaseDateFormat(dateString)) return null;

  const [year, month] = dateString.split('-');
  return {
    year,
    month,
    fullDate: dateString,
    formatted: `${year}/${month}`,
  };
}

export function validateFile(
  metadata: Record<string, unknown>,
): { isValid: boolean; missingFields: string[]; releaseDate: ReleaseDate | null; reason: string | null } {
  const missingFields: string[] = [];

  for (const fieldName of REQUIRED_FIELD_NAMES) {
    if (fieldName === 'releaseDate') continue; // handled separately below
    if (!metadata[fieldName]) {
      missingFields.push(fieldName);
    }
  }

  const rawDate = metadata.releaseDate;
  const releaseDate = parseOrganizeDate(typeof rawDate === 'string' ? rawDate : null);

  if (!releaseDate) {
    missingFields.push('releaseDate');
  }

  if (missingFields.length === 0) {
    return { isValid: true, missingFields: [], releaseDate, reason: null };
  }

  // Build reason string
  const reasons: string[] = [];

  if (!releaseDate) {
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

  return {
    isValid: false,
    missingFields,
    releaseDate,
    reason: reasons.join(', '),
  };
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

    if (result.isValid && result.releaseDate) {
      valid.push({ filePath, relativePath, metadata, releaseDate: result.releaseDate });
    } else {
      invalid.push({ filePath, relativePath, reason: result.reason ?? 'Unknown validation error', metadata });
    }
  }

  return { valid, invalid };
}
