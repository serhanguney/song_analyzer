import fs from 'node:fs/promises';
import path from 'node:path';

export async function cleanupEmptyDirectories(
  directory: string,
  rootDirs: string[],
  skipNames: string[] = [],
): Promise<void> {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (skipNames.includes(entry.name)) continue;

      await cleanupEmptyDirectories(
        path.join(directory, entry.name),
        rootDirs,
        skipNames,
      );
    }

    // Don't remove root directories
    if (rootDirs.includes(directory)) return;

    const remaining = await fs.readdir(directory);
    if (remaining.length === 0) {
      await fs.rmdir(directory);
    }
  } catch {
    // Ignore cleanup errors
  }
}
