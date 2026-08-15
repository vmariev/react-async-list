import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { advance, advanceInSteps, renderList, scrollToEdge } from './harness';

const ONE_CYCLE = 500;
const A_LONG_IDLE = 3000;

describe('error handling', () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it('reports a rejection through onError with its direction', async () => {
    const onError = vi.fn();
    const { scroller } = await renderList({
      initialRows: 20,
      failing: true,
      onError,
    });

    await scrollToEdge(scroller, 'bottom');
    await advance(ONE_CYCLE);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[1]).toBe('down');
    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(Error);
  });

  // The original used .then() with no .catch(), so the loading flag stayed true
  // and the direction was dead for the rest of the session.
  it('clears the loading state so the direction is not wedged', async () => {
    const { scroller } = await renderList({
      initialRows: 20,
      failing: true,
      onError: vi.fn(),
    });

    await scrollToEdge(scroller, 'bottom');
    await advance(ONE_CYCLE);

    expect(scroller.querySelector('.react-async-list__loader')).toBeNull();
  });

  it('retries on the next scroll after a failure', async () => {
    const onFetchDown = vi.fn();
    const { scroller } = await renderList({
      initialRows: 20,
      failing: true,
      onError: vi.fn(),
      onFetchDown,
    });

    await scrollToEdge(scroller, 'bottom');
    await advance(ONE_CYCLE);
    expect(onFetchDown).toHaveBeenCalledTimes(1);

    // A failed attempt answered nothing, so asking again is legitimate.
    await scrollToEdge(scroller, 'top');
    await scrollToEdge(scroller, 'bottom');
    await advance(ONE_CYCLE);

    expect(onFetchDown).toHaveBeenCalledTimes(2);
  });

  // Retrying is allowed, but only in response to the user — a failing endpoint
  // must not be hammered while the list sits idle.
  it('does not retry on its own while idle after a failure', async () => {
    const onFetchDown = vi.fn();
    const { scroller } = await renderList({
      initialRows: 20,
      failing: true,
      onError: vi.fn(),
      onFetchDown,
    });

    await scrollToEdge(scroller, 'bottom');
    await advance(ONE_CYCLE);
    onFetchDown.mockClear();

    await advanceInSteps(A_LONG_IDLE);

    expect(onFetchDown).not.toHaveBeenCalled();
  });

  it('recovers fully once the source stops failing', async () => {
    const { scroller, rowCount, rerender } = await renderList({
      initialRows: 20,
      failing: true,
      onError: vi.fn(),
    });

    await scrollToEdge(scroller, 'bottom');
    await advance(ONE_CYCLE);
    expect(rowCount()).toBe(20);

    await rerender({ failing: false });

    // Scrolling away and back is what reopens the direction. Re-firing a scroll
    // event without moving does not, which is what keeps a broken endpoint from
    // being hammered while the user rests at the end of the list.
    await scrollToEdge(scroller, 'top');
    await scrollToEdge(scroller, 'bottom');
    await advance(ONE_CYCLE);

    expect(rowCount()).toBeGreaterThan(20);
  });

  it('ignores scroll events that do not move the position', async () => {
    const onFetchDown = vi.fn();
    const { scroller } = await renderList({
      initialRows: 20,
      failing: true,
      onError: vi.fn(),
      onFetchDown,
    });

    await scrollToEdge(scroller, 'bottom');
    await advance(ONE_CYCLE);
    onFetchDown.mockClear();

    // A wheel gesture at the very end of a list keeps firing scroll events
    // without changing scrollTop.
    for (let index = 0; index < 20; index += 1) {
      await scrollToEdge(scroller, 'bottom');
    }
    await advance(ONE_CYCLE);

    expect(onFetchDown).not.toHaveBeenCalled();
  });

  // Swallowing would hide real failures; rethrowing would surface as an
  // unhandled rejection. Logging is the compromise when no handler is given.
  it('logs instead of swallowing when no onError is supplied', async () => {
    const { scroller } = await renderList({
      initialRows: 20,
      failing: true,
    });

    await scrollToEdge(scroller, 'bottom');
    await advance(ONE_CYCLE);

    expect(consoleError).toHaveBeenCalled();
    expect(String(consoleError.mock.calls[0]?.[0])).toContain(
      'react-async-list'
    );
  });
});
