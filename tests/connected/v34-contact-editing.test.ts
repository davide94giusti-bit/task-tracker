import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');

describe('v16.18.4 contact editing', () => {
  const app = read('apps/connected-web/src/App.tsx');
  const people = read('services-connected/people/index.ts');
  const data = read('services-connected/data/index.ts');

  it('opens an edit action with the complete current contact record', () => {
    expect(app).toContain('onClick={() => void startEdit(p)}>Edit</Button>');
    expect(app).toContain("api<Person>(`/people/details?personId=${encodeURIComponent(person.id)}`)");
    expect(app).toContain("editing ? 'Edit contact' : 'Add a person'");
    expect(app).toContain('label="Address (optional)"');
    expect(app).toContain('label="Website (optional)"');
    expect(app).toContain('label="Preferred contact method"');
  });

  it('saves an existing contact identity with optimistic concurrency', () => {
    expect(app).toContain('id: editing.id, expectedVersion: editing.version, tags: editing.tags || []');
    expect(app).toContain("editing ? 'Save changes' : 'Add person'");
    expect(people).toContain('expectedVersion: person.expectedVersion');
    expect(data).toContain("method==='PATCH'&&input.expectedVersion");
    expect(data).toContain("&version=eq.${encodeURIComponent(String(input.expectedVersion))}");
  });

  it('reports stale edits without overwriting newer contact data', () => {
    expect(people).toContain('if (person.id && person.expectedVersion && !saved.length)');
    expect(people).toContain('Contact changed on another device. Refresh before saving.');
    expect(app).toContain('{dialogError && <Alert severity="error" role="alert">{dialogError}</Alert>}');
  });

  it('documents contact editing and advances the connected release', () => {
    const manual = read('apps/connected-web/src/UserManualView.tsx');
    expect(manual).toContain('use Edit on the person card to update');
    expect(manual).toContain('does not change task assignments or project links');
    expect(read('packages/connected-contracts/release.ts')).toContain("'16.18.4'");
  });
});
