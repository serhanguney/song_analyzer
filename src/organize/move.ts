import fs from 'node:fs/promises';
import path from 'node:path';
import type { ReleaseDate, MoveResult } from './types.ts';

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveConflict(targetPath: string): Promise<string> {
  if (!(await fileExists(targetPath))) return targetPath;

  const ext = path.extname(targetPath);
  const base = path.basename(targetPath, ext);
  const dir = path.dirname(targetPath);

  for (let i = 1; i <= 999; i++) {
    const candidate = path.join(dir, `${base}_${i}${ext}`);
    if (!(await fileExists(candidate))) return candidate;
  }

  // Extremely unlikely, but bounded
  throw new Error(`Too many filename conflicts for ${targetPath}`);
}

export async function moveToInvalidDir(
  filePath: string,
  sourceDir: string,
): Promise<MoveResult> {
  const invalidDir = path.join(sourceDir, '[invalid]');

  // Already in [invalid]?
  if (path.dirname(filePath) === invalidDir) {
    return { success: true, skipped: true };
  }

  await fs.mkdir(invalidDir, { recursive: true });

  const targetPath = path.join(invalidDir, path.basename(filePath));
  const finalPath = await resolveConflict(targetPath);

  await fs.rename(filePath, finalPath);
  return { success: true };
}

export async function moveByReleaseDate(
  filePath: string,
  releaseDate: ReleaseDate,
  targetDir: string,
): Promise<MoveResult> {
  const monthFolder = path.join(targetDir, releaseDate.year, releaseDate.month);
  const targetPath = path.join(monthFolder, path.basename(filePath));

  // Already in correct location?
  if (filePath === targetPath) {
    return { success: true, skipped: true };
  }

  await fs.mkdir(monthFolder, { recursive: true });

  // Don't overwrite existing files
  if (await fileExists(targetPath)) {
    return { success: false, reason: 'File already exists at destination' };
  }

  await fs.rename(filePath, targetPath);
  return { success: true };
}
