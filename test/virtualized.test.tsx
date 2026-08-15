import { render } from '@testing-library/react';
import { useCallback, useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useAsyncList } from '../src/hooks/useAsyncList';
import { useMergedRef } from '../src/hooks/useMergedRef';
import { advance, advanceInSteps, scrollTo } from './harness';
import { ROW_HEIGHT } from './layout';

/**
 * The virtualizer case, modelled without pulling a virtualizer into the test.
 *
 * What matters is the shape: a spacer whose height represents *all* the data,
 * and a constant handful of rows inside it. Both of the library's content
 * signals behave differently here — `scrollHeight` comes from the spacer rather
 * than from the rows, and counting DOM children is meaningless because the
 * count never changes. This is exactly the setup where a wrong `itemCount`
 * silently stalls the list on page one.
 */

const PAGE_SIZE = 20;
const WINDOW_SIZE = 8;

type VirtualListProps = {
  /** Omit to reproduce the mistake the dev warning is about. */
  passItemCount?: boolean;
  onFetchDown: () => void;
};

const VirtualList = ({
  passItemCount = true,
  onFetchDown,
}: VirtualListProps) => {
  const [total, setTotal] = useState(PAGE_SIZE);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const fetchDown = useCallback(async () => {
    onFetchDown();
    await new Promise((resolve) => setTimeout(resolve, 20));
    setTotal((current) => current + PAGE_SIZE);
  }, [onFetchDown]);

  const { ref } = useAsyncList({
    fetchDown,
    itemCount: passItemCount ? total : undefined,
    onScroll: ({ top }) => setScrollTop(top),
  });

  const setScroller = useMergedRef<HTMLDivElement>(scrollerRef, ref);
  const first = Math.floor(scrollTop / ROW_HEIGHT);
  const visible = Math.min(WINDOW_SIZE, total - first);

  return (
    <div
      data-scroller
      ref={setScroller}
      // The spacer's height is what a browser would measure, not the mounted rows.
      data-scroll-height={total * ROW_HEIGHT}
    >
      {/* The spacer stands in for the whole dataset. */}
      <div data-spacer style={{ height: total * ROW_HEIGHT }}>
        {Array.from({ length: Math.max(0, visible) }, (_, index) => (
          <div data-row key={first + index}>
            row {first + index}
          </div>
        ))}
      </div>
    </div>
  );
};

describe('driving a virtualizer', () => {
  it('pages through the data with a constant number of DOM rows', async () => {
    const onFetchDown = vi.fn();
    const { container } = render(<VirtualList onFetchDown={onFetchDown} />);
    const scroller = container.querySelector<HTMLElement>('[data-scroller]')!;

    await advanceInSteps(1000);
    const domRows = scroller.querySelectorAll('[data-row]').length;

    // Scroll deep into the list, the way a user would.
    for (let step = 1; step <= 8; step += 1) {
      await scrollTo(scroller, step * 200);
      await advance(200);
    }

    expect(onFetchDown.mock.calls.length).toBeGreaterThan(1);
    // The window never grew, however many pages were loaded.
    expect(scroller.querySelectorAll('[data-row]').length).toBeLessThanOrEqual(
      WINDOW_SIZE
    );
    expect(domRows).toBeLessThanOrEqual(WINDOW_SIZE);
  });

  it('stops loading when idle, exactly like a plain list', async () => {
    const onFetchDown = vi.fn();
    const { container } = render(<VirtualList onFetchDown={onFetchDown} />);
    const scroller = container.querySelector<HTMLElement>('[data-scroller]')!;

    await advanceInSteps(1000);
    await scrollTo(scroller, 400);
    await advance(300);

    const settled = onFetchDown.mock.calls.length;
    await advanceInSteps(2000);

    expect(onFetchDown.mock.calls.length).toBe(settled);
  });

  // The failure this whole option exists to prevent.
  it('stalls on the first page when itemCount is omitted', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onFetchDown = vi.fn();

    try {
      const { container } = render(
        <VirtualList passItemCount={false} onFetchDown={onFetchDown} />
      );
      const scroller = container.querySelector<HTMLElement>('[data-scroller]')!;

      await advanceInSteps(1000);
      await scrollTo(scroller, 400);
      await advanceInSteps(2000);

      // One attempt, then silence: the DOM row count never moves, so the guard
      // cannot tell the fetch achieved anything.
      expect(onFetchDown).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });

  it('merges the container ref with the virtualizer’s own', async () => {
    const onFetchDown = vi.fn();
    const { container } = render(<VirtualList onFetchDown={onFetchDown} />);
    const scroller = container.querySelector<HTMLElement>('[data-scroller]')!;

    await advance(100);

    // If the merge dropped either ref, one of these would be false: the hook
    // would never see scroll events, or the virtualizer would never measure.
    await scrollTo(scroller, 300);
    await advance(200);

    expect(scroller.querySelectorAll('[data-row]').length).toBeGreaterThan(0);
    expect(onFetchDown).toHaveBeenCalled();
  });
});
