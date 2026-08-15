import type { ReactNode } from 'react';

export type CustomScrollbarSlots = {
  /** The absolutely positioned bar holding the track and thumb. */
  bar?: string;
  /** The full-height click target behind the thumb. */
  track?: string;
  /** The draggable thumb. */
  thumb?: string;
  /** The element rendered by `children`. */
  viewport?: string;
};

export type CustomScrollbarRenderProps = {
  /** Wire to the scrolling element's `onScroll`. */
  handleScrollContent: () => void;
  /** Apply to the scrolling element. */
  className: string;
};

export type CustomScrollbarProps = {
  /** The scrolling element to draw a scrollbar for. */
  listElement: HTMLElement | null;
  children: (params: CustomScrollbarRenderProps) => ReactNode;
  /** Applied to the outer wrapper. */
  className?: string;
  classNames?: CustomScrollbarSlots;
  /** Bottom-anchored (chat) mode, where `scrollTop` runs from `-max` to `0`. */
  isReverse?: boolean;
};

export type ScrollbarStyleSnapshot = {
  display: string;
  height: string;
  top: string;
};

export type ScrollGeometry = {
  hasOverflow: boolean;
  maxScrollTop: number;
  maxThumbOffset: number;
  thumbHeight: number;
  thumbOffset: number;
  trackHeight: number;
};
