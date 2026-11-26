import { createHash } from 'node:crypto';

export function extensionIdFor(directory) {
  const digest = createHash('sha256').update(directory, 'utf8').digest('hex').slice(0, 32);
  return [...digest].map((char) => String.fromCharCode(97 + Number.parseInt(char, 16))).join('');
}
