import type {
  ComponentPropsWithoutRef,
  ComponentType,
  ElementType,
} from 'react';

import type {
  AsyncListScrollState,
  UseAsyncListOptions,
} from '../hooks/useAsyncList';
import type { ScrollDirection } from '../utils/scroll';

export type { AsyncListScrollState, ScrollDirection };

/**
 * How the scrollbar is rendered:
 * - `custom` — native bar hidden, a styleable bar drawn on top (default)
 * - `native` — the browser's own scrollbar
 * - `hidden` — no visible scrollbar at all; the list still scrolls
 */
export type AsyncListScrollbarMode = 'custom' | 'native' | 'hidden';

export type AsyncListSlots = {
  /** Outermost element. In `custom` mode this is the scrollbar wrapper. */
  root?: string;
  /** The scrolling element. */
  scroller?: string;
  /** The wrapper around `children` that positions the loaders. */
  content?: string;
  /** Both loaders. */
  loader?: string;
  /** Custom scrollbar bar. */
  scrollbar?: string;
  /** Custom scrollbar track. */
  track?: string;
  /** Custom scrollbar thumb. */
  thumb?: string;
};

export type AsyncListLoaderProps = {
  className?: string;
  /** Which edge this loader belongs to. */
  direction: ScrollDirection;
};

type OwnProps = Pick<
  UseAsyncListOptions,
  | 'fetchUp'
  | 'fetchDown'
  | 'isDisableFetchUp'
  | 'isDisableFetchDown'
  | 'isReverse'
  | 'triggerOffset'
  | 'exitOffset'
  | 'loadCooldownMs'
  | 'settleDelayMs'
  | 'onScroll'
  | 'onError'
  | 'contentKey'
> & {
  /** How the scrollbar is rendered. Defaults to `custom`. */
  scrollbar?: AsyncListScrollbarMode;
  /** Replaces the built-in spinner. Receives the edge it is rendered at. */
  CustomLoader?: ComponentType<AsyncListLoaderProps>;
  /** Per-slot class names, for styling individual parts. */
  classNames?: AsyncListSlots;
  /**
   * Set to `false` to skip runtime style injection and import
   * `@vmariev/react-async-list/styles.css` yourself.
   */
  injectStyles?: boolean;
  /** Element or component to render the scroller as. Defaults to `div`. */
  as?: ElementType;

  /** @deprecated Renamed to `triggerOffset`. */
  triggerTopPosition?: number;
  /** @deprecated Renamed to `exitOffset`. */
  scrollZoneExitPosition?: number;
  /** @deprecated Renamed to `exitOffset`. */
  deathZone?: number;
  /** @deprecated Use `scrollbar="hidden"`. */
  isHiddenScroll?: boolean;
  /** @deprecated Use the standard `id` prop. */
  contentElementId?: string;
};

export type AsyncListProps = OwnProps &
  Omit<ComponentPropsWithoutRef<'div'>, keyof OwnProps | 'onScroll'>;
