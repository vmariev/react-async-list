import { act, render } from '@testing-library/react';
import { useCallback, useState } from 'react';
import { expect, vi } from 'vitest';

import { AsyncList } from '../src/AsyncList';
import type { AsyncListProps } from '../src/AsyncList/types';
import {
  getLayout,
  setViewportHeight,
  useRegimeForNextMount,
  type LayoutEntry,
  type ScrollRegime,
} from './layout';

export { ROW_HEIGHT, ROWS_TO_OVERFLOW } from './layout';
export type { ScrollRegime } from './layout';

/** Runs pending timers, rAF callbacks and promise continuations. */
export const advance = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

/**
 * Advances time in slices.
 *
 * React commits pending renders when an `act` scope exits, so one large jump
 * would run many timers against stale, uncommitted DOM. A real browser commits
 * between timers, and stepping reproduces that — which also makes "nothing
 * happened while idle" assertions meaningful rather than vacuous.
 */
export const advanceInSteps = async (total: number, step = 100) => {
  for (let elapsed = 0; elapsed < total; elapsed += step) {
    await advance(step);
  }
};

/** Moves the scroll position and dispatches the event a browser would. */
export const scrollTo = async (element: HTMLElement, top: number) => {
  await act(async () => {
    element.scrollTop = top;
    element.dispatchEvent(new Event('scroll'));
  });
};

/** The largest valid scroll offset, given the modelled geometry. */
const maxScrollTopOf = (element: HTMLElement) =>
  Math.max(0, element.scrollHeight - element.clientHeight);

/**
 * Scrolls to a **visual** edge, translating to whatever raw value the modelled
 * engine expects. Tests should never hand-write a signed scrollTop, otherwise
 * they would bake in the very convention we are trying not to assume.
 */
export const scrollToEdge = async (
  element: HTMLElement,
  edge: 'top' | 'bottom'
) => {
  const max = maxScrollTopOf(element);
  const offsetFromTop = edge === 'top' ? 0 : max;
  const { regime } = getLayout(element);

  await scrollTo(
    element,
    regime === 'negative' ? -(max - offsetFromTop) : offsetFromTop
  );
};

export type ListHarnessProps = Omit<
  AsyncListProps,
  'children' | 'fetchUp' | 'fetchDown'
> & {
  initialRows?: number;
  pageSize?: number;
  withFetchUp?: boolean;
  withFetchDown?: boolean;
  /** Resolve without adding rows — what a real API does past the last page. */
  emptyPages?: boolean;
  failing?: boolean;
  fetchLatencyMs?: number;
  /** Rows injected from outside, simulating a websocket push. */
  extraRows?: number;
  onFetchUp?: () => void;
  onFetchDown?: () => void;
  /**
   * Pass the fetchers as fresh inline functions on every render, the way most
   * consumers write them, rather than memoising with useCallback.
   */
  unstableFetchers?: boolean;
};

let rowId = 0;

const makeRows = (count: number) =>
  Array.from({ length: count }, () => {
    rowId += 1;
    return `row-${rowId}`;
  });

/** A list wired to controllable fake fetchers. */
const ListHarness = (props: ListHarnessProps) => {
  const {
    initialRows = 0,
    pageSize = 5,
    withFetchUp = false,
    withFetchDown = true,
    emptyPages = false,
    failing = false,
    fetchLatencyMs = 50,
    extraRows = 0,
    onFetchUp,
    onFetchDown,
    unstableFetchers = false,
    ...listProps
  } = props;

  const [rows, setRows] = useState<string[]>(() => makeRows(initialRows));

  const load = useCallback(
    async (direction: 'up' | 'down') => {
      (direction === 'up' ? onFetchUp : onFetchDown)?.();

      await new Promise((resolve) => {
        setTimeout(resolve, fetchLatencyMs);
      });

      if (failing) {
        throw new Error(`fetch ${direction} failed`);
      }

      if (emptyPages) {
        return;
      }

      setRows((current) =>
        direction === 'up'
          ? [...makeRows(pageSize), ...current]
          : [...current, ...makeRows(pageSize)]
      );
    },
    [emptyPages, failing, fetchLatencyMs, onFetchDown, onFetchUp, pageSize]
  );

  // Memoised on purpose: most consumers write their fetchers this way, and the
  // `unstableFetchers` option below covers the ones who do not.
  const stableUp = useCallback(() => load('up'), [load]);
  const stableDown = useCallback(() => load('down'), [load]);

  const pushed = makeRowsStable(extraRows);

  return (
    <AsyncList
      scrollbar="native"
      {...listProps}
      fetchUp={
        withFetchUp
          ? unstableFetchers
            ? () => load('up')
            : stableUp
          : undefined
      }
      fetchDown={
        withFetchDown
          ? unstableFetchers
            ? () => load('down')
            : stableDown
          : undefined
      }
    >
      {[...rows, ...pushed].map((row) => (
        <div data-row key={row}>
          {row}
        </div>
      ))}
    </AsyncList>
  );
};

/** Stable ids for externally pushed rows, so a rerender does not remount them. */
const makeRowsStable = (count: number) =>
  Array.from({ length: count }, (_, index) => `pushed-${index}`);

export type RenderedList = {
  scroller: HTMLElement;
  layout: LayoutEntry;
  rowCount: () => number;
  /** True once the content is taller than the viewport. */
  isOverflowing: () => boolean;
  rerender: (next: Partial<ListHarnessProps>) => Promise<void>;
};

/**
 * Renders a list against the modelled layout.
 *
 * `scrollRegime` picks the engine convention being simulated. It defaults to
 * `negative` for reversed lists — what Chromium reports — and `standard`
 * otherwise, so existing tests describe real-world behaviour; pass it explicitly
 * to exercise the other engine.
 */
export const renderList = async (
  props: ListHarnessProps & {
    viewportHeight?: number;
    scrollRegime?: ScrollRegime;
  } = {}
): Promise<RenderedList> => {
  const { viewportHeight, scrollRegime, ...listProps } = props;

  // Applied before mount: the library probes the container at its first
  // measurement, so this cannot be configured afterwards.
  useRegimeForNextMount(scrollRegime ?? null);

  let result!: ReturnType<typeof render>;

  await act(async () => {
    result = render(<ListHarness {...listProps} />);
  });

  const scroller =
    result.container.querySelector<HTMLElement>('.react-async-list');

  expect(scroller).not.toBeNull();

  if (viewportHeight !== undefined) {
    setViewportHeight(scroller!, viewportHeight);
  }

  return {
    scroller: scroller!,
    layout: getLayout(scroller!),
    rowCount: () => scroller!.querySelectorAll('[data-row]').length,
    isOverflowing: () => scroller!.scrollHeight > scroller!.clientHeight,
    rerender: async (next) => {
      await act(async () => {
        result.rerender(<ListHarness {...listProps} {...next} />);
      });
    },
  };
};
