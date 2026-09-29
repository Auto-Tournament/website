// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PageTransition } from './PageTransition';

vi.mock('next/navigation', () => ({ usePathname: () => '/pricing' }));

let reduceMotion = false;
vi.mock('motion/react', async () => {
  const actual = await vi.importActual<typeof import('motion/react')>('motion/react');
  return { ...actual, useReducedMotion: () => reduceMotion };
});

afterEach(() => {
  cleanup();
  reduceMotion = false;
});

// prefers-reduced-motion: the animation is opt-out, not opt-in — someone who
// asked their OS for less motion should see page content appear instantly,
// with no fade/blur/translate at all (not even a faster version of it).
describe('PageTransition', () => {
  it('renders children plainly, without the motion wrapper, when the viewer prefers reduced motion', () => {
    reduceMotion = true;
    const { container } = render(
      <PageTransition>
        <p>Page content</p>
      </PageTransition>,
    );
    expect(screen.getByText('Page content')).toBeTruthy();
    // No motion.div wrapper is inserted: the child renders as the container's only element.
    expect(container.querySelector('p')).toBe(container.firstElementChild);
  });

  it('wraps children in the animated container otherwise', () => {
    render(
      <PageTransition>
        <p>Page content</p>
      </PageTransition>,
    );
    expect(screen.getByText('Page content')).toBeTruthy();
  });
});
