import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Every Buy entry point goes through the shared checkout (useCheckout +
// CheckoutProvider), and only requestCheckout.ts talks to /api/checkout.

const src = join(__dirname, '..', '..');
const read = (path: string) => readFileSync(join(src, path), 'utf8');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('Buy entry points', () => {
  it('the pack cards, founder strip and guide result use useCheckout', () => {
    for (const file of ['components/PackPricing.tsx', 'components/PackFinder.tsx']) {
      const code = read(file);
      expect(code, file).toContain("import { useCheckout } from '@/components/checkout/Checkout'");
      expect(code, file).toContain('useCheckout()');
      expect(code, file).not.toMatch(/fetch\(|location\.assign|startCheckout/);
    }
  });

  it('the pricing page and the console Buy page wrap them in CheckoutProvider with the runtime key', () => {
    for (const file of ['app/(site)/pricing/page.tsx', 'app/console/buy/page.tsx']) {
      const code = read(file);
      expect(code, file).toContain('<CheckoutProvider publishableKey=');
      expect(code, file).toContain('stripePublishableKey()');
    }
  });

  it('nothing else calls /api/checkout', () => {
    const callers = files(src).filter((f) => /fetch(?:er)?\(\s*['"`]\/api\/checkout/.test(readFileSync(f, 'utf8')));
    expect(callers.map((f) => f.slice(src.length + 1))).toEqual(['lib/requestCheckout.ts']);
  });

  it('no NEXT_PUBLIC Stripe key (the image is built without .env)', () => {
    expect(files(src).filter((f) => readFileSync(f, 'utf8').includes('NEXT_PUBLIC_STRIPE'))).toEqual([]);
  });
});
