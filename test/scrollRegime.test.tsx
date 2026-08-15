import { describe, expect, it, vi } from 'vitest';

import {
  detectScrollRegime,
  getBottomScrollOffset,
  getRawScrollTop,
  getTopScrollOffset,
  resetScrollRegime,
  setTopScrollOffset,
} from '../src/utils/scroll';
import {
  ROW_HEIGHT,
  advance,
  advanceInSteps,
  renderList,
  scrollToEdge,
  type ScrollRegime,
} from './harness';
import { setScrollRegime } from './layout';

/**
 * Reverse mode rests on `flex-direction: column-reverse`, and the scroll origin
 * for reversed flex containers has a history of differing between engines:
 * some report `scrollTop` as `-max … 0` with `0` at the visual bottom, others as
 * `0 … max` with `0` at the visual top.
 *
 * Rather than hard-code either, the library probes the container and normalises
 * everything to "distance from the visual top". These tests run the same
 * behaviour under both conventions, so a browser that disagrees with Chromium
 * cannot silently invert every write.
 */

const REGIMES: ScrollRegime[] = ['negative', 'standard'];
const ONE_CYCLE = 500;
const FULL_LIST = 20;
/** 20 rows × 40px in a 200px viewport. */
const MAX_SCROLL = FULL_LIST * ROW_HEIGHT - 200;

/** A container whose scrollTop clamps the way a real engine's would. */
const fakeContainer = (regime: ScrollRegime, scrollHeight = 1000) => {
  const max = scrollHeight - 200;
  const state = { scrollTop: 0 };

  return {
    scrollHeight,
    clientHeight: 200,
    get scrollTop() {
      return state.scrollTop;
    },
    set scrollTop(value: number) {
      state.scrollTop =
        regime === 'negative'
          ? Math.min(0, Math.max(-max, value))
          : Math.min(max, Math.max(0, value));
    },
  } as HTMLElement;
};

describe('detectScrollRegime', () => {
  it('never probes a non-reversed container', () => {
    const container = fakeContainer('negative');
    const spy = vi.spyOn(container, 'scrollTop', 'set');

    expect(detectScrollRegime(container, false)).toBe('standard');
    expect(spy).not.toHaveBeenCalled();
  });

  it.each(REGIMES)('identifies a %s engine', (regime) => {
    expect(detectScrollRegime(fakeContainer(regime), true)).toBe(regime);
  });

  it('restores the scroll position it probed with', () => {
    const container = fakeContainer('negative');
    container.scrollTop = -300;

    detectScrollRegime(container, true);

    expect(container.scrollTop).toBe(-300);
  });

  it('caches per element, so the probe runs once', () => {
    const container = fakeContainer('negative');

    detectScrollRegime(container, true);
    const spy = vi.spyOn(container, 'scrollTop', 'set');
    detectScrollRegime(container, true);

    expect(spy).not.toHaveBeenCalled();
  });

  // With nothing to scroll, `0` is the only valid value under either convention,
  // so a probe cannot tell them apart — and must not cache a coin flip.
  it('does not cache a result taken while there was nothing to scroll', () => {
    const container = fakeContainer('negative', 200);

    expect(detectScrollRegime(container, true)).toBe('standard');

    const scrollable = fakeContainer('negative');
    expect(detectScrollRegime(scrollable, true)).toBe('negative');
  });

  it('re-probes after an explicit reset', () => {
    const container = fakeContainer('negative');

    expect(detectScrollRegime(container, true)).toBe('negative');

    resetScrollRegime(container);
    const spy = vi.spyOn(container, 'scrollTop', 'set');
    detectScrollRegime(container, true);

    expect(spy).toHaveBeenCalled();
  });
});

describe('offsets are normalised across engines', () => {
  it.each(REGIMES)('reports the visual top as 0 on a %s engine', (regime) => {
    const container = fakeContainer(regime);

    setTopScrollOffset(container, true, 0);

    expect(getTopScrollOffset(container, true)).toBe(0);
    expect(getBottomScrollOffset(container, true)).toBe(800);
  });

  it.each(REGIMES)(
    'reports the visual bottom as 0 on a %s engine',
    (regime) => {
      const container = fakeContainer(regime);

      setTopScrollOffset(container, true, 800);

      expect(getBottomScrollOffset(container, true)).toBe(0);
      expect(getTopScrollOffset(container, true)).toBe(800);
    }
  );

  it.each(REGIMES)(
    'round-trips a mid-list position on a %s engine',
    (regime) => {
      const container = fakeContainer(regime);

      setTopScrollOffset(container, true, 325);

      expect(getTopScrollOffset(container, true)).toBe(325);
      expect(getBottomScrollOffset(container, true)).toBe(475);
    }
  );

  it('writes the raw value each engine expects', () => {
    const negative = fakeContainer('negative');
    const standard = fakeContainer('standard');

    // Same visual position, opposite raw encodings.
    expect(getRawScrollTop(negative, true, 0)).toBe(-800);
    expect(getRawScrollTop(standard, true, 0)).toBe(0);
    expect(getRawScrollTop(negative, true, 800)).toBe(0);
    expect(getRawScrollTop(standard, true, 800)).toBe(800);
  });

  it('never produces negative zero at the bottom edge', () => {
    const container = fakeContainer('negative');

    expect(Object.is(getRawScrollTop(container, true, 800), 0)).toBe(true);
  });

  it.each(REGIMES)('clamps out-of-range writes on a %s engine', (regime) => {
    const container = fakeContainer(regime);

    setTopScrollOffset(container, true, 99999);
    expect(getTopScrollOffset(container, true)).toBe(800);

    setTopScrollOffset(container, true, -99999);
    expect(getTopScrollOffset(container, true)).toBe(0);
  });
});

