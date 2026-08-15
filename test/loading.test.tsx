import { describe, expect, it, vi } from 'vitest';

import {
  ROWS_TO_OVERFLOW,
  advance,
  advanceInSteps,
  renderList,
  scrollToEdge,
} from './harness';

const ONE_CYCLE = 500;

describe('filling an under-filled list', () => {
  /**
   * The counterpart to the flood guard. A list that starts empty, or whose first
   * page is too short to fill the viewport, produces no scroll events and does
   * not change size — so a render is the only signal that rows arrived. Break
   * that and the list silently stalls instead of silently flooding.
   */
  it('keeps requesting pages until the viewport overflows', async () => {
    const onFetchDown = vi.fn();
    const { isOverflowing, rowCount } = await renderList({
      initialRows: 0,
      pageSize: 1,
      onFetchDown,
    });

    expect(isOverflowing()).toBe(false);

    await advanceInSteps(5000);

    expect(rowCount()).toBeGreaterThanOrEqual(ROWS_TO_OVERFLOW);
    expect(isOverflowing()).toBe(true);
    expect(onFetchDown.mock.calls.length).toBeGreaterThanOrEqual(
      ROWS_TO_OVERFLOW
    );
  });

  // The post-render check is a throttle, not a debounce, precisely so this
  // cannot starve it. Restarting the timer on every render meant a parent
  // re-rendering faster than settleDelayMs suppressed it indefinitely.
  it('keeps filling even while the parent re-renders constantly', async () => {
    const { isOverflowing, rowCount, rerender } = await renderList({
      initialRows: 0,
      pageSize: 1,
    });

    for (let index = 0; index < 60; index += 1) {
      await rerender({ 'aria-label': `render-${index}` });
      await advance(30);
    }

    expect(rowCount()).toBeGreaterThanOrEqual(ROWS_TO_OVERFLOW);
    expect(isOverflowing()).toBe(true);
  });

  it('stops once the edge leaves the trigger zone', async () => {
    const onFetchDown = vi.fn();
    const { scroller } = await renderList({
      initialRows: 0,
      pageSize: 1,
      triggerOffset: 40,
      onFetchDown,
    });

    await advanceInSteps(5000);
    const settled = onFetchDown.mock.calls.length;

    await advanceInSteps(5000);

    expect(onFetchDown.mock.calls.length).toBe(settled);
    // A tight trigger zone means it stops soon after overflowing rather than
    // consuming the whole source.
    expect(scroller.scrollHeight).toBeLessThan(1000);
  });

  it('honours isDisableFetchDown while still under-filled', async () => {
    const onFetchDown = vi.fn();
    await renderList({
      initialRows: 0,
      pageSize: 1,
      isDisableFetchDown: true,
      onFetchDown,
    });

    await advanceInSteps(3000);

    expect(onFetchDown).not.toHaveBeenCalled();
  });
});

