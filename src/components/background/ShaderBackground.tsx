'use client';

import { useEffect, useRef } from 'react';
import { FRAGMENT_SHADER, REDUCED_MOTION_TIME, VERTEX_SHADER } from './shader';

/**
 * The animated page background: raw WebGL, one fullscreen triangle and the
 * fragment shader in ./shader.ts (same approach as Gryt's auth page; three.js
 * would add ~170 KB for no gain here).
 *
 * - Starts after the page is idle, so it never competes with the first paint.
 * - No WebGL or a failed compile removes the canvas; the plain paper colour
 *   underneath shows instead.
 * - prefers-reduced-motion draws one still frame. Hidden tabs stop drawing.
 * - Colours are read from the theme's CSS variables and re-read when the
 *   theme picker changes them.
 */

function readColor(name: string): [number, number, number] {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const hex = value.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(hex)) return [0.06, 0.04, 0.03];
  const n = parseInt(hex, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function ShaderBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cleanup: (() => void) | undefined;

    const init = () => {
      const gl = canvas.getContext('webgl', {
        alpha: false,
        antialias: false,
        preserveDrawingBuffer: false,
        powerPreference: 'low-power',
      });
      if (!gl) {
        canvas.remove();
        return;
      }

      const compile = (type: number, source: string) => {
        const shader = gl.createShader(type);
        if (!shader) return null;
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          console.warn('Background shader failed to compile', gl.getShaderInfoLog(shader));
          gl.deleteShader(shader);
          return null;
        }
        return shader;
      };

      const vertex = compile(gl.VERTEX_SHADER, VERTEX_SHADER);
      const fragment = compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
      const program = gl.createProgram();
      if (!vertex || !fragment || !program) {
        canvas.remove();
        return;
      }
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.warn('Background shader failed to link', gl.getProgramInfoLog(program));
        canvas.remove();
        return;
      }
      gl.useProgram(program);

      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, 'position');
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

      const uResolution = gl.getUniformLocation(program, 'resolution');
      const uTime = gl.getUniformLocation(program, 'time');
      const uPaper = gl.getUniformLocation(program, 'paper');
      const uAccent = gl.getUniformLocation(program, 'accent');
      const uAccent2 = gl.getUniformLocation(program, 'accent2');

      const setColors = () => {
        gl.uniform3fv(uPaper, readColor('--at-paper'));
        gl.uniform3fv(uAccent, readColor('--at-accent'));
        gl.uniform3fv(uAccent2, readColor('--at-accent-2'));
      };
      setColors();

      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

      const resize = () => {
        // Half resolution: it's a soft blur, and this keeps phones cool.
        const scale = Math.min(window.devicePixelRatio || 1, 2) * 0.5;
        const width = Math.max(1, Math.round(canvas.clientWidth * scale));
        const height = Math.max(1, Math.round(canvas.clientHeight * scale));
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }
      };

      let frame = 0;
      let start = 0;
      let lastTime = REDUCED_MOTION_TIME;
      const draw = (seconds: number) => {
        lastTime = seconds;
        resize();
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.uniform2f(uResolution, canvas.width, canvas.height);
        gl.uniform1f(uTime, seconds);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      };
      const loop = (timestamp: number) => {
        frame = requestAnimationFrame(loop);
        if (start === 0) start = timestamp - lastTime * 1000;
        draw((timestamp - start) / 1000);
      };
      const stop = () => {
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
      };
      const run = () => {
        stop();
        if (reducedMotion.matches) {
          draw(REDUCED_MOTION_TIME);
          return;
        }
        start = 0;
        frame = requestAnimationFrame(loop);
      };
      const onVisibility = () => (document.hidden ? stop() : run());

      // The theme picker writes the colour variables onto <html>.
      const themeObserver = new MutationObserver(() => {
        setColors();
        if (!frame) draw(lastTime);
      });
      themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
      const sizeObserver = new ResizeObserver(() => {
        if (!frame) draw(lastTime);
      });
      sizeObserver.observe(canvas);

      run();
      canvas.style.opacity = '1';
      reducedMotion.addEventListener('change', run);
      document.addEventListener('visibilitychange', onVisibility);

      cleanup = () => {
        stop();
        themeObserver.disconnect();
        sizeObserver.disconnect();
        reducedMotion.removeEventListener('change', run);
        document.removeEventListener('visibilitychange', onVisibility);
        gl.deleteProgram(program);
        gl.deleteShader(vertex);
        gl.deleteShader(fragment);
        gl.deleteBuffer(buffer);
        gl.getExtension('WEBGL_lose_context')?.loseContext();
      };
    };

    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 200));
    const cancelIdle = window.cancelIdleCallback ?? window.clearTimeout;
    const handle = idle(init);
    return () => {
      cancelIdle(handle);
      cleanup?.();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        zIndex: -1,
        pointerEvents: 'none',
        opacity: 0,
        transition: 'opacity 1.2s ease',
      }}
    />
  );
}
