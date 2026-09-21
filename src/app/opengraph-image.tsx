import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import { tokens } from '@/theme/tokens';

/* Hallmark · OG image · genre: atmospheric · same tokens as the site
 * dark paper + one warm bloom, ram as the background figure, Sora headline, Geist body. */

export const alt = 'Auto Tournament: set it up, we handle the rest. Self-hosted tournament platform, CS2 built in.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const dynamic = 'force-static';

const { color } = tokens;
const root = process.cwd();
const font = (pkg: string, file: string) => readFile(path.join(root, 'node_modules/@fontsource', pkg, 'files', file));

export default async function OpengraphImage() {
  const [sora700, sora600, geist400, mark, icon] = await Promise.all([
    font('sora', 'sora-latin-700-normal.woff'),
    font('sora', 'sora-latin-600-normal.woff'),
    font('geist-sans', 'geist-sans-latin-400-normal.woff'),
    readFile(path.join(root, 'src/content/at-mark.svg'), 'utf8'),
    readFile(path.join(root, 'public/at-icon.svg'), 'utf8'),
  ]);
  const dataUri = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
          backgroundColor: color.paper,
          backgroundImage: `radial-gradient(700px 520px at 78% 38%, rgba(255,106,61,0.34), transparent 70%), radial-gradient(600px 400px at 0% 100%, rgba(230,70,50,0.14), transparent 70%)`,
          fontFamily: 'Geist',
          color: color.ink,
        }}
      >
        {/* The ram, large, bleeding off the right edge. */}
        <img src={dataUri(mark)} width={560} height={672} style={{ position: 'absolute', right: -40, top: -10, opacity: 0.95 }} alt="" />
        {/* Fade the ram into the copy side so the headline stays readable. */}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', backgroundImage: `linear-gradient(90deg, ${color.paper} 0%, ${color.paper} 42%, rgba(16,9,8,0.55) 62%, rgba(16,9,8,0) 80%)` }} />

        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '56px 72px 60px', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <img src={dataUri(icon)} width={56} height={56} style={{ borderRadius: 13 }} alt="" />
            <div style={{ fontFamily: 'Sora', fontWeight: 600, fontSize: 30, letterSpacing: -0.5 }}>Auto Tournament</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 680 }}>
            <div style={{ fontFamily: 'Sora', fontWeight: 700, fontSize: 72, lineHeight: 1.04, letterSpacing: -2.5, display: 'flex', flexDirection: 'column' }}>
              <span>Set it up.</span>
              <div style={{ display: 'flex' }}>
                <span>We handle&nbsp;</span>
                <span style={{ color: color.accent, textDecoration: 'underline', textDecorationThickness: 6 }}>the rest</span>
                <span>.</span>
              </div>
            </div>
            <div style={{ marginTop: 26, fontSize: 27, lineHeight: 1.4, color: color.ink2, maxWidth: 580 }}>
              Brackets, map veto, servers and results run themselves. Self-hosted and open source, CS2 built in.
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 24, color: color.muted }}>
            <div style={{ display: 'flex', padding: '8px 18px', borderRadius: 999, backgroundColor: color.accent, color: color.accentInk, fontWeight: 400 }}>autotournament.gg</div>
            <span>Free · MIT licensed · Docker</span>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'Sora', data: sora700, weight: 700, style: 'normal' },
        { name: 'Sora', data: sora600, weight: 600, style: 'normal' },
        { name: 'Geist', data: geist400, weight: 400, style: 'normal' },
      ],
    },
  );
}
