import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';

const requiredEnvironment = [
  'CLOUDFLARE_API_TOKEN',
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'VITE_API_BASE_URL',
  'VITE_VAPID_PUBLIC_KEY',
  'VITE_APP_URL',
];
const missingEnvironment = requiredEnvironment.filter((name) => !process.env[name]?.trim());
if (missingEnvironment.length) {
  console.error(`Deployment stopped before build. Missing GitHub secrets: ${missingEnvironment.join(', ')}`);
  process.exit(1);
}

const run = (command, args) => spawnSync(command, args, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
const build = run('npm', ['run', 'build:connected']);
if (build.status) process.exit(build.status);

const services = readdirSync('services-connected', { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== '_shared')
  .map((entry) => entry.name);
for (const name of ['data', 'identity-access', 'tasks', 'people', 'dependencies-progress', 'notifications', 'reminders', 'backup-export', 'logging-diagnostics', 'api-gateway']) {
  if (!services.includes(name)) continue;
  const result = run('npx', ['wrangler', 'deploy', '--config', `cloudflare/${name}.wrangler.toml`]);
  if (result.status) process.exit(result.status);
}

const pages = run('npx', ['wrangler', 'pages', 'deploy', 'dist-connected', '--project-name', 'task-tracker']);
process.exit(pages.status || 0);
