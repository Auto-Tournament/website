import { describe, expect, it } from 'vitest';
import { contrastRatio } from './contrast';
import { hex } from './tokens';

// WCAG 2.2 AA minimums: 4.5:1 for normal text, 3:1 for large text / UI
// component boundaries (borders, focus rings) against adjacent colours.
const AA_TEXT = 4.5;
const AA_UI = 3;

describe('CTA and link contrast (WCAG 2.2 AA)', () => {
  it('primary contained button text meets 4.5:1 in the default and hover state', () => {
    expect(contrastRatio(hex.accentInk, hex.accent)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio(hex.accentInk, hex.accent2)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('outlined button border meets 3:1 against every page surface', () => {
    for (const surface of [hex.paper, hex.paper2, hex.paper3]) {
      expect(contrastRatio(hex.fieldRule, surface)).toBeGreaterThanOrEqual(AA_UI);
    }
  });

  it('outlined/text button labels meet 4.5:1 on the page background', () => {
    expect(contrastRatio(hex.ink, hex.paper)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio(hex.ink, hex.paper2)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio(hex.ink, hex.paper3)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('accent link/text colour meets 4.5:1 on the page background', () => {
    expect(contrastRatio(hex.accent, hex.paper)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio(hex.accent2, hex.paper)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('focus ring meets 3:1 against the surfaces it appears on', () => {
    for (const surface of [hex.paper, hex.paper2, hex.paper3]) {
      expect(contrastRatio(hex.focus, surface)).toBeGreaterThanOrEqual(AA_UI);
    }
  });

  it('disabled button label stays at least 3:1 on its disabled background', () => {
    expect(contrastRatio(hex.muted, hex.paper3)).toBeGreaterThanOrEqual(AA_UI);
  });

  it('body text colours meet 4.5:1 on the page background', () => {
    expect(contrastRatio(hex.ink, hex.paper)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio(hex.ink2, hex.paper)).toBeGreaterThanOrEqual(AA_TEXT);
  });
});
