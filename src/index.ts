import { select } from './ui/prompts.ts';
import { execSync } from 'node:child_process';

const scripts = [
  { label: 'Update tag           Manually edit metadata tags for a file', value: 'update-tag' },
  { label: 'Update genre         Set genre tag from rekordbox playlist txt files', value: 'update-genre' },
  { label: 'Find references      Find audio samples referenced across directories', value: 'find-references' },
  { label: 'Add to playlist      Match local files to Spotify and add to a playlist', value: 'add-to-playlist' },
  { label: 'Find in playlist     Search for a file in PLAYLIST_DIRECTORY', value: 'find-in-playlist' },
  { label: 'Delete from playlist Delete files listed in to_delete.txt from PLAYLIST_DIRECTORY', value: 'delete-from-playlist' },
  { label: 'Copy hotlist         Copy hotlist.txt tracks from PLAYLIST_DIRECTORY to REFERENCE_DIRECTORY', value: 'copy-hotlist' },
  { label: 'Auth                 Authorize your Spotify account', value: 'auth' },
];

const chosen = await select('What do you want to do?', scripts);
execSync(`npm run ${chosen} --`, { stdio: 'inherit' });
