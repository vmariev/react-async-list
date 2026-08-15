/**
 * A minimal layout model for jsdom.
 *
 * jsdom performs no layout, so `scrollHeight`, `clientHeight` and `scrollTop`
 * are all inert zeroes. These getters are installed on `HTMLElement.prototype`
 * before any component mounts, so geometry is already correct at the first
 * measurement — patching individual elements after render would let the initial
 * check run against zeroes and fire a phantom fetch.
 *
 * `scrollHeight` is derived from the rendered rows rather than being a fixed
 * number, which reproduces the property that broke the first version of the
 * flood guard: while a list is under-filled, `scrollHeight` stays equal to
 * `clientHeight` however many rows are added, so heights alone cannot tell you
 * whether a fetch was productive.
 */
export const ROW_HEIGHT = 40;
export const DEFAULT_VIEWPORT_HEIGHT = 200;

/** Rows needed before the default viewport overflows. */
export const ROWS_TO_OVERFLOW = DEFAULT_VIEWPORT_HEIGHT / ROW_HEIGHT + 1;

/**
 * Which sign convention this fake container reports, mirroring the real engine
 * differences for `flex-direction: column-reverse`:
 *
 * - `standard` — `scrollTop` is clamped to `0 … max`
 * - `negative` — `scrollTop` is clamped to `-max … 0`
 *
 * Clamping is the important part. It is what a browser does, and it is what
 * makes the library's runtime probe (assign `-1`, see whether it sticks) produce
 * a truthful answer here rather than a rigged one.
 */
export type ScrollRegime = 'standard' | 'negative';

export type LayoutEntry = {
  clientHeight: number;
  scrollTop: number;
  regime: ScrollRegime;
};

const entries = new WeakMap<HTMLElement, LayoutEntry>();

let regimeForNextMount: ScrollRegime | null = null;

/**
 * Forces the convention for containers created from here on.
 *
 * Must be set *before* mounting: the library probes the container at its first
 * measurement, so configuring the regime afterwards would let that first
 * measurement run against the wrong convention.
 */
export const useRegimeForNextMount = (regime: ScrollRegime | null): void => {
  regimeForNextMount = regime;
};

const defaultRegimeFor = (element: HTMLElement): ScrollRegime => {
  if (regimeForNextMount) {
    return regimeForNextMount;
  }

  // Mirrors Chromium: a `column-reverse` container reports negative offsets.
  return element.classList?.contains('react-async-list_reverse')
    ? 'negative'
    : 'standard';
};

const entryFor = (element: HTMLElement): LayoutEntry => {
  let entry = entries.get(element);

  if (!entry) {
    entry = {
      clientHeight: DEFAULT_VIEWPORT_HEIGHT,
      scrollTop: 0,
      regime: defaultRegimeFor(element),
    };
    entries.set(element, entry);
  }

  return entry;
};

export const setScrollRegime = (
  element: HTMLElement,
  regime: ScrollRegime
): void => {
  const entry = entryFor(element);

  entry.regime = regime;
  entry.scrollTop = 0;
};

/** Only scroll containers get non-zero geometry. */
const isScroller = (element: HTMLElement) =>
  element.classList?.contains('react-async-list') ||
  element.hasAttribute?.('data-scroller');

export const getLayout = (element: HTMLElement): LayoutEntry =>
  entryFor(element);

export const setViewportHeight = (element: HTMLElement, height: number) => {
  entryFor(element).clientHeight = height;
};

export const installLayoutModel = () => {
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return isScroller(this) ? entryFor(this).clientHeight : 0;
    },
  });

  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get(this: HTMLElement) {
      if (!isScroller(this)) {
        return 0;
      }

      // A virtualized container's height comes from its spacer, not from the
      // handful of rows currently mounted. `data-scroll-height` models that;
      // everything else is measured from the rows it renders.
      const declared = this.getAttribute('data-scroll-height');
      const contentHeight =
        declared === null
          ? this.querySelectorAll('[data-row]').length * ROW_HEIGHT
          : Number(declared);

      return Math.max(entryFor(this).clientHeight, contentHeight);
    },
  });

  Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
    configurable: true,
    get(this: HTMLElement) {
      return isScroller(this) ? entryFor(this).scrollTop : 0;
    },
    set(this: HTMLElement, value: number) {
      if (!isScroller(this)) {
        return;
      }

      const entry = entryFor(this);
      const max = Math.max(0, this.scrollHeight - entry.clientHeight);

      entry.scrollTop =
        entry.regime === 'negative'
          ? Math.min(0, Math.max(-max, value))
          : Math.min(max, Math.max(0, value));
    },
  });
};
