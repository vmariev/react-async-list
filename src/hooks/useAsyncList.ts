import { useCallback, useEffect, useRef, useState } from 'react';

import {
  applyExitOffset,
  detectScrollRegime,
  getBottomScrollOffset,
  getMaxScrollTop,
  getRawScrollTop,
  getTopScrollOffset,
  setTopScrollOffset,
  type ScrollDirection,
} from '../utils/scroll';
import { useIsomorphicLayoutEffect } from './useIsomorphicLayoutEffect';

export const DEFAULT_TRIGGER_OFFSET = 400;
export const DEFAULT_LOAD_COOLDOWN_MS = 200;
export const DEFAULT_SETTLE_DELAY_MS = 200;

const DIRECTIONS: ScrollDirection[] = ['up', 'down'];

const isDevelopment = () =>
  typeof process !== 'undefined' &&
  process.env?.NODE_ENV !== 'production' &&
  process.env?.NODE_ENV !== 'test';

const warnedAboutItemCount = new WeakSet<HTMLElement>();

/**
 * Warns when the item count has to be guessed from the DOM and the guess is
 * demonstrably wrong.
 *
 * The fallback counts the direct children of the container's first element
 * child, which is right when your items are those children and wrong the moment
 * they sit under a wrapper — inside a `<table>`, `<thead>` and `<tbody>` are the
 * only children no matter how many rows exist, and a virtualizer keeps a
 * constant handful in the DOM. Either way the count stops changing, the flood
 * guard concludes nothing was loaded, and the list quietly stalls on its first
 * page. Silently is the problem; this makes it say so.
 */
const warnAboutMissingItemCount = (container: HTMLElement) => {
  if (!isDevelopment() || warnedAboutItemCount.has(container)) {
    return;
  }

  warnedAboutItemCount.add(container);

  console.warn(
    '[react-async-list] useAsyncList is guessing how many items are rendered, ' +
      'because `itemCount` was not passed. That guess counts the direct ' +
      "children of the container's first child, so it is wrong whenever your " +
      'items are nested — a <table>, a virtualizer — and the list will stop ' +
      'after one page. Pass `itemCount: rows.length`.',
    container
  );
};

export type AsyncListScrollState = {
  /**
   * Distance in px to the **visual** top of the content — the oldest item in a
   * reversed list. Normalised, so it does not change meaning with the
   * orientation or with the engine's `scrollTop` sign convention.
   */
  top: number;
  /** Distance in px to the visual bottom. `0` means "at the newest item". */
  bottom: number;
  /** `scrollHeight` of the container. */
  height: number;
};

export type UseAsyncListOptions = {
  /** Loads older/preceding items. Resolve once state has been updated. */
  fetchUp?: () => Promise<void>;
  /** Loads newer/following items. Resolve once state has been updated. */
  fetchDown?: () => Promise<void>;
  /** Set once there is nothing left to load upwards. */
  isDisableFetchUp?: boolean;
  /** Set once there is nothing left to load downwards. */
  isDisableFetchDown?: boolean;
  /** Bottom-anchored (chat) mode. */
  isReverse?: boolean;
  /** Distance in px from either edge at which a fetch starts. */
  triggerOffset?: number;
  /**
   * Where to park the scroll position across a fetch, in px from the edge.
   * Leave undefined — the default — to never move the user's scroll position.
   *
   * A small value (`1`) pins the list to the edge, which is how a chat stays
   * glued to the newest message. A value above `triggerOffset` moves the list
   * clear of the trigger zone so a short page cannot immediately request the
   * next one, at the cost of a visible jump.
   */
  exitOffset?: number;
  /** Minimum gap between two fetches in the same direction. */
  loadCooldownMs?: number;
  /** How long to wait after a render before re-checking the trigger zones. */
  settleDelayMs?: number;
  /**
   * How many items are currently rendered. Used to tell a productive fetch from
   * an empty one while the list is still under-filled, where heights alone
   * cannot: `scrollHeight` equals `clientHeight` no matter how many rows exist.
   *
   * `AsyncList` supplies this from its children. Pass it yourself when driving
   * the hook directly; without it the count is read from the DOM, which is less
   * precise if your markup nests items under a wrapper.
   */
  itemCount?: number;
  /**
   * Any value that changes when the data changes — a cursor, a page number,
   * `` `${rows[0]?.id}:${rows[rows.length - 1]?.id}` ``.
   *
   * Only needed when a fetch can *replace* items rather than append them. The
   * guard notices new data through geometry and `itemCount`, and a refresh that
   * returns the same number of items at the same height moves neither, so
   * without a `contentKey` the guard would conclude nothing had happened and
   * stop loading. It is also the simplest fix when items sit under a wrapper the
   * DOM fallback cannot see through, such as a `<table>` or a virtualizer.
   */
  contentKey?: string | number;
  onScroll?: (state: AsyncListScrollState) => void;
  /** Called when `fetchUp`/`fetchDown` rejects. Without it, errors are logged. */
  onError?: (error: unknown, direction: ScrollDirection) => void;
};

