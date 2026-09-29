import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { showsShader } from './background';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

describe('the shader background', () => {
  it('runs behind the main site, never behind the console', () => {
    expect(showsShader(null)).toBe(true);
    expect(showsShader('pricing')).toBe(true);
    expect(showsShader('console')).toBe(false);
  });

  it('is mounted only through SiteBackground: the root layout gates it, the console layout never mounts it', () => {
    const root = read('../../app/layout.tsx');
    expect(root).toContain('<SiteBackground />');
    expect(root).not.toContain('ShaderBackground');
    for (const layout of ['../../app/console/layout.tsx', '../../app/console/(org)/layout.tsx', '../../app/console/admin/layout.tsx']) {
      expect(read(layout)).not.toMatch(/ShaderBackground|SiteBackground/);
    }
  });
});
