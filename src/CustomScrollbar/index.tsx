import {
  useCallback,
  useEffect,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type TouchEvent as ReactTouchEvent,
} from 'react';

import { useIsomorphicLayoutEffect } from '../hooks/useIsomorphicLayoutEffect';
import { clamp, getTopScrollOffset, setTopScrollOffset } from '../utils/scroll';
import { cx } from '../utils/cx';
import { EMPTY_STYLE_SNAPSHOT } from './constants';
import {
  resetGrabbingCursor,
  setGrabbingCursor,
  setStyleValue,
} from './helpers';
import type {
  CustomScrollbarProps,
  ScrollGeometry,
  ScrollbarStyleSnapshot,
} from './types';

/**
 * A hand-drawn scrollbar for an existing scroll container.
 *
 * The native scrollbar is hidden by CSS and this draws a track and thumb over
 * the content instead, so the bar looks the same on every platform and can be
 * styled. Thumb geometry is written imperatively, never through React state, so
 * scrolling does not re-render the list.
 *
 * Adapted from https://phuoc.ng/collection/react-drag-drop/build-a-custom-scrollbar/
 */
export const CustomScrollbar = (props: CustomScrollbarProps) => {
  const {
    children,
    className,
    style,
    classNames: slots,
    listElement,
    isReverse = false,
  } = props;

  const barRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const syncScrollbarRef = useRef<() => void>(() => undefined);
  /** Set while a thumb drag is in progress; see `startDrag`. */
  const stopDragRef = useRef<(() => void) | null>(null);
  const styleSnapshotRef = useRef<ScrollbarStyleSnapshot>({
    ...EMPTY_STYLE_SNAPSHOT,
    display: 'none',
  });

  const getTrackHeight = useCallback(() => {
    const trackHeight = trackRef.current?.getBoundingClientRect().height || 0;

    return trackHeight || listElement?.clientHeight || 0;
  }, [listElement]);

  const getScrollGeometry = useCallback((): ScrollGeometry | null => {
    if (!listElement) {
      return null;
    }

    const { clientHeight, scrollHeight } = listElement;
    const trackHeight = getTrackHeight();
    const maxScrollTop = Math.max(scrollHeight - clientHeight, 0);
    const hasOverflow =
      scrollHeight > clientHeight && trackHeight > 0 && maxScrollTop > 0;

    if (!hasOverflow) {
      return {
        hasOverflow,
        maxScrollTop,
        maxThumbOffset: 0,
        thumbHeight: 0,
        thumbOffset: 0,
        trackHeight,
      };
    }

    const thumbHeight = clamp(
      (trackHeight * clientHeight) / scrollHeight,
      0,
      trackHeight
    );
    const maxThumbOffset = Math.max(trackHeight - thumbHeight, 0);
    // Measured from the visual top in both orientations, so the thumb needs no
    // special case for reverse mode and no knowledge of the engine's sign.
    const topOffset = getTopScrollOffset(listElement, isReverse);
    const thumbOffset = clamp(
      (topOffset / maxScrollTop) * maxThumbOffset,
      0,
      maxThumbOffset
    );

    return {
      hasOverflow,
      maxScrollTop,
      maxThumbOffset,
      thumbHeight,
      thumbOffset,
      trackHeight,
    };
  }, [getTrackHeight, isReverse, listElement]);

  const syncScrollbar = useCallback(() => {
    const barElement = barRef.current;
    const thumbElement = thumbRef.current;
    const geometry = getScrollGeometry();

    if (!barElement || !thumbElement || !geometry?.hasOverflow) {
      if (barElement) {
        setStyleValue(barElement, styleSnapshotRef.current, 'display', 'none');
      }
      return;
    }

    setStyleValue(barElement, styleSnapshotRef.current, 'display', '');
    setStyleValue(
      thumbElement,
      styleSnapshotRef.current,
      'height',
      `${geometry.thumbHeight}px`
    );

    setStyleValue(
      thumbElement,
      styleSnapshotRef.current,
      'top',
      `${geometry.thumbOffset}px`
    );
  }, [getScrollGeometry]);

  useIsomorphicLayoutEffect(() => {
    syncScrollbarRef.current = syncScrollbar;
  });

  const scheduleSyncScrollbar = useCallback(() => {
    if (frameRef.current !== null) {
      return;
    }

    if (typeof window === 'undefined') {
      syncScrollbarRef.current();
      return;
    }

    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      syncScrollbarRef.current();
    });
  }, []);

  const handleScrollContent = useCallback(() => {
    scheduleSyncScrollbar();
  }, [scheduleSyncScrollbar]);

  const handleClickTrack = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const trackElement = trackRef.current;
      const geometry = getScrollGeometry();

      if (!trackElement || !listElement || !geometry?.hasOverflow) {
        return;
      }

      const bounds = trackElement.getBoundingClientRect();
      const clickedOffset = event.clientY - bounds.top;
      const nextThumbOffset = clamp(
        clickedOffset - geometry.thumbHeight / 2,
        0,
        geometry.maxThumbOffset
      );
      const nextTopOffset =
        geometry.maxThumbOffset > 0
          ? (nextThumbOffset / geometry.maxThumbOffset) * geometry.maxScrollTop
          : 0;

      setTopScrollOffset(listElement, isReverse, nextTopOffset);
      syncScrollbar();
    },
    [getScrollGeometry, isReverse, listElement, syncScrollbar]
  );

  useIsomorphicLayoutEffect(() => {
    scheduleSyncScrollbar();
  }, [scheduleSyncScrollbar]);

  useEffect(() => {
    if (!listElement || typeof window === 'undefined') {
      return;
    }

    // Observe the content wrapper too: the list's own box often stays the same
    // size while items are appended inside it.
    const contentElement = listElement.firstElementChild;
    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(scheduleSyncScrollbar)
        : null;

    resizeObserver?.observe(listElement);

    if (contentElement instanceof HTMLElement) {
      resizeObserver?.observe(contentElement);
    }

    window.addEventListener('resize', scheduleSyncScrollbar);
    scheduleSyncScrollbar();

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', scheduleSyncScrollbar);

      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [listElement, scheduleSyncScrollbar]);

  // Ends any drag still in progress when the component goes away.
  useEffect(() => () => stopDragRef.current?.(), []);

  /** Shared by the mouse and touch drag handlers. */
  const startDrag = useCallback(
    (startY: number, moveEvent: 'mouse' | 'touch') => {
      const thumbElement = thumbRef.current;
      const geometry = getScrollGeometry();

      if (!thumbElement || !listElement || !geometry?.hasOverflow) {
        return;
      }

      // Tracked as a distance from the visual top, so dragging down always means
      // "further down the list" in either orientation.
      const startTopOffset = getTopScrollOffset(listElement, isReverse);

      const applyDelta = (currentY: number) => {
        const currentGeometry = getScrollGeometry();

        if (!currentGeometry?.hasOverflow) {
          return;
        }

        const scrollRatio =
          currentGeometry.maxThumbOffset > 0
            ? currentGeometry.maxScrollTop / currentGeometry.maxThumbOffset
            : 0;

        setTopScrollOffset(
          listElement,
          isReverse,
          clamp(
            startTopOffset + (currentY - startY) * scrollRatio,
            0,
            currentGeometry.maxScrollTop
          )
        );

        setGrabbingCursor(thumbElement);
        syncScrollbar();
      };

      // A drag owns document-level listeners and two global body styles, so it
      // needs one exit path that always runs — including when the component
      // unmounts mid-drag, which otherwise left the whole page stuck with
      // `cursor: grabbing` and `user-select: none` for the rest of the session.
      let stop: () => void;

      if (moveEvent === 'mouse') {
        const handleMouseMove = (event: MouseEvent) =>
          applyDelta(event.clientY);

        stop = () => {
          document.removeEventListener('mousemove', handleMouseMove);
          document.removeEventListener('mouseup', stop);
          resetGrabbingCursor(thumbElement);
          stopDragRef.current = null;
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', stop);
      } else {
        const handleTouchMove = (event: TouchEvent) => {
          const touch = event.touches[0];

          if (!touch) {
            return;
          }

          // Without this the browser pans the page at the same time as the
          // thumb moves. Requires the listener to be non-passive.
          event.preventDefault();
          applyDelta(touch.clientY);
        };

        stop = () => {
          document.removeEventListener('touchmove', handleTouchMove);
          document.removeEventListener('touchend', stop);
          document.removeEventListener('touchcancel', stop);
          resetGrabbingCursor(thumbElement);
          stopDragRef.current = null;
        };

        document.addEventListener('touchmove', handleTouchMove, {
          passive: false,
        });
        document.addEventListener('touchend', stop);
        document.addEventListener('touchcancel', stop);
      }

      stopDragRef.current = stop;
    },
    [getScrollGeometry, isReverse, listElement, syncScrollbar]
  );

  const handleMouseDown = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      startDrag(event.clientY, 'mouse');
    },
    [startDrag]
  );

  const handleTouchStart = useCallback(
    (event: ReactTouchEvent<HTMLDivElement>) => {
      const touch = event.touches[0];

      if (touch) {
        startDrag(touch.clientY, 'touch');
      }
    },
    [startDrag]
  );

  return (
    <div className={cx('react-async-list-scrollbar', className)} style={style}>
      {children({
        handleScrollContent,
        className: cx(
          'react-async-list-scrollbar__viewport',
          slots?.viewport
        ) as string,
      })}
      <div
        className={cx('react-async-list-scrollbar__bar', slots?.bar)}
        ref={barRef}
        style={{ display: 'none' }}
      >
        <div
          className={cx('react-async-list-scrollbar__track', slots?.track)}
          ref={trackRef}
          onClick={handleClickTrack}
        />
        <div
          className={cx('react-async-list-scrollbar__thumb', slots?.thumb)}
          ref={thumbRef}
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
        />
      </div>
    </div>
  );
};
