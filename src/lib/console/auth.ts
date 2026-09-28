import 'server-only';
import NextAuth, { type DefaultSession } from 'next-auth';
import type { EmailConfig } from 'next-auth/providers/email';
import Google from 'next-auth/providers/google';
import { eq, and, isNull } from 'drizzle-orm';
import { databaseUrl, db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { dbError } from '@/lib/db/errors';
import { emailConfig, sendEmail } from '@/lib/email/postmark';
import { audit } from './audit';
import { consoleAdapter } from './adapter';
import { signInEmail } from './emails';
import { consoleHref, consoleOrigin, consoleUrl } from './urls';

/**
 * Sign-in for the console (Auth.js / next-auth v5): an emailed link, or
 * Google. No passwords. Database sessions (30 days) in Postgres.
 *
 * Env: AUTH_SECRET (required), AUTH_URL (https://console.autotournament.gg),
 * AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET (optional: without them, only the
 * email link). The email link goes out through Postmark (POSTMARK_SERVER_TOKEN);
 * in development without it, the link is printed to the server log instead.
 *
 * Cookies are host-only (no Domain), so they belong to the console's host
 * alone; on https the session cookie has the __Host- prefix.
 */

declare module 'next-auth' {
  interface Session {
    user: { id: string; emailVerified: Date | null; isAdmin: boolean } & DefaultSession['user'];
  }
}

export const SIGNIN_LINK_MAX_AGE_S = 15 * 60;

export function authSecretSet(env: Record<string, string | undefined> = process.env): boolean {
  return (env.AUTH_SECRET?.trim().length ?? 0) >= 32;
}

/** The console works when both the database and AUTH_SECRET are set. */
export function consoleEnabled(): boolean {
  return authSecretSet() && databaseUrl() !== null;
}

export function googleEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.AUTH_GOOGLE_ID?.trim() && env.AUTH_GOOGLE_SECRET?.trim());
}

/** Email links need Postmark in production; in development they are logged. */
export function emailLinkEnabled(): boolean {
  return emailConfig() !== null || process.env.NODE_ENV !== 'production';
}

const emailProvider: EmailConfig = {
  id: 'email',
  type: 'email',
  name: 'Email',
  maxAge: SIGNIN_LINK_MAX_AGE_S,
  async sendVerificationRequest({ token, identifier }) {
    // The link opens a page with a button (so mail scanners that open links don't
    // use it up), and carries only the token: not the address.
    const link = `${consoleUrl('/signin/confirm')}?token=${encodeURIComponent(token)}`;
    const config = emailConfig();
    if (!config) {
      if (process.env.NODE_ENV === 'production') throw new Error('email sign-in is not configured');
      console.info(`[console] POSTMARK_SERVER_TOKEN is unset; development sign-in link: ${link}`);
      return;
    }
    const result = await sendEmail({ to: identifier, ...signInEmail(link), tag: 'console-signin' }, config);
    if (!result.ok) {
      console.error('[console] sign-in email failed', { error: result.error });
      throw new Error('could not send the sign-in email');
    }
  },
};

const secure = () => consoleOrigin().startsWith('https://');

export const { handlers, auth, signIn, signOut } = NextAuth(() => ({
  adapter: consoleAdapter(db()),
  secret: process.env.AUTH_SECRET,
  session: { strategy: 'database', maxAge: 30 * 24 * 60 * 60, updateAge: 24 * 60 * 60 },
  providers: [
    ...(emailLinkEnabled() ? [emailProvider] : []),
    ...(googleEnabled()
      ? [
          Google({
            clientId: process.env.AUTH_GOOGLE_ID,
            clientSecret: process.env.AUTH_GOOGLE_SECRET,
            // Links Google to a user who signed in with an email link before, by
            // email. Safe only because signIn below refuses Google accounts
            // whose email Google hasn't verified.
            allowDangerousEmailAccountLinking: true,
          }),
        ]
      : []),
  ],
  pages: {
    signIn: consoleHref('/signin'),
    error: consoleHref('/signin'),
    verifyRequest: consoleHref('/signin/check-email'),
  },
  cookies: secure()
    ? { sessionToken: { name: '__Host-authjs.session-token', options: { httpOnly: true, sameSite: 'lax' as const, path: '/', secure: true } } }
    : undefined,
  callbacks: {
    signIn({ account, profile }) {
      if (account?.provider === 'google') return profile?.email_verified === true && typeof profile.email === 'string';
      return true;
    },
    session({ session, user }) {
      const u = user as typeof user & { isAdmin?: boolean };
      session.user = { ...session.user, id: u.id, email: u.email, name: u.name, image: u.image, emailVerified: u.emailVerified ?? null, isAdmin: u.isAdmin === true };
      return session;
    },
  },
  events: {
    async signIn({ user, account, profile, isNewUser }) {
      if (!user.id) return;
      try {
        // Google verified this address (checked in callbacks.signIn): mark it, so licenses bought with it show up.
        if (account?.provider === 'google' && profile?.email_verified === true && user.email) {
          await db()
            .update(users)
            .set({ emailVerified: new Date() })
            .where(and(eq(users.id, user.id), eq(users.email, user.email.toLowerCase()), isNull(users.emailVerified)));
        }
        await audit(db(), { actor: user.id, action: 'auth.signin', targetType: 'user', targetId: user.id, details: { provider: account?.provider ?? 'unknown', new_user: Boolean(isNewUser) } });
      } catch (err) {
        console.error('[console] sign-in bookkeeping failed', dbError(err));
      }
    },
    async linkAccount({ user, account }) {
      if (!user.id) return;
      await audit(db(), { actor: user.id, action: 'auth.link', targetType: 'user', targetId: user.id, details: { provider: account.provider } }).catch(() => {});
    },
  },
  logger: {
    // Auth.js errors can carry the request URL (with a sign-in token) or an address: log the kind only.
    error(error) {
      console.error('[auth]', error.name, (error as { type?: string }).type ?? '');
    },
    warn(code) {
      console.warn('[auth] warning', code);
    },
    debug() {},
  },
}));
