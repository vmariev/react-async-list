import { describe, expect, it, vi } from 'vitest';

import { advance, advanceInSteps, renderList, scrollToEdge } from './harness';

/**
 * The regression suite for the most important behavioural guarantee: a list
 * parked at an edge must not keep re-requesting the same page.
 *
 * The failure mode needs no user interaction. Each fetch flips the loading
 * state, which re-renders, which re-runs the post-render check, which sees the
 * same edge still in range and fetches again — roughly three requests a second,
 * indefinitely.
 */

/** Long enough for many settle-timer cycles and cooldown windows to elapse. */
const A_LONG_IDLE = 3000;
/** Long enough for one fetch to start, resolve, and settle. */
const ONE_CYCLE = 500;

/** 20 rows × 40px = 800px of content in a 200px viewport. */
const FULL_LIST = 20;

describe('flood guard', () => {
  it('stops after one unproductive fetch at the bottom edge', async () => {
    const onFetchDown = vi.fn();
    const { scroller } = await renderList({
      initialRows: FULL_LIST,
      emptyPages: true,
      onFetchDown,
    });

    await scrollToEdge(scroller, 'bottom');
    await advance(ONE_CYCLE);

    expect(onFetchDown).toHaveBeenCalledTimes(1);

    // The page came back empty, so nothing changed and nothing should repeat.
    await advanceInSteps(A_LONG_IDLE);

    expect(onFetchDown).toHaveBeenCalledTimes(1);
  });

  it('stops after one unproductive fetch at the top edge', async () => {
    const onFetchUp = vi.fn();
    const { scroller } = await renderList({
      initialRows: FULL_LIST,
      withFetchUp: true,
      withFetchDown: false,
      emptyPages: true,
      onFetchUp,
    });

    // A list starts at scrollTop 0, which really is the top edge, so one
    // attempt on mount is correct. What must not happen is a second one.
    await scrollToEdge(scroller, 'top');
    await advance(ONE_CYCLE);

    expect(onFetchUp).toHaveBeenCalledTimes(1);

    await advanceInSteps(A_LONG_IDLE);

    expect(onFetchUp).toHaveBeenCalledTimes(1);
  });

  it('stops in reverse mode parked at the bottom — the scrollTop 0 case', async () => {
    const onFetchDown = vi.fn();
    const { scroller } = await renderList({
      initialRows: FULL_LIST,
      isReverse: true,
      emptyPages: true,
      onFetchDown,
    });

    // In reverse mode scrollTop 0 *is* the bottom edge, so the bottom offset is
    // zero and the trigger condition is permanently satisfied.
    await scrollToEdge(scroller, 'bottom');
    await advance(ONE_CYCLE);

    expect(onFetchDown).toHaveBeenCalledTimes(1);

    await advanceInSteps(A_LONG_IDLE);

    expect(onFetchDown).toHaveBeenCalledTimes(1);
  });

  // exitOffset was long believed to be the cure for this. It is not: both 0 and
  // 1 land well inside the default 400px trigger zone.
  it.each([
    ['exitOffset 0', 0],
    ['exitOffset 1', 1],
    ['exitOffset undefined', undefined],
  ])('holds the line with %s', async (_label, exitOffset) => {
    const onFetchDown = vi.fn();
    const { scroller } = await renderList({
      initialRows: FULL_LIST,
      isReverse: true,
      emptyPages: true,
      exitOffset,
      onFetchDown,
    });

    await scrollToEdge(scroller, 'bottom');
    await advance(ONE_CYCLE);

    expect(onFetchDown).toHaveBeenCalledTimes(1);

    await advanceInSteps(A_LONG_IDLE);

    expect(onFetchDown).toHaveBeenCalledTimes(1);
  });

  // Inline `fetchDown={async () => …}` is how most consumers write it. Keying
  // the guard reset on fetcher identity would clear it on every render — and a
  // fetch causes renders — bringing the flood straight back.
  it('survives fetchers that get a new identity on every render', async () => {
    const onFetchDown = vi.fn();
    const { scroller } = await renderList({
      initialRows: FULL_LIST,
      emptyPages: true,
      unstableFetchers: true,
      onFetchDown,
    });

    await scrollToEdge(scroller, 'bottom');
    await advance(ONE_CYCLE);
    await advanceInSteps(A_LONG_IDLE);

    expect(onFetchDown).toHaveBeenCalledTimes(1);
  });

  it('stays quiet when a parent re-renders faster than the settle delay', async () => {
    const onFetchDown = vi.fn();
    const { scroller, rerender } = await renderList({
      initialRows: FULL_LIST,
      emptyPages: true,
      onFetchDown,
    });

    await scrollToEdge(scroller, 'bottom');
    await advance(ONE_CYCLE);
    onFetchDown.mockClear();

    for (let index = 0; index < 40; index += 1) {
      await rerender({ 'aria-label': `render-${index}` });
      await advance(30);
    }

    expect(onFetchDown).not.toHaveBeenCalled();
  });

  it('never fetches at all when the direction is disabled', async () => {
    const onFetchDown = vi.fn();
    const { scroller } = await renderList({
      initialRows: FULL_LIST,
      isDisableFetchDown: true,
      onFetchDown,
    });

    await scrollToEdge(scroller, 'bottom');
    await advanceInSteps(A_LONG_IDLE);

    expect(onFetchDown).not.toHaveBeenCalled();
  });

  it('reopens when the direction is re-enabled', async () => {
    const onFetchDown = vi.fn();
    const { scroller, rerender } = await renderList({
      initialRows: FULL_LIST,
      emptyPages: true,
      onFetchDown,
    });

    await scrollToEdge(scroller, 'bottom');
    await advance(ONE_CYCLE);
    expect(onFetchDown).toHaveBeenCalledTimes(1);

    // Toggling the flag is the consumer saying "there may be data now", so a
    // repeat against unchanged content becomes legitimate again.
    await rerender({ isDisableFetchDown: true });
    await advance(300);
    await rerender({ isDisableFetchDown: false });
    await advance(ONE_CYCLE);

    expect(onFetchDown).toHaveBeenCalledTimes(2);
  });

  it('reopens when rows arrive by another route', async () => {
    const onFetchDown = vi.fn();
    const { scroller, rerender } = await renderList({
      initialRows: FULL_LIST,
      emptyPages: true,
      onFetchDown,
    });

    await scrollToEdge(scroller, 'bottom');
    await advance(ONE_CYCLE);
    expect(onFetchDown).toHaveBeenCalledTimes(1);

    // A websocket push: the content changed without the list asking, so the
    // previous answer is stale and asking again is justified.
    await rerender({ extraRows: 3 });
    await scrollToEdge(scroller, 'bottom');
    await advance(ONE_CYCLE);

    expect(onFetchDown).toHaveBeenCalledTimes(2);
  });

  it('reopens when the viewport is resized', async () => {
    const onFetchDown = vi.fn();
    const { scroller, layout } = await renderList({
      initialRows: FULL_LIST,
      emptyPages: true,
      onFetchDown,
    });

    await scrollToEdge(scroller, 'bottom');
    await advance(ONE_CYCLE);
    expect(onFetchDown).toHaveBeenCalledTimes(1);

    // A taller viewport can bring more of the list into range.
    layout.clientHeight = 400;
    await scrollToEdge(scroller, 'bottom');
    await advance(ONE_CYCLE);

    expect(onFetchDown).toHaveBeenCalledTimes(2);
  });
});
