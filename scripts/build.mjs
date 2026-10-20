import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'index.html');
const outputDirectory = path.join(root, 'dist');
const output = path.join(outputDirectory, 'index.html');

if (!fs.statSync(source).isFile()) {
  throw new Error('index.html must be a regular file');
}

if (fs.existsSync(outputDirectory)) {
  const directory = fs.lstatSync(outputDirectory);
  if (!directory.isDirectory()) {
    throw new Error('dist must be a directory');
  }

  const entries = fs.readdirSync(outputDirectory, { withFileTypes: true });
  const unexpected = entries.filter(entry => entry.name !== 'index.html');
  if (unexpected.length > 0) {
    throw new Error(`dist contains unexpected entries: ${unexpected.map(entry => entry.name).join(', ')}`);
  }
  if (entries.some(entry => entry.name === 'index.html' && !entry.isFile())) {
    throw new Error('dist/index.html must be a regular file');
  }
} else {
  fs.mkdirSync(outputDirectory);
}

fs.copyFileSync(source, output);
console.log('Packaged dist/index.html');
