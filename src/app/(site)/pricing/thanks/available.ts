import 'server-only';
import { stripeServer } from '@/lib/license/issue';
import { consoleEnabled, emailLinkEnabled } from '@/lib/console/auth';

/** Whether the thanks page offers "Go to your console": console, email sign-in and Stripe all set up. */
export function consoleLinkAvailable(): boolean {
  return consoleEnabled() && emailLinkEnabled() && stripeServer() !== null;
}
