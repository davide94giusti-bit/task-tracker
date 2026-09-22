import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const enhancements = readFileSync('apps/connected-web/src/ConnectedEnhancements.tsx', 'utf8');

describe('v16.18.3 checklist list controls', () => {
  it('labels the checklist completion control and keeps an accessible item-specific name', () => {
    expect(enhancements).toContain("label={item.completed ? 'Completed' : 'Complete'}");
    expect(enhancements).toContain("'Complete'} checklist item ${item.description}");
    expect(enhancements).toContain('FormControlLabel');
  });

  it('provides project and text filters', () => {
    expect(enhancements).toContain('label="Project"');
    expect(enhancements).toContain('<MenuItem value="">All projects</MenuItem>');
    expect(enhancements).toContain('label="Search text"');
    expect(enhancements).toContain("...(projectId ? { projectId } : {})");
  });

  it('loads project choices through the existing workspace-isolated project route', () => {
    expect(enhancements).toContain("api<Project[]>('/projects').then(setProjects)");
  });
});
