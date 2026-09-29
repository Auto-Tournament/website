import { describe, expect, it } from 'vitest';
import { hex } from '@/theme/tokens';
import { stripeAppearance } from './appearance';

describe('Stripe Payment Element appearance', () => {
  it('sets explicit colours for tabs, pickers, blocks, labels, text and links', () => {
    const rules = stripeAppearance.rules ?? {};
    for (const sel of ['.Tab', '.Tab:hover', '.Tab--selected', '.TabLabel', '.TabLabel--selected', '.TabIcon', '.PickerItem', '.Block', '.Label', '.Text', '.Link']) {
      expect(rules[sel], sel).toBeDefined();
      const r = rules[sel] as Record<string, string>;
      expect(r.color ?? r.fill, `${sel} colour`).toBeTruthy();
    }
  });
  it('the selected tab label is light on dark (never the default black)', () => {
    const rules = stripeAppearance.rules ?? {};
    expect((rules['.TabLabel--selected'] as Record<string, string>).color).toBe(hex.ink);
    expect((rules['.Tab--selected'] as Record<string, string>).backgroundColor).toBe(hex.paper3);
  });
});
