import { describe, expect, it, vi } from 'vitest';
import { compatListenerCount, publishCompat, sseEvent, subscribeCompat } from './events';
import type { CompatUpdateEvent } from './document';

const event = { latest: null, run: { run: { id: 'x' } } } as unknown as CompatUpdateEvent;

describe('compat pub/sub', () => {
  it('delivers to every subscriber until it unsubscribes', () => {
    const a = vi.fn();
    const b = vi.fn();
    const before = compatListenerCount();
    const offA = subscribeCompat(a);
    const offB = subscribeCompat(b);
    expect(compatListenerCount()).toBe(before + 2);
    publishCompat(event);
    offA();
    publishCompat(event);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);
    offB();
    expect(compatListenerCount()).toBe(before);
  });

  it('one throwing listener does not stop the others', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const good = vi.fn();
    const offBad = subscribeCompat(() => {
      throw new Error('stream closed');
    });
    const offGood = subscribeCompat(good);
    publishCompat(event);
    expect(good).toHaveBeenCalledOnce();
    offBad();
    offGood();
    vi.restoreAllMocks();
  });

  it('formats one server-sent event per message, JSON on a single data line', () => {
    const text = sseEvent('update', { failure: 'line one\nline two' });
    expect(text).toBe('event: update\ndata: {"failure":"line one\\nline two"}\n\n');
    expect(text.split('\n').filter((l) => l.startsWith('data:'))).toHaveLength(1);
  });
});
