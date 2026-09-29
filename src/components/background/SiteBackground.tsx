'use client';

import { useSelectedLayoutSegment } from 'next/navigation';
import { ShaderBackground } from './ShaderBackground';
import { showsShader } from './background';

/** The shader behind the main site's pages; nothing (the flat paper colour) behind the console's. */
export function SiteBackground() {
  const segment = useSelectedLayoutSegment();
  return showsShader(segment) ? <ShaderBackground /> : null;
}
