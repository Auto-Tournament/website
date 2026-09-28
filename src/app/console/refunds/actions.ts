'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { clientIp } from '@/lib/checkout';
import { db } from '@/lib/db/client';
import { dbError } from '@/lib/db/errors';
import { sameOrigin } from '@/lib/site';
import { consoleEnabled } from '@/lib/console/auth';
import { limits } from '@/lib/console/limits';
import { consoleOrigin } from '@/lib/console/urls';
import { cancelRefundRequest } from '@/lib/license/refundRequests';
import type { ActionState } from '../actions';

/**
 * The Cancel buttons on the page the refund confirmation link opens. No
 * session needed, on purpose: holding the link (the admin's inbox) is enough
 * to stop the refund, and to sign that admin out of every session when it
 * wasn't them. It can't move money. Same-origin checked and rate-limited per IP.
 */
export async function cancelRefundByLinkAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  if (!consoleEnabled()) return { error: 'Not found.' };
  const h = (await headers()) as unknown as Headers;
  if (!sameOrigin(h, consoleOrigin())) return { error: 'Forbidden.' };
  if (!limits.refundLinkIp(clientIp(h), Date.now())) return { error: 'Too many attempts. Wait a few minutes.' };
  const raw = fd.get('token');
  const token = typeof raw === 'string' ? raw.slice(0, 64) : '';
  const signOutEverywhere = fd.get('signOut') === 'yes';
  try {
    const result = await cancelRefundRequest(db(), { token, signOutEverywhere });
    if (!result.request) return { error: 'This link isn’t valid.' };
    revalidatePath('/console/admin', 'layout');
    const n = result.signedOut;
    const signedOut = signOutEverywhere ? ` Signed out of ${n} session${n === 1 ? '' : 's'}; sign in again with a new email link.` : '';
    return result.cancelled ? { ok: `Cancelled. Nothing was refunded.${signedOut}` } : { ok: `This request was no longer pending, so there was nothing to cancel.${signedOut}` };
  } catch (err) {
    console.error('[refund] cancel from the link failed', dbError(err));
    return { error: 'Something went wrong. Try again.' };
  }
}