describe('per-direction independence', () => {
  /**
   * A single shared "is anything loading" guard used to gate both directions,
   * so a slow fetchUp starved fetchDown completely.
   */
  it('runs fetchDown while a slow fetchUp is still pending', async () => {
    const onFetchUp = vi.fn();
    const onFetchDown = vi.fn();

    // A short list: both edges are within range at once.
    await renderList({
      initialRows: 2,
      pageSize: 1,
      withFetchUp: true,
      withFetchDown: true,
      fetchLatencyMs: 5000,
      onFetchUp,
      onFetchDown,
    });

    await advance(400);

    expect(onFetchUp).toHaveBeenCalledTimes(1);
    expect(onFetchDown).toHaveBeenCalledTimes(1);
  });

  /**
   * The head-of-line case proper: `fetchUp` is already in flight when the user
   * reaches the opposite edge. A single shared "is anything loading" guard would
   * make `fetchDown` wait for it, which on a slow request means the bottom of
   * the list simply refuses to load.
   *
   * Distinct from the test above — there both directions become eligible in the
   * same pass, which a shared guard would still allow.
   */
  it('starts fetchDown after reaching the bottom mid-fetchUp', async () => {
    const onFetchUp = vi.fn();
    const onFetchDown = vi.fn();

    // 20 rows: the top edge is in range at once, the bottom edge is not.
    const { scroller } = await renderList({
      initialRows: 20,
      withFetchUp: true,
      withFetchDown: true,
      emptyPages: true,
      fetchLatencyMs: 5000,
      onFetchUp,
      onFetchDown,
    });

    await advance(300);
    expect(onFetchUp).toHaveBeenCalledTimes(1);
    expect(onFetchDown).not.toHaveBeenCalled();

    // fetchUp is still pending — reaching the bottom must not have to wait.
    await scrollToEdge(scroller, 'bottom');
    await advance(300);

    expect(onFetchUp).toHaveBeenCalledTimes(1);
    expect(onFetchDown).toHaveBeenCalledTimes(1);
  });

  it('tracks loading state separately for each direction', async () => {
    const { scroller } = await renderList({
      initialRows: 2,
      pageSize: 1,
      withFetchUp: true,
      withFetchDown: true,
      fetchLatencyMs: 5000,
    });

    await advance(300);

    expect(
      scroller.querySelector('.react-async-list__loader_up')
    ).not.toBeNull();
    expect(
      scroller.querySelector('.react-async-list__loader_down')
    ).not.toBeNull();
  });

  it('does not disable one direction when the other is disabled', async () => {
    const onFetchUp = vi.fn();
    const onFetchDown = vi.fn();

    await renderList({
      initialRows: 2,
      pageSize: 1,
      withFetchUp: true,
      withFetchDown: true,
      isDisableFetchUp: true,
      emptyPages: true,
      onFetchUp,
      onFetchDown,
    });

    await advance(ONE_CYCLE);

    expect(onFetchUp).not.toHaveBeenCalled();
    expect(onFetchDown).toHaveBeenCalledTimes(1);
  });
});

describe('reverse orientation', () => {
  it('loads history when scrolled to the reversed top edge', async () => {
    const onFetchUp = vi.fn();
    const { scroller, rowCount } = await renderList({
      initialRows: 20,
      isReverse: true,
      withFetchUp: true,
      withFetchDown: false,
      pageSize: 5,
      onFetchUp,
    });

    // scrollTop 0 is the bottom in reverse mode, so nothing should load yet.
    await advance(ONE_CYCLE);
    expect(onFetchUp).not.toHaveBeenCalled();

    await scrollToEdge(scroller, 'top', true);
    await advance(ONE_CYCLE);

    expect(onFetchUp).toHaveBeenCalled();
    expect(rowCount()).toBeGreaterThan(20);
  });

  it('does not load history while resting at the newest item', async () => {
    const onFetchUp = vi.fn();
    await renderList({
      initialRows: 20,
      isReverse: true,
      withFetchUp: true,
      withFetchDown: false,
      onFetchUp,
    });

    await advanceInSteps(3000);

    expect(onFetchUp).not.toHaveBeenCalled();
  });

  it('pins the scroll position to the bottom edge with exitOffset', async () => {
    const { scroller, layout } = await renderList({
      initialRows: 20,
      isReverse: true,
      exitOffset: 1,
      emptyPages: true,
    });

    await scrollToEdge(scroller, 'bottom', true);
    await advance(ONE_CYCLE);

    // Reverse mode writes a negative scrollTop: 1px off the bottom.
    expect(layout.scrollTop).toBe(-1);
  });
});

describe('cooldown', () => {
  it('does not fire the same direction twice inside the cooldown window', async () => {
    const onFetchDown = vi.fn();
    const { scroller } = await renderList({
      initialRows: 20,
      emptyPages: true,
      loadCooldownMs: 1000,
      onFetchDown,
    });

    await scrollToEdge(scroller, 'bottom');
    await advance(100);
    expect(onFetchDown).toHaveBeenCalledTimes(1);

    // Re-enabling clears the flood guard, but the cooldown should still hold.
    await scrollToEdge(scroller, 'bottom');
    await advance(200);

    expect(onFetchDown).toHaveBeenCalledTimes(1);
  });
});