describe.each(REGIMES)('reverse list behaviour on a %s engine', (regime) => {
  it('rests at the newest item without loading history', async () => {
    const onFetchUp = vi.fn();
    await renderList({
      initialRows: FULL_LIST,
      isReverse: true,
      scrollRegime: regime,
      withFetchUp: true,
      withFetchDown: false,
      onFetchUp,
    });

    await advanceInSteps(2000);

    expect(onFetchUp).not.toHaveBeenCalled();
  });

  it('loads history when scrolled to the visual top', async () => {
    const onFetchUp = vi.fn();
    const { scroller, rowCount } = await renderList({
      initialRows: FULL_LIST,
      isReverse: true,
      scrollRegime: regime,
      withFetchUp: true,
      withFetchDown: false,
      onFetchUp,
    });

    await scrollToEdge(scroller, 'top');
    await advance(ONE_CYCLE);

    expect(onFetchUp).toHaveBeenCalled();
    expect(rowCount()).toBeGreaterThan(FULL_LIST);
  });

  it('holds the flood guard at the visual bottom', async () => {
    const onFetchDown = vi.fn();
    const { scroller } = await renderList({
      initialRows: FULL_LIST,
      isReverse: true,
      scrollRegime: regime,
      emptyPages: true,
      onFetchDown,
    });

    await scrollToEdge(scroller, 'bottom');
    await advance(ONE_CYCLE);
    expect(onFetchDown).toHaveBeenCalledTimes(1);

    await advanceInSteps(2000);

    expect(onFetchDown).toHaveBeenCalledTimes(1);
  });

  it('pins to the visual bottom with exitOffset, in this engine encoding', async () => {
    const { scroller, layout } = await renderList({
      initialRows: FULL_LIST,
      isReverse: true,
      scrollRegime: regime,
      exitOffset: 1,
      emptyPages: true,
    });

    await scrollToEdge(scroller, 'bottom');
    await advance(ONE_CYCLE);

    // One px away from the visual bottom, whichever way this engine spells it.
    expect(getBottomScrollOffset(scroller, true)).toBe(1);
    expect(layout.scrollTop).toBe(regime === 'negative' ? -1 : MAX_SCROLL - 1);
  });

  it('reports onScroll distances by visual edge, not raw sign', async () => {
    const positions: { top: number; bottom: number }[] = [];
    const { scroller } = await renderList({
      initialRows: FULL_LIST,
      isReverse: true,
      scrollRegime: regime,
      emptyPages: true,
      onScroll: ({ top, bottom }) => positions.push({ top, bottom }),
    });

    await scrollToEdge(scroller, 'top');
    await advance(50);

    const atTop = positions[positions.length - 1]!;
    expect(atTop.top).toBe(0);
    expect(atTop.bottom).toBe(MAX_SCROLL);

    await scrollToEdge(scroller, 'bottom');
    await advance(50);

    const atBottom = positions[positions.length - 1]!;
    expect(atBottom.top).toBe(MAX_SCROLL);
    expect(atBottom.bottom).toBe(0);
  });
});

describe('a mid-life engine change', () => {
  // Not a real scenario so much as a guarantee that nothing caches the
  // convention beyond the element it was measured on.
  it('re-probes a container after a reset', async () => {
    const { scroller } = await renderList({
      initialRows: FULL_LIST,
      isReverse: true,
      scrollRegime: 'negative',
      emptyPages: true,
    });

    expect(detectScrollRegime(scroller, true)).toBe('negative');

    setScrollRegime(scroller, 'standard');
    resetScrollRegime(scroller);

    expect(detectScrollRegime(scroller, true)).toBe('standard');
    setTopScrollOffset(scroller, true, 0);
    expect(scroller.scrollTop).toBe(0);
  });
});
