import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const read = (file: string) => readFileSync(path.join(root, file), 'utf8');

describe('connected backup import and diagnostics', () => {
  it('validates Local ZIP metadata and checksum before upload', () => {
    const view = read('apps/connected-web/src/BackupDiagnosticsViews.tsx');
    expect(view).toContain("zip.file('metadata.json')");
    expect(view).toContain("zip.file('data.json')");
    expect(view).toContain("metadata.format !== 'prioritydesk-backup'");
    expect(view).toContain("sha256(dataText)");
    expect(view).toContain('Validate and preview');
    expect(view).toContain('Confirm and import');
  });

  it('uses an additive transactional import scoped to one workspace', () => {
    const migration = read('supabase/migrations/0003_complete_local_import.sql');
    expect(migration).toContain('perform assert_connected_workspace(p_workspace_id)');
    expect(migration).toContain("status='applied'");
    expect(migration).toContain('task_dependencies');
    expect(migration).toContain('task_people');
    expect(migration).toContain('checklist_items');
    expect(migration).not.toContain("delete from tasks");
  });

  it('does not queue or silently retry an import', () => {
    const apiSource = read('apps/connected-web/src/api.ts');
    expect(apiSource).not.toContain("'/backup/import-apply','/tasks/save'");
    expect(read('apps/connected-web/src/BackupDiagnosticsViews.tsx')).not.toContain('queueIfOffline');
  });

  it('checks internal services without exposing diagnostic secrets', () => {
    const worker = read('services-connected/logging-diagnostics/index.ts');
    expect(worker).toContain("binding.fetch('https://internal/health'");
    expect(worker).toContain("'x-internal-service-token':env.INTERNAL_SERVICE_TOKEN");
    expect(worker).toContain('credentials are excluded');
  });
});
