import path from 'node:path';
import NodeID3 from 'node-id3';

export function isValidReleaseDateFormat(dateString: string | null): boolean {
  if (!dateString) return false;

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateString)) return false;

  const [year, month, day] = dateString.split('-');
  const yearNum = parseInt(year);
  const monthNum = parseInt(month);
  const dayNum = parseInt(day);

  if (yearNum < 1900 || yearNum > new Date().getFullYear() + 1) return false;
  if (monthNum < 1 || monthNum > 12) return false;
  if (dayNum < 1 || dayNum > 31) return false;

  return !isNaN(new Date(dateString).getTime());
}

export function writeTags(filePath: string, tags: Record<string, unknown>): boolean {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.mp3' || ext === '.wav' || ext === '.aiff' || ext === '.aif') {
    return NodeID3.update(tags, filePath) === true;
  }

  return false;
}

export function isWritableFormat(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ['.mp3', '.wav', '.aiff', '.aif'].includes(ext);
}
