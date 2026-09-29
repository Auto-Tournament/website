'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

/*
 * Wraps route content only — never the sticky navbars or the fixed WebGL
 * background (both live outside this component, in the layout). A new page
 * fades in with a short blur-to-sharp settle; the outgoing page fades out
 * quickly first, so the two never fight for attention. `mode="wait"` keeps
 * exit and enter sequential, which avoids any layout-shift/positioning tricks
 * that (previously) caused flicker over the shader background.
 *
 * `initial={false}` skips the animation on first load (server-rendered
 * paint), so it never delays LCP; it only plays on client-side navigations,
 * where a new `key` (the pathname) mounts a fresh instance. Query-string-only
 * changes (the checkout dialog) and same-page hash jumps don't change the
 * pathname, so they never trigger it.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();

  if (reduceMotion) return <>{children}</>;

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        initial={{ opacity: 0, filter: 'blur(6px)', y: 6 }}
        animate={{ opacity: 1, filter: 'blur(0px)', y: 0, transition: { duration: 0.22, ease: 'easeOut' } }}
        exit={{ opacity: 0, transition: { duration: 0.12, ease: 'easeOut' } }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
