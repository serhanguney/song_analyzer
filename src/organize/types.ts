import type { FileMetadata } from '../spotify/types.ts';

export interface ValidatedFile {
  filePath: string;
  relativePath: string;
  metadata: FileMetadata;
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
