import { z } from 'zod';
import type { FileMetadata } from '../spotify/types.ts';

export const ReleaseDateSchema = z.object({
  year: z.string(),
  month: z.string(),
  fullDate: z.string(),
  formatted: z.string(),
});

export type ReleaseDate = z.infer<typeof ReleaseDateSchema>;

export interface ValidatedFile {
  filePath: string;
  relativePath: string;
  metadata: FileMetadata;
  releaseDate: ReleaseDate;
}

export interface InvalidFile {
  filePath: string;
  relativePath: string;
  reason: string;
  metadata: FileMetadata | null;
}

export interface ValidationResults {
  valid: ValidatedFile[];
  invalid: InvalidFile[];
}

export interface MoveResult {
  success: boolean;
  skipped?: boolean;
  reason?: string;
}
