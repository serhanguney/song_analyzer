import { select } from './ui/prompts.ts';
import { execSync } from 'node:child_process';

const scripts = [
  { label: 'Fetch tags        Fetch metadata from Spotify for audio files', value: 'fetch-tags' },
  { label: 'Organize          Move files into YEAR/MONTH folders by release date', value: 'organize' },
  { label: 'Update tag        Manually edit metadata tags for a file', value: 'update-tag' },
  { label: 'Find references   Find audio samples referenced across directories', value: 'find-references' },
  { label: 'Add to playlist   Match local files to Spotify and add to a playlist', value: 'add-to-playlist' },
  { label: 'Auth              Authorize your Spotify account', value: 'auth' },
];

const chosen = await select('What do you want to do?', scripts);
execSync(`npm run ${chosen} --`, { stdio: 'inherit' });