export type UseAsyncListResult = {
  /** Attach to the scrolling element. */
  ref: (node: HTMLElement | null) => void;
  /** The scrolling element, once mounted. */
  element: HTMLElement | null;
  isLoadingUp: boolean;
  isLoadingDown: boolean;
  /**
   * Re-evaluates both trigger zones and fetches if warranted.
   *
   * Pass `{ force: true }` to bypass the guard that suppresses a repeat attempt
   * against unchanged content — for example after your data source gained items
   * by some route the list cannot observe.
   */
  check: (options?: { force?: boolean }) => void;
  /** Scrolls to the top of the content, in either orientation. */
  scrollToTop: (options?: ScrollToOptions) => void;
  /** Scrolls to the bottom of the content, in either orientation. */
  scrollToBottom: (options?: ScrollToOptions) => void;
};

/**
 * The engine behind `AsyncList`, without any markup.
 *
 * Use it directly to add bidirectional lazy loading to your own container —
 * a table, a grid, a virtualized list — while keeping the scroll math, the
 * concurrency guards and the anti-thrash behaviour.
 */
export const useAsyncList = (
  options: UseAsyncListOptions
): UseAsyncListResult => {
  const {
    isReverse = false,
    triggerOffset = DEFAULT_TRIGGER_OFFSET,
    loadCooldownMs = DEFAULT_LOAD_COOLDOWN_MS,
    settleDelayMs = DEFAULT_SETTLE_DELAY_MS,
    exitOffset,
  } = options;

  // The node is kept in state as well as a ref: consumers (and the custom
  // scrollbar) must re-render once the DOM node exists, while the scroll
  // callbacks need to read it synchronously without re-subscribing.
  const [element, setElement] = useState<HTMLElement | null>(null);
  const elementRef = useRef<HTMLElement | null>(null);

  const [isLoadingUp, setIsLoadingUp] = useState(false);
  const [isLoadingDown, setIsLoadingDown] = useState(false);

  // Guard 1: synchronous per-direction in-flight flags. The state above is for
  // rendering only — reading it inside a callback can be one tick stale, which
  // is enough for a scroll burst to start the same fetch twice.
  const loadingRef = useRef({ up: false, down: false });
  // Guard 2: per-direction cooldown.
  const lastLoadAtRef = useRef({ up: 0, down: 0 });
  // Guard 3: the content signature the last attempt in each direction ran
  // against. Stops a fetch that returned nothing from being retried forever.
  const lastAttemptSignatureRef = useRef<
    Record<ScrollDirection, string | null>
  >({ up: null, down: null });
  // Where the list was standing when a fetch last failed, per direction. A
  // retry is offered once the user has scrolled somewhere else — see the catch
  // block in `runLoad` and the reopening logic in `handleScroll`.
  const failedAtScrollTopRef = useRef<Record<ScrollDirection, number | null>>({
    up: null,
    down: null,
  });
  const settleTimerRef = useRef<number | null>(null);
  const hasAnchoredRef = useRef(false);

  // Latest-value ref so the scroll listener is attached once per element rather
  // than re-attached whenever an inline callback prop changes identity.
  const optionsRef = useRef(options);
  useIsomorphicLayoutEffect(() => {
    optionsRef.current = options;
  });

  const setRef = useCallback((node: HTMLElement | null) => {
    elementRef.current = node;
    setElement(node);
  }, []);

  /**
   * Puts a reverse list at the newest item to begin with.
   *
   * On an engine that reports negative offsets this is already true — position
   * `0` *is* the visual bottom, so there is nothing to do. On an engine using
   * the standard convention, `0` is the visual top, and a chat would open on the
   * oldest message and immediately start pulling history. Anchoring explicitly
   * makes the starting position the same everywhere.
   *
   * Runs once, as soon as there is something to scroll, and never again — after
   * that the position belongs to the user.
   */
  const anchorReverseList = useCallback(() => {
    const container = elementRef.current;

    if (!container || !isReverse || hasAnchoredRef.current) {
      return;
    }

    const maxScrollTop = getMaxScrollTop(container);

    if (maxScrollTop === 0) {
      return;
    }

    hasAnchoredRef.current = true;

    if (detectScrollRegime(container, true) === 'standard') {
      setTopScrollOffset(container, true, maxScrollTop);
    }
  }, [isReverse]);

  const parkScroll = useCallback(
    (direction: ScrollDirection) => {
      const container = elementRef.current;

      if (!container || exitOffset === undefined) {
        return;
      }

      applyExitOffset(
        container,
        isReverse,
        direction,
        triggerOffset,
        exitOffset
      );
    },
    [exitOffset, isReverse, triggerOffset]
  );

  /**
   * Parking once is not enough: the rows fetched by this load are inserted by
   * React after the promise resolves, and the browser lays them out later
   * still. Each of the three attempts catches a different moment — before
   * commit, after commit, after layout.
   */
  const parkScrollAfterRender = useCallback(
    (direction: ScrollDirection) => {
      parkScroll(direction);

      if (typeof window === 'undefined') {
        return;
      }

      window.requestAnimationFrame(() => {
        parkScroll(direction);
        window.requestAnimationFrame(() => {
          parkScroll(direction);
        });
      });
    },
    [parkScroll]
  );

  const runLoad = useCallback(
    (direction: ScrollDirection): Promise<void> => {
      const { fetchUp, fetchDown, isDisableFetchUp, isDisableFetchDown } =
        optionsRef.current;
      const fetcher = direction === 'up' ? fetchUp : fetchDown;
      const isDisabled =
        direction === 'up' ? isDisableFetchUp : isDisableFetchDown;

      if (!fetcher || isDisabled || loadingRef.current[direction]) {
        return Promise.resolve();
      }

      lastLoadAtRef.current[direction] = Date.now();
      parkScroll(direction);

      loadingRef.current[direction] = true;
      const setIsLoading =
        direction === 'up' ? setIsLoadingUp : setIsLoadingDown;
      setIsLoading(true);

      let pending: Promise<void>;
      try {
        pending = Promise.resolve(fetcher());
      } catch (error) {
        pending = Promise.reject(error);
      }

      return pending
        .catch((error: unknown) => {
          // A failed attempt answered nothing, so a retry is legitimate — but
          // only on the user's initiative. Clearing the guard outright here
          // would let the post-render check retry several times a second for as
          // long as the endpoint stayed broken, with the list sitting idle.
          // Instead, remember where we were standing: `handleScroll` reopens the
          // direction once the position has actually moved.
          failedAtScrollTopRef.current[direction] =
            elementRef.current?.scrollTop ?? 0;

          const { onError } = optionsRef.current;

          if (onError) {
            onError(error, direction);
            return;
          }

          // Swallowing would hide real failures; rethrowing would surface as an
          // unhandled rejection. Log instead, and let the direction recover.
          console.error(
            `[react-async-list] fetch${direction === 'up' ? 'Up' : 'Down'} failed. Pass onError to handle this yourself.`,
            error
          );
        })
        .finally(() => {
          loadingRef.current[direction] = false;
          setIsLoading(false);
          parkScrollAfterRender(direction);
        });
    },
    [parkScroll, parkScrollAfterRender]
  );

  /**
   * Identifies the current content. Two checks with the same signature are
   * asking the same question, so the second one cannot get a different answer.
   *
   * The item count matters as much as the heights: until the list overflows,
   * `scrollHeight` equals `clientHeight` no matter how many rows are added, so
   * heights alone would report "nothing changed" and stall a list that is still
   * filling up.
   *
   * The count deliberately comes from `itemCount` rather than from counting DOM
   * children where possible. A loading indicator is a child too, so a
   * DOM-derived count changes as the spinner mounts and unmounts — and a check
   * landing in that window would see a "changed" signature and allow a repeat
   * fetch against identical data.
   *
   * `contentKey` covers what geometry cannot see at all: a fetch that *replaces*
   * items with the same number of items of the same height leaves every measured
   * value untouched, so without it the guard would conclude nothing had happened.
   */
  const getContentSignature = (container: HTMLElement) => {
    const { itemCount, contentKey } = optionsRef.current;
    const content = container.firstElementChild;
    let resolvedCount = itemCount;

    if (resolvedCount === undefined) {
      // No count and no contentKey means the signature has nothing reliable to
      // notice growth by, which is worth saying out loud rather than stalling.
      if (contentKey === undefined) {
        warnAboutMissingItemCount(container);
      }

      resolvedCount =
        content instanceof HTMLElement ? content.childElementCount : 0;
    }

    return [
      container.scrollHeight,
      container.clientHeight,
      resolvedCount,
      contentKey ?? '',
    ].join('x');
  };

  /**
   * Whether a fetch could possibly start right now, judged **without touching
   * layout**: it only reads props and the in-flight flags.
   *
   * Used to avoid work rather than to decide anything. Reading `scrollHeight`
   * forces the browser to flush pending layout synchronously, and the
   * post-render check would otherwise do that several times a second per list
   * forever — including for a list that finished loading long ago and can never
   * fetch again, which is the steady state most lists end up in.
   */
  const canAnythingLoad = () => {
    const { fetchUp, fetchDown, isDisableFetchUp, isDisableFetchDown } =
      optionsRef.current;
    const up = Boolean(fetchUp) && !isDisableFetchUp && !loadingRef.current.up;
    const down =
      Boolean(fetchDown) && !isDisableFetchDown && !loadingRef.current.down;

    return up || down;
  };

  const check = useCallback(
    ({ force = false }: { force?: boolean } = {}) => {
      const container = elementRef.current;

      if (!container || !canAnythingLoad()) {
        return;
      }

      const { fetchUp, fetchDown, isDisableFetchUp, isDisableFetchDown } =
        optionsRef.current;
      const signature = getContentSignature(container);
      const now = Date.now();

      const canLoad = (direction: ScrollDirection) => {
        const fetcher = direction === 'up' ? fetchUp : fetchDown;
        const isDisabled =
          direction === 'up' ? isDisableFetchUp : isDisableFetchDown;

        if (!fetcher || isDisabled || loadingRef.current[direction]) {
          return false;
        }

        if (now - lastLoadAtRef.current[direction] < loadCooldownMs) {
          return false;
        }

        // The flood guard. Without it, a fetch that resolves without adding
        // anything — the normal response at the end of a list — leaves the
        // viewport at the same edge, and the post-render re-check fires the
        // same request again, forever, with no user interaction at all.
        // Re-attempting is allowed as soon as the content or the viewport
        // changes size, or the consumer swaps the fetcher / disable flag.
        if (
          !force &&
          lastAttemptSignatureRef.current[direction] === signature
        ) {
          return false;
        }

        const offset =
          direction === 'up'
            ? getTopScrollOffset(container, isReverse)
            : getBottomScrollOffset(container, isReverse);

        return offset <= triggerOffset;
      };

      // Evaluated per direction, so a slow fetchUp cannot starve fetchDown.
      for (const direction of DIRECTIONS) {
        if (canLoad(direction)) {
          lastAttemptSignatureRef.current[direction] = signature;
          void runLoad(direction);
        }
      }
    },
    [isReverse, loadCooldownMs, runLoad, triggerOffset]
  );

  const handleScroll = useCallback(() => {
    const container = elementRef.current;

    if (!container) {
      return;
    }

    const { onScroll } = optionsRef.current;

    // Nothing to report and nothing that could load: skip the layout reads
    // entirely rather than measuring on every scroll event for no reason.
    if (!onScroll && !canAnythingLoad()) {
      return;
    }

    if (onScroll) {
      // Normalised distances, so `top` always means "from the visual top"
      // whatever the orientation and whatever sign the engine reports.
      onScroll({
        top: getTopScrollOffset(container, isReverse),
        bottom: getBottomScrollOffset(container, isReverse),
        height: container.scrollHeight,
      });
    }

    // Moving away from where a fetch failed counts as the user asking again.
    // Scroll events that do not move the position — the ones a wheel gesture
    // keeps firing at the very end of a list — deliberately do not.
    for (const direction of DIRECTIONS) {
      const failedAt = failedAtScrollTopRef.current[direction];

      if (failedAt !== null && failedAt !== container.scrollTop) {
        failedAtScrollTopRef.current[direction] = null;
        lastAttemptSignatureRef.current[direction] = null;
      }
    }

    check();
  }, [check, isReverse]);

  const handleScrollRef = useRef(handleScroll);
  const checkRef = useRef(check);
  const anchorReverseListRef = useRef(anchorReverseList);
  const canAnythingLoadRef = useRef(canAnythingLoad);
  useIsomorphicLayoutEffect(() => {
    handleScrollRef.current = handleScroll;
    checkRef.current = check;
    anchorReverseListRef.current = anchorReverseList;
    canAnythingLoadRef.current = canAnythingLoad;
  });

  useEffect(() => {
    if (!element) {
      return;
    }

    const listener = () => handleScrollRef.current();

    // Probe the engine's sign convention now, while the list is untouched,
    // rather than lazily in the middle of a gesture — the probe writes and
    // restores scrollTop, and doing that during a user scroll would be rude.
    detectScrollRegime(element, isReverse);
    anchorReverseList();

    element.addEventListener('scroll', listener, { passive: true });
    listener();

    return () => {
      element.removeEventListener('scroll', listener);
    };
  }, [anchorReverseList, element, isReverse]);

  /**
   * Re-check after a render. This is what makes a page too short to fill the
   * viewport pull in the next one: an under-filled list produces no scroll
   * events and does not change size, so a render is the only signal that new
   * rows arrived.
   *
   * Deliberately a throttle, not a debounce — it arms a timer only when none is
   * pending instead of restarting it. Restarting on every render meant a parent
   * re-rendering faster than `settleDelayMs` (a mobx-driven chat, say) could
   * starve the check indefinitely. The delay still lets the browser lay the new
   * rows out before anything is measured.
   *
   * Firing often is harmless: `check` re-fetches only when the content
   * signature has actually changed.
   */
  useEffect(() => {
    if (!element || typeof window === 'undefined') {
      return;
    }

    if (settleTimerRef.current !== null || !canAnythingLoadRef.current()) {
      return;
    }

    settleTimerRef.current = window.setTimeout(() => {
      settleTimerRef.current = null;
      checkRef.current();
    }, settleDelayMs);
  });

  useEffect(
    () => () => {
      if (settleTimerRef.current !== null && typeof window !== 'undefined') {
        window.clearTimeout(settleTimerRef.current);
        settleTimerRef.current = null;
      }
    },
    []
  );

  /**
   * Viewport and content resizes do not necessarily involve a render — a window
   * resize, a font swap, or an image finishing its load can all change whether
   * an edge is in range.
   */
  useEffect(() => {
    if (!element || typeof ResizeObserver === 'undefined') {
      return;
    }

    // Fires once on observe, which doubles as the initial check.
    const resizeObserver = new ResizeObserver(() => {
      anchorReverseListRef.current();

      if (canAnythingLoadRef.current()) {
        checkRef.current();
      }
    });

    resizeObserver.observe(element);

    const contentElement = element.firstElementChild;

    if (contentElement instanceof HTMLElement) {
      resizeObserver.observe(contentElement);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [element]);

  /**
   * Re-enabling a direction means the answer may have changed, so clear its
   * flood guard.
   *
   * Keyed on the disable flags only — deliberately *not* on the fetcher
   * identity. Inline `fetchDown={async () => …}` props get a fresh identity on
   * every render, and since a fetch causes renders, keying on identity would
   * clear the guard continuously and bring the request flood straight back.
   * A fetcher swap on its own does not need to reopen the guard: if the cursor
   * moved, rows were added, and the content signature already differs.
   */
  useEffect(() => {
    lastAttemptSignatureRef.current.up = null;
  }, [options.isDisableFetchUp]);

  useEffect(() => {
    lastAttemptSignatureRef.current.down = null;
  }, [options.isDisableFetchDown]);

  const scrollTo = useCallback(
    (edge: 'top' | 'bottom', scrollOptions?: ScrollToOptions) => {
      const container = elementRef.current;

      if (!container) {
        return;
      }

      // Expressed as a distance from the visual top, then translated to whatever
      // raw value this engine expects — so callers never deal with the sign.
      const offsetFromTop = edge === 'top' ? 0 : getMaxScrollTop(container);

      if (scrollOptions?.behavior) {
        container.scrollTo({
          ...scrollOptions,
          top: getRawScrollTop(container, isReverse, offsetFromTop),
        });
        return;
      }

      setTopScrollOffset(container, isReverse, offsetFromTop);
    },
    [isReverse]
  );

  const scrollToTop = useCallback(
    (scrollOptions?: ScrollToOptions) => scrollTo('top', scrollOptions),
    [scrollTo]
  );

  const scrollToBottom = useCallback(
    (scrollOptions?: ScrollToOptions) => scrollTo('bottom', scrollOptions),
    [scrollTo]
  );

  return {
    ref: setRef,
    element,
    isLoadingUp,
    isLoadingDown,
    check,
    scrollToTop,
    scrollToBottom,
  };
};
