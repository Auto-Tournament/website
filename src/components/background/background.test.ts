import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isScrolledPastBackground, shouldDrawFrame, showsShader, wantsStaticFrame } from './background';

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

describe('shouldDrawFrame', () => {
  it('skips a draw until 33ms have passed, keeping the clock continuous', () => {
    expect(shouldDrawFrame(1, 0.99)).toBe(false);
    expect(shouldDrawFrame(1, 0.96)).toBe(true);
    expect(shouldDrawFrame(1, 1)).toBe(false);
  });

  it('allows the very first frame', () => {
    expect(shouldDrawFrame(0, -Infinity)).toBe(true);
  });
});

describe('wantsStaticFrame', () => {
  it('is false on a capable, wired desktop', () => {
    expect(wantsStaticFrame({ coarsePointer: false, hardwareConcurrency: 8, deviceMemory: 8 })).toBe(false);
  });

  it('is true for a coarse pointer (phones/tablets)', () => {
    expect(wantsStaticFrame({ coarsePointer: true })).toBe(true);
  });

  it('is true at 4 cores or fewer, false above', () => {
    expect(wantsStaticFrame({ coarsePointer: false, hardwareConcurrency: 4 })).toBe(true);
    expect(wantsStaticFrame({ coarsePointer: false, hardwareConcurrency: 5 })).toBe(false);
  });

  it('is true at 4GB of memory or less, false above, and ignores it when undefined', () => {
    expect(wantsStaticFrame({ coarsePointer: false, deviceMemory: 4 })).toBe(true);
    expect(wantsStaticFrame({ coarsePointer: false, deviceMemory: 8 })).toBe(false);
    expect(wantsStaticFrame({ coarsePointer: false })).toBe(false);
  });

  it('is true when the browser is in data-saver mode', () => {
    expect(wantsStaticFrame({ coarsePointer: false, saveData: true })).toBe(true);
  });
});

describe('isScrolledPastBackground', () => {
  it('pauses once scrolled 1.2 viewport heights down, resumes above that', () => {
    expect(isScrolledPastBackground(0, 800)).toBe(false);
    expect(isScrolledPastBackground(959, 800)).toBe(false);
    expect(isScrolledPastBackground(961, 800)).toBe(true);
  });
});
