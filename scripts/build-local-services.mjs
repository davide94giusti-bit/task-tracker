import { build } from 'esbuild';
import { access, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const servicesDirectory = path.join(root, 'services');
const directories = await readdir(servicesDirectory, { withFileTypes: true });
const entries = [];

for (const directory of directories) {
  if (!directory.isDirectory()) continue;
  const entry = path.join(servicesDirectory, directory.name, 'index.ts');
  try {
    await access(entry);
    entries.push(entry);
  } catch {
    // Shared folders and non-service directories intentionally have no entrypoint.
  }
}

if (!entries.length) throw new Error('No Local service entrypoints were found.');

await build({
  entryPoints: entries,
  outdir: path.join(root, 'dist-services'),
  outbase: servicesDirectory,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outExtension: { '.js': '.cjs' },
});

console.log(`Built ${entries.length} Local services.`);
