import { z } from 'zod';

export const ArtworkDataSchema = z.object({
  mime: z.string(),
  type: z.object({ id: z.number(), name: z.string() }),
  description: z.string(),
  imageBuffer: z.instanceof(Buffer),
});

export type ArtworkData = z.infer<typeof ArtworkDataSchema>;

export interface FileMetadata {
  title: string;
  artist: string;
  album: string;
  releaseDate: string;
  artwork: string;
  artworkData: ArtworkData | null;
  label: string;
  genre: string;
}
