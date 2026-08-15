import { act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { advanceInSteps, renderList, scrollTo } from './harness';

/**
 * Reading `scrollHeight` forces the browser to flush pending layout
 * synchronously — a forced reflow. The post-render check does that on a timer,
 * so an exhausted list left on screen would keep paying for it several times a
 * second, forever, for an answer that can never change. Ten such lists on a page
 * is where it starts costing frames.
 *
 * These tests count actual reads of the measured properties.
 */
const countLayoutReads = (element: HTMLElement) => {
  const reads = { value: 0 };
  const original = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'scrollHeight'
  )!;

  Object.defineProperty(element, 'scrollHeight', {
    configurable: true,
    get() {
      reads.value += 1;
      return original.get!.call(this);
    },
  });

  return reads;
};

describe('layout reads while idle', () => {
  it('stops measuring once both directions are exhausted', async () => {
    const { scroller } = await renderList({
      initialRows: 20,
      isDisableFetchDown: true,
    });

    const reads = countLayoutReads(scroller);
    await advanceInSteps(3000);

    expect(reads.value).toBe(0);
  });

  it('stops measuring when no fetcher is supplied at all', async () => {
    const { scroller } = await renderList({
      initialRows: 20,
      withFetchDown: false,
    });

    const reads = countLayoutReads(scroller);
    await advanceInSteps(3000);

    expect(reads.value).toBe(0);
  });

  it('ignores scroll events too, when nothing could load and nobody is listening', async () => {
    const { scroller } = await renderList({
      initialRows: 20,
      isDisableFetchDown: true,
    });

    // Move first, then start counting: assigning scrollTop makes the layout
    // model read scrollHeight to clamp, exactly as a browser would, and that
    // read belongs to the test rather than to the library.
    await scrollTo(scroller, 120);

    const reads = countLayoutReads(scroller);

    for (let index = 0; index < 10; index += 1) {
      await act(async () => {
        scroller.dispatchEvent(new Event('scroll'));
      });
    }

    expect(reads.value).toBe(0);
  });

  // The optimisation must not cost anyone their scroll position readout.
  it('still measures on scroll when onScroll is supplied', async () => {
    const onScroll = vi.fn();
    const { scroller } = await renderList({
      initialRows: 20,
      isDisableFetchDown: true,
      onScroll,
    });

    onScroll.mockClear();
    await scrollTo(scroller, 100);

    expect(onScroll).toHaveBeenCalled();
  });

  it('still measures while a direction can load', async () => {
    const { scroller } = await renderList({
      initialRows: 20,
      emptyPages: true,
    });

    const reads = countLayoutReads(scroller);
    await advanceInSteps(1000);

    expect(reads.value).toBeGreaterThan(0);
  });

  it('goes quiet as soon as the source is exhausted mid-life', async () => {
    const { scroller, rerender } = await renderList({
      initialRows: 20,
      emptyPages: true,
    });

    await advanceInSteps(500);

    await rerender({ isDisableFetchDown: true });
    const reads = countLayoutReads(scroller);
    await advanceInSteps(3000);

    expect(reads.value).toBe(0);
  });
});
