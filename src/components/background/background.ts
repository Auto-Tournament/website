/**
 * Which pages get the animated shader background. The main site does; the
 * console (every console and admin page, on console.autotournament.gg and at
 * /console in development) sits on the flat paper colour instead: calmer for
 * a working view, and no WebGL loop burning CPU while someone reads a table.
 *
 * `segment` is the first route segment under the root layout. On the
 * console's own host the proxy rewrites /x to /console/x, so it is 'console'
 * there too.
 */
export function showsShader(segment: string | null): boolean {
  return segment !== 'console';
}

/** Rendering is capped at 30fps: skip a draw unless this much time passed since the last one. */
const MIN_FRAME_INTERVAL_SECONDS = 1 / 30;

/**
 * Cap the shader loop at 30fps. `seconds` and `lastDrawSeconds` are the same
 * continuous clock the loop already keeps (time is never paused or reset by
 * this), so a skipped frame just means: don't issue a draw call this tick.
 */
export function shouldDrawFrame(seconds: number, lastDrawSeconds: number): boolean {
  return seconds - lastDrawSeconds >= MIN_FRAME_INTERVAL_SECONDS;
}

/** The device/network signals that mean "don't bother animating the background". */
export interface StaticFrameEnv {
  coarsePointer: boolean;
  hardwareConcurrency?: number;
  deviceMemory?: number;
  saveData?: boolean;
}

/**
 * Whether the shader should draw a single static frame instead of looping:
 * touch devices, low-core or low-memory machines, and data-saver users all
 * get the still frame. Reduced-motion is handled separately by the caller
 * (it's a live media query, not a one-time environment snapshot).
 */
export function wantsStaticFrame(env: StaticFrameEnv): boolean {
  if (env.coarsePointer) return true;
  if (typeof env.hardwareConcurrency === 'number' && env.hardwareConcurrency <= 4) return true;
  if (typeof env.deviceMemory === 'number' && env.deviceMemory <= 4) return true;
  if (env.saveData) return true;
  return false;
}

/**
 * Pause the loop once the page is scrolled a good way past the first
 * viewport (the fixed canvas is out of view "enough" by then), resume once
 * scrolled back above. `scrollY`/`innerHeight` are the raw window values.
 */
export function isScrolledPastBackground(scrollY: number, innerHeight: number): boolean {
  return scrollY > innerHeight * 1.2;
}
