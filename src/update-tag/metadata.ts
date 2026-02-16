import { parseFile } from 'music-metadata';
import path from 'node:path';
import axios from 'axios';
import { writeTags, isWritableFormat } from '../fetch-tags/write-tags.ts';
import type { FileMetadata, ArtworkData } from './types.ts';

export async function readMetadata(filePath: string): Promise<FileMetadata | null> {
  try {
    const metadata = await parseFile(filePath);
    const common = metadata.common;

    const picture = common.picture?.[0] ?? null;
    const artworkData: ArtworkData | null = picture
      ? {
          mime: picture.format,
          type: { id: 3, name: 'front cover' },
          description: 'Cover Art',
          imageBuffer: Buffer.from(picture.data),
        }
      : null;

    return {
      title: common.title || '',
      artist: common.artist || '',
      album: common.album || '',
      releaseDate: common.date || (common.year ? String(common.year) : ''),
      artwork: artworkData ? '[Has artwork]' : '[No artwork]',
      artworkData,
      label: common.label?.[0] || '',
      genre: common.genre?.[0] || '',
    };
  } catch {
    return null;
  }
}

export function buildId3Tags(metadata: FileMetadata): Record<string, unknown> {
  const tags: Record<string, unknown> = {
    title: metadata.title || undefined,
    artist: metadata.artist || undefined,
    album: metadata.album || undefined,
    publisher: metadata.label || undefined,
    genre: metadata.genre || undefined,
  };

  if (metadata.releaseDate) {
    const releaseDateStr = metadata.releaseDate.trim();
    const dateParts = releaseDateStr.split(/[-/]/);
    const year = dateParts[0];
    const month = dateParts[1] || '01';
    const formatted = `${year}/${month}`;

    tags.year = year;
    tags.date = releaseDateStr;
    tags.performerInfo = formatted;
    tags.releaseTime = releaseDateStr;
    tags.originalReleaseTime = releaseDateStr;
    tags.recordingTime = releaseDateStr;
  }

  if (metadata.artworkData) {
    tags.image = {
      mime: metadata.artworkData.mime,
      type: metadata.artworkData.type,
      description: metadata.artworkData.description,
      imageBuffer: metadata.artworkData.imageBuffer,
    };
  }

  // Remove undefined values
  for (const key of Object.keys(tags)) {
    if (tags[key] === undefined) {
      delete tags[key];
    }
  }

  return tags;
}

export async function downloadArtwork(url: string): Promise<ArtworkData> {
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 30000,
  });

  const contentType = response.headers['content-type'];

  if (!contentType || !String(contentType).startsWith('image/')) {
    throw new Error('URL does not point to an image');
  }

  return {
    mime: String(contentType),
    type: { id: 3, name: 'front cover' },
    description: 'Cover Art',
    imageBuffer: Buffer.from(response.data),
  };
}

export function writeFileMetadata(filePath: string, metadata: FileMetadata): boolean {
  if (!isWritableFormat(filePath)) {
    const ext = path.extname(filePath).toLowerCase();
    console.log(`\x1b[33m⚠️  Warning: ${ext} format is read-only. Cannot update metadata.\x1b[0m`);
    return false;
  }

  const tags = buildId3Tags(metadata);
  return writeTags(filePath, tags);
}
