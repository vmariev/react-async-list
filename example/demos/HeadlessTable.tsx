import { useCallback, useState } from 'react';
import { useAsyncList } from '@kinavi/react-async-list';

import { delay, makeRows, type Row } from '../fakeApi';

/**
 * The same loading engine without `AsyncList`'s markup.
 *
 * `useAsyncList` gives you a ref to attach to any scroll container, so it drives
 * a real `<table>` here — something the component's own DOM structure could not
 * produce. It also exposes `scrollToTop`/`scrollToBottom`, which handle the
 * reverse-mode sign flip for you.
 */
export const HeadlessTable = () => {
  const [rows, setRows] = useState<Row[]>(() => makeRows(15, 'Record'));

  const fetchDown = useCallback(async () => {
    await delay(500);
    setRows((current) => [...current, ...makeRows(10, 'Record')]);
  }, []);

  const { ref, isLoadingDown, scrollToTop, scrollToBottom } = useAsyncList({
    fetchDown,
    triggerOffset: 200,
  });

  return (
    <section className="demo">
      <div className="demo__header">
        <h2>
          Headless — <code>useAsyncList</code>
        </h2>
        <p className="demo__note">
          Same engine, your own markup. Here it drives a real table.
        </p>
      </div>
      <div className="demo__toolbar">
        <button
          type="button"
          onClick={() => scrollToTop({ behavior: 'smooth' })}
        >
          Scroll to top
        </button>
        <button
          type="button"
          onClick={() => scrollToBottom({ behavior: 'smooth' })}
        >
          Scroll to bottom
        </button>
        <span className="status">
          {rows.length} records{isLoadingDown ? ' · loading…' : ''}
        </span>
      </div>
      <div className="demo__list" ref={ref} style={{ overflowY: 'auto' }}>
        <table className="table-demo">
          <thead>
            <tr>
              <th>ID</th>
              <th>Label</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.id}</td>
                <td>{row.label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};
