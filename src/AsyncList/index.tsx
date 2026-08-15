import {
  Children,
  Fragment,
  forwardRef,
  isValidElement,
  memo,
  type ReactNode,
} from 'react';

import { CustomScrollbar } from '../CustomScrollbar';
import { Loader } from '../Loader';
import { DEFAULT_TRIGGER_OFFSET, useAsyncList } from '../hooks/useAsyncList';
import { useInjectedStyles } from '../hooks/useInjectedStyles';
import { useMergedRef } from '../hooks/useMergedRef';
import { cx } from '../utils/cx';
import type { AsyncListProps } from './types';

/**
 * How many items the caller rendered.
 *
 * `Children.count` alone is not enough: it does not look inside a fragment, so
 * `<AsyncList><>{rows.map(…)}</></AsyncList>` — a perfectly ordinary thing to
 * write — would report `1` forever. The flood guard would then never see the
 * list grow and would stall it on its first page, silently, because a count
 * *was* supplied. Unwrap fragments so the number means what it says.
 *
 * Costs an allocation only in the single-child case, which is exactly the case
 * that might be a fragment.
 */
const countItems = (children: ReactNode): number => {
  const count = Children.count(children);

  if (count !== 1) {
    return count;
  }

  const [only] = Children.toArray(children);

  if (isValidElement(only) && only.type === Fragment) {
    return countItems((only.props as { children?: ReactNode }).children);
  }

  return count;
};

/**
 * A scroll container that loads more items as either edge comes into view.
 *
 * The element must have a bounded height — `max-height`, a fixed height, or a
 * flex parent that constrains it — otherwise it grows to fit its content, never
 * scrolls, and never fetches.
 *
 * `ref` is forwarded to the scrolling element, so you can read and write
 * `scrollTop` directly. For programmatic scrolling that works in both
 * orientations, use `useAsyncList` instead.
 */
export const AsyncList = memo(
  forwardRef<HTMLDivElement, AsyncListProps>((props, forwardedRef) => {
    const {
      children,
      className,
      style,
      classNames: slots,
      fetchUp,
      fetchDown,
      isDisableFetchUp = false,
      isDisableFetchDown = false,
      isReverse = false,
      triggerOffset,
      exitOffset,
      loadCooldownMs,
      settleDelayMs,
      scrollbar,
      CustomLoader = Loader,
      injectStyles = true,
      contentKey,
      onScroll,
      onError,
      as: Component = 'div',
      id,
      // Deprecated aliases, resolved below.
      triggerTopPosition,
      scrollZoneExitPosition,
      deathZone,
      isHiddenScroll,
      contentElementId,
      ...rest
    } = props;

    const resolvedTriggerOffset =
      triggerOffset ?? triggerTopPosition ?? DEFAULT_TRIGGER_OFFSET;
    const resolvedExitOffset =
      exitOffset ?? scrollZoneExitPosition ?? deathZone;
    const resolvedScrollbar =
      scrollbar ?? (isHiddenScroll ? 'hidden' : 'custom');
    const resolvedId = id ?? contentElementId;

    useInjectedStyles(injectStyles);

    const { ref, element, isLoadingUp, isLoadingDown } = useAsyncList({
      fetchUp,
      fetchDown,
      isDisableFetchUp,
      isDisableFetchDown,
      isReverse,
      triggerOffset: resolvedTriggerOffset,
      exitOffset: resolvedExitOffset,
      loadCooldownMs,
      settleDelayMs,
      onScroll,
      onError,
      // Counted here rather than from the DOM so the loading indicator, which is
      // also a child of the content element, cannot be mistaken for an item.
      itemCount: countItems(children),
      contentKey,
    });

    const mergedRef = useMergedRef<HTMLDivElement>(
      forwardedRef,
      ref as (node: HTMLDivElement | null) => void
    );

    const scrollerClassName = cx(
      'react-async-list',
      isReverse && 'react-async-list_reverse',
      resolvedScrollbar !== 'native' &&
        'react-async-list_hide-native-scrollbar',
      slots?.scroller
    );

    const loaderClassName = (direction: 'up' | 'down') =>
      cx(
        'react-async-list__loader',
        `react-async-list__loader_${direction}`,
        slots?.loader
      );

    const content = (
      <div className={cx('react-async-list__content', slots?.content)}>
        {!isDisableFetchUp && fetchUp && isLoadingUp && (
          <CustomLoader
            key="react-async-list__loader_up"
            direction="up"
            className={loaderClassName('up')}
          />
        )}
        {children}
        {!isDisableFetchDown && fetchDown && isLoadingDown && (
          <CustomLoader
            key="react-async-list__loader_down"
            direction="down"
            className={loaderClassName('down')}
          />
        )}
      </div>
    );

    if (resolvedScrollbar === 'custom') {
      return (
        <CustomScrollbar
          listElement={element}
          isReverse={isReverse}
          className={cx(className, slots?.root)}
          style={style}
          classNames={{
            bar: slots?.scrollbar,
            track: slots?.track,
            thumb: slots?.thumb,
          }}
        >
          {({ handleScrollContent, className: viewportClassName }) => (
            <Component
              {...rest}
              ref={mergedRef}
              id={resolvedId}
              className={cx(scrollerClassName, viewportClassName)}
              onScroll={handleScrollContent}
            >
              {content}
            </Component>
          )}
        </CustomScrollbar>
      );
    }

    return (
      <Component
        {...rest}
        ref={mergedRef}
        id={resolvedId}
        className={cx(scrollerClassName, className, slots?.root)}
        style={style}
      >
        {content}
      </Component>
    );
  })
);

AsyncList.displayName = 'AsyncList';
