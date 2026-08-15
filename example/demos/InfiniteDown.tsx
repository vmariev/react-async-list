import { useCallback, useState } from 'react';
import { AsyncList } from '@vmariev/react-async-list';

import { delay, makeRows, type Row } from '../fakeApi';

const PAGE_SIZE = 20;
const TOTAL_PAGES = 4;

/** The common case: one direction, a finite number of pages. */
export const InfiniteDown = () => {
  const [rows, setRows] = useState<Row[]>(() => makeRows(PAGE_SIZE, 'Item'));
  const [page, setPage] = useState(1);
  const hasMore = page < TOTAL_PAGES;

  const fetchDown = useCallback(async () => {
    await delay(600);
    setRows((current) => [...current, ...makeRows(PAGE_SIZE, 'Item')]);
    setPage((current) => current + 1);
  }, []);

  return (
    <section className="demo">
      <div className="demo__header">
        <h2>Infinite scroll down</h2>
        <p className="demo__note">
          Loads {PAGE_SIZE} more rows near the bottom edge, {TOTAL_PAGES} pages
          total, then stops via <code>isDisableFetchDown</code>.
        </p>
      </div>
      <div className="demo__toolbar">
        <span className="status">
          {rows.length} rows · page {page}/{TOTAL_PAGES}
        </span>
      </div>
      <AsyncList
        className="demo__list"
        fetchDown={fetchDown}
        isDisableFetchDown={!hasMore}
      >
        {rows.map((row) => (
          <div className="row" key={row.id}>
            {row.label}
          </div>
        ))}
        {!hasMore && <div className="row row_end">End of list</div>}
      </AsyncList>
    </section>
  );
};
