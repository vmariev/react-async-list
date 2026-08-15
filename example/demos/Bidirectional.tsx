import { useCallback, useEffect, useRef, useState } from 'react';
import { AsyncList } from '@vmariev/react-async-list';

import { delay, makeRows, type Row } from '../fakeApi';

const PAGE_SIZE = 15;
const MAX_PAGES_EACH_WAY = 3;

/**
 * Both edges load, three pages each way.
 *
 * Two things worth copying here:
 *
 * 1. No `exitOffset` — the scroll position is never touched, and loading stops
 *    purely because `isDisableFetch*` flips. That is the right default.
 * 2. The list is centred on mount through the forwarded `ref`. A two-way list
 *    left at `scrollTop: 0` starts out *at* the top edge, so it would keep
 *    requesting older pages until that direction ran dry.
 */
export const Bidirectional = () => {
  const [rows, setRows] = useState<Row[]>(() => makeRows(PAGE_SIZE, 'Middle'));
  const [pagesUp, setPagesUp] = useState(0);
  const [pagesDown, setPagesDown] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const list = listRef.current;

    if (list) {
      list.scrollTop = (list.scrollHeight - list.clientHeight) / 2;
    }
  }, []);

  const fetchUp = useCallback(async () => {
    await delay(500);
    setRows((current) => [...makeRows(PAGE_SIZE, 'Older'), ...current]);
    setPagesUp((current) => current + 1);
  }, []);

  const fetchDown = useCallback(async () => {
    await delay(500);
    setRows((current) => [...current, ...makeRows(PAGE_SIZE, 'Newer')]);
    setPagesDown((current) => current + 1);
  }, []);

  return (
    <section className="demo">
      <div className="demo__header">
        <h2>Bidirectional</h2>
        <p className="demo__note">
          Loads at both edges, {MAX_PAGES_EACH_WAY} pages up and{' '}
          {MAX_PAGES_EACH_WAY} down.
        </p>
      </div>
      <div className="demo__toolbar">
        <span className="status">
          {rows.length} rows · {pagesUp}↑ / {pagesDown}↓ pages
        </span>
      </div>
      <AsyncList
        ref={listRef}
        className="demo__list"
        fetchUp={fetchUp}
        fetchDown={fetchDown}
        isDisableFetchUp={pagesUp >= MAX_PAGES_EACH_WAY}
        isDisableFetchDown={pagesDown >= MAX_PAGES_EACH_WAY}
        triggerOffset={250}
      >
        {rows.map((row) => (
          <div className="row" key={row.id}>
            {row.label}
          </div>
        ))}
      </AsyncList>
    </section>
  );
};
