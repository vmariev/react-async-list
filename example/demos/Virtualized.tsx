import { useCallback, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useAsyncList, useMergedRef } from '@vmariev/react-async-list';

import { delay, makeRows, type Row } from '../fakeApi';

const ROW_HEIGHT = 36;
const PAGE_SIZE = 200;
const TOTAL_PAGES = 25; // 5000 rows

/**
 * The answer to "what about ten thousand rows".
 *
 * `AsyncList` renders every child, so a very long list wants a virtualizer. This
 * library deliberately does not include one — instead `useAsyncList` gives up its
 * markup so a real virtualizer can own the windowing while the hook owns the
 * paging. Only ~15 rows exist in the DOM here regardless of how many are loaded.
 */
export const Virtualized = () => {
  const [rows, setRows] = useState<Row[]>(() => makeRows(PAGE_SIZE, 'Record'));
  const [page, setPage] = useState(1);
  const hasMore = page < TOTAL_PAGES;
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const fetchDown = useCallback(async () => {
    await delay(250);
    setRows((current) => [...current, ...makeRows(PAGE_SIZE, 'Record')]);
    setPage((current) => current + 1);
  }, []);

  const { ref, isLoadingDown } = useAsyncList({
    fetchDown,
    isDisableFetchDown: !hasMore,
    triggerOffset: 600,
    // Essential under virtualization: the DOM holds a constant handful of rows,
    // so the DOM-derived fallback would never change and the flood guard would
    // decide nothing had loaded. The real count comes from the data.
    itemCount: rows.length,
  });

  // Two owners, one node: the hook watches it, the virtualizer measures it.
  const setScroller = useMergedRef<HTMLDivElement>(scrollerRef, ref);

  const virtualizer = useVirtualizer({
    count: rows.length,
    estimateSize: () => ROW_HEIGHT,
    getScrollElement: () => scrollerRef.current,
    overscan: 6,
  });

  const virtualRows = virtualizer.getVirtualItems();

  return (
    <section className="demo" style={{ gridColumn: '1 / -1' }}>
      <div className="demo__header">
        <h2>Virtualized — 5000 rows, ~15 in the DOM</h2>
        <p className="demo__note">
          <code>useAsyncList</code> paging plus{' '}
          <code>@tanstack/react-virtual</code> windowing. Scroll fast: the row
          count climbs, the DOM node count does not.
        </p>
      </div>
      <div className="demo__toolbar">
        <span className="status">
          {rows.length} rows loaded · page {page}/{TOTAL_PAGES} ·{' '}
          {virtualRows.length} in the DOM
          {isLoadingDown ? ' · loading…' : ''}
        </span>
      </div>
      <div
        ref={setScroller}
        className="demo__list"
        style={{ height: 320, overflowY: 'auto' }}
        data-virtualized
      >
        {/* The spacer is what keeps scrollHeight honest, which is what the
            trigger zones measure. */}
        <div
          style={{
            height: virtualizer.getTotalSize(),
            position: 'relative',
            width: '100%',
          }}
        >
          {virtualRows.map((virtualRow) => (
            <div
              key={virtualRow.key}
              className="row"
              data-row
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: virtualRow.size,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {rows[virtualRow.index]?.label}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
