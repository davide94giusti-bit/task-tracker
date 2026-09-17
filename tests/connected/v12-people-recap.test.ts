import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const read = (filePath: string) => readFileSync(path.join(root, filePath), 'utf8');

describe('v12 people recap and contact export', () => {
  it('prepares recaps only for available channels and exports contacts', () => {
    const app = read('apps/connected-web/src/App.tsx');
    expect(app).toContain('<DialogTitle>Recap</DialogTitle>');
    expect(app).toContain('>WhatsApp</Button>');
    expect(app).toContain('>Email</Button>');
    expect(app).toContain('disabled={!whatsappPhone || !recap || tasks.length === 0}');
    expect(app).toContain('disabled={!details?.email || !recap || tasks.length === 0}');
    expect(app).toContain('https://wa.me/');
    expect(app).toContain('mailto:');
    expect(app).toContain('BEGIN:VCARD');
    expect(app).toContain('Add to contacts');
  });
});
