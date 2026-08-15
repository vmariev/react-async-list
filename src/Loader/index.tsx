import { memo } from 'react';

import { cx } from '../utils/cx';

export type LoaderProps = {
  className?: string;
};

const ITEMS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

/**
 * Default spinner: twelve fading spokes, drawn with CSS only.
 *
 * Inherits `currentColor`, so set `color` on an ancestor to recolour it. Pass
 * `CustomLoader` to `AsyncList` to replace it entirely.
 */
export const Loader = memo(({ className }: LoaderProps) => (
  <div className={cx('react-async-list-loader', className)} aria-hidden="true">
    <div className="react-async-list-loader__item" />
    {ITEMS.map((index) => (
      <div
        key={index}
        className={`react-async-list-loader__item react-async-list-loader__item_${index}`}
      />
    ))}
  </div>
));

Loader.displayName = 'Loader';
