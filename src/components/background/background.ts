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
