import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import { hex } from '@/theme/tokens';

/* Hallmark · OG image · genre: poster · same tokens as the site
 * accent field, dark ink, the ram bleeding off the right edge. Matches the GitHub social
 * previews in the brand kit. */

export const alt = 'Auto Tournament: the tournament runs, you play. Self-hosted tournament platform, CS2 module included.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const dynamic = 'force-static';

const color = hex;
const root = process.cwd();
const font = (pkg: string, file: string) => readFile(path.join(root, 'node_modules/@fontsource', pkg, 'files', file));

export default async function OpengraphImage() {
  const [sora700, sora600, geist500, mark] = await Promise.all([
    font('sora', 'sora-latin-700-normal.woff'),
    font('sora', 'sora-latin-600-normal.woff'),
    font('geist-sans', 'geist-sans-latin-500-normal.woff'),
    readFile(path.join(root, 'src/content/at-mark.svg'), 'utf8'),
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
          backgroundColor: color.accent,
          fontFamily: 'Geist',
          color: color.accentInk,
        }}
      >
        {/* The ram at full strength, bleeding off the right and bottom edges. */}
        <img src={dataUri(mark)} width={623} height={748} style={{ position: 'absolute', right: -108, bottom: -148 }} alt="" />

        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '59px 73px', width: '100%' }}>
          <div style={{ fontFamily: 'Sora', fontWeight: 600, fontSize: 30, letterSpacing: -0.5 }}>Auto Tournament</div>

          <div style={{ display: 'flex', flexDirection: 'column', fontFamily: 'Sora', fontWeight: 700, fontSize: 85, lineHeight: 1, letterSpacing: -3 }}>
            <span>The</span>
            <span>tournament</span>
            <span>runs. You play.</span>
          </div>

          <div style={{ fontWeight: 500, fontSize: 24, letterSpacing: 2, textTransform: 'uppercase' }}>autotournament.gg</div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'Sora', data: sora700, weight: 700, style: 'normal' },
        { name: 'Sora', data: sora600, weight: 600, style: 'normal' },
        { name: 'Geist', data: geist500, weight: 500, style: 'normal' },
      ],
    },
  );
}
