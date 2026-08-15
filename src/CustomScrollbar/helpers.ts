import type { ScrollbarStyleSnapshot } from './types';

/**
 * Writes an inline style only when it actually changes.
 *
 * Thumb geometry is recomputed on every scroll frame; the snapshot keeps those
 * frames from touching the DOM when nothing moved.
 */
export const setStyleValue = (
  element: HTMLElement,
  snapshot: ScrollbarStyleSnapshot,
  key: keyof ScrollbarStyleSnapshot,
  value: string
): void => {
  if (snapshot[key] === value) {
    return;
  }

  snapshot[key] = value;
  element.style[key] = value;
};

export const setGrabbingCursor = (element: HTMLElement): void => {
  element.style.cursor = 'grabbing';
  element.style.userSelect = 'none';
  document.body.style.cursor = 'grabbing';
  document.body.style.userSelect = 'none';
};

export const resetGrabbingCursor = (element: HTMLElement): void => {
  element.style.cursor = 'grab';
  element.style.userSelect = '';
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
};
