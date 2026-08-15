export type ScrollDirection = 'up' | 'down';

/**
 * Which sign convention an engine uses for a container's `scrollTop`.
 *
 * - `standard` — `0 … maxScrollTop`, where `0` is the visual top. Every normal
 *   scroll container behaves this way.
 * - `negative` — `-maxScrollTop … 0`, where `0` is the visual *bottom*. This is
 *   what browsers report for `flex-direction: column-reverse`, because the
 *   scroll origin follows the flow direction rather than the box.
 */
export type ScrollRegime = 'standard' | 'negative';

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

/** Largest scrollable distance, as a positive number. */
export const getMaxScrollTop = (container: HTMLElement): number =>
  Math.max(0, container.scrollHeight - container.clientHeight);

const regimes = new WeakMap<HTMLElement, ScrollRegime>();

/**
 * Works out, by measurement rather than assumption, how this engine reports
 * `scrollTop` for this container.
 *
 * Reverse mode relies on `column-reverse`, and the scroll origin for reversed
 * flex containers has a history of differing between engines. Hard-coding the
 * negative convention would silently invert every write on an engine that
 * disagrees, which is the kind of bug that only shows up in someone else's
 * browser. So we ask the container directly: assign `-1` and see whether it
 * sticks. A `standard` container clamps that to `0`; a `negative` one keeps it.
 *
 * The probe writes and immediately restores `scrollTop` within a single task, so
 * nothing is painted in between. The answer is cached per element, and
 * non-reversed containers are never probed at all — they are `standard` by
 * definition.
 */
export const detectScrollRegime = (
  container: HTMLElement,
  isReversed: boolean
): ScrollRegime => {
  if (!isReversed) {
    return 'standard';
  }

  const cached = regimes.get(container);

  if (cached) {
    return cached;
  }

  // With nothing to scroll, `0` is the only valid position and both conventions
  // agree — so the probe would be meaningless. Answer without caching, and try
  // again once the list has content.
  if (getMaxScrollTop(container) === 0) {
    return 'standard';
  }

  const original = container.scrollTop;

  container.scrollTop = -1;
  const regime: ScrollRegime =
    container.scrollTop < 0 ? 'negative' : 'standard';
  container.scrollTop = original;

  regimes.set(container, regime);

  return regime;
};

/** Forgets a cached probe result. Exposed for tests and hot-reload. */
export const resetScrollRegime = (container: HTMLElement): void => {
  regimes.delete(container);
};

/**
 * The single normalised quantity everything else is built on: how far the
 * viewport sits from the **visual top** of the content, in px, whatever the
 * engine's sign convention.
 */
export const getTopScrollOffset = (
  container: HTMLElement,
  isReversed: boolean
): number => {
  const maxScrollTop = getMaxScrollTop(container);

  if (maxScrollTop === 0) {
    return 0;
  }

  if (detectScrollRegime(container, isReversed) === 'negative') {
    return clamp(maxScrollTop - Math.abs(container.scrollTop), 0, maxScrollTop);
  }

  return clamp(container.scrollTop, 0, maxScrollTop);
};

/** How far the viewport sits from the visual bottom of the content, in px. */
export const getBottomScrollOffset = (
  container: HTMLElement,
  isReversed: boolean
): number => {
  const maxScrollTop = getMaxScrollTop(container);

  if (maxScrollTop === 0) {
    return 0;
  }

  return maxScrollTop - getTopScrollOffset(container, isReversed);
};

/**
 * Translates a distance-from-the-visual-top into the raw `scrollTop` value this
 * engine expects. Use it when you need to hand a number to `scrollTo`.
 */
export const getRawScrollTop = (
  container: HTMLElement,
  isReversed: boolean,
  offsetFromTop: number
): number => {
  const maxScrollTop = getMaxScrollTop(container);
  const target = clamp(offsetFromTop, 0, maxScrollTop);

  // `target - maxScrollTop` rather than `-(maxScrollTop - target)`: the latter
  // yields negative zero at the bottom edge, which compares unequal to 0 under
  // Object.is and surprises anyone reading the value back.
  return detectScrollRegime(container, isReversed) === 'negative'
    ? target - maxScrollTop
    : target;
};

/** Moves the viewport to a given distance from the visual top. */
export const setTopScrollOffset = (
  container: HTMLElement,
  isReversed: boolean,
  offsetFromTop: number
): void => {
  container.scrollTop = getRawScrollTop(container, isReversed, offsetFromTop);
};

/**
 * Parks the scroll position `exitOffset` px away from the given edge, but only
 * while it is still inside the trigger zone — if the user has already scrolled
 * clear of the edge, their position is left alone.
 *
 * Two distinct uses, depending on how `exitOffset` compares to `triggerOffset`:
 *
 * - **Smaller** (e.g. `exitOffset: 1`) pins the list *to* the edge, which is
 *   what keeps a chat glued to the newest message across a load. The position
 *   stays inside the trigger zone, so loading continues until the source is
 *   exhausted.
 * - **Larger** moves the list clear of the zone, so a fetch that appended too
 *   little content to fill the viewport does not immediately request the next
 *   page. Costs a visible jump, so prefer relying on `isDisableFetch*` instead.
 */
export const applyExitOffset = (
  container: HTMLElement,
  isReversed: boolean,
  direction: ScrollDirection,
  triggerOffset: number,
  exitOffset: number
): void => {
  const maxScrollTop = getMaxScrollTop(container);
  const safeExitOffset = Math.min(exitOffset, maxScrollTop);

  if (direction === 'up') {
    if (getTopScrollOffset(container, isReversed) > triggerOffset) {
      return;
    }

    setTopScrollOffset(container, isReversed, safeExitOffset);
    return;
  }

  if (getBottomScrollOffset(container, isReversed) > triggerOffset) {
    return;
  }

  setTopScrollOffset(container, isReversed, maxScrollTop - safeExitOffset);
};
