import { useCallback, useState } from 'react';
import {
  AsyncList,
  type AsyncListLoaderProps,
  type ScrollDirection,
} from '@kinavi/react-async-list';

import { delay, makeRows, type Row } from '../fakeApi';

/** `CustomLoader` receives the edge it is being rendered at. */
const SpinnerLoader = ({ className }: AsyncListLoaderProps) => (
  <div className={className}>
    <div className="pulse-loader" />
  </div>
);

/**
 * Also shows error recovery: a rejected fetch reaches `onError` and the list
 * stays usable — the next scroll retries instead of wedging.
 */
export const CustomLoaderAndErrors = () => {
  const [rows, setRows] = useState<Row[]>(() => makeRows(18, 'Task'));
  const [error, setError] = useState<string | null>(null);
  const [shouldFail, setShouldFail] = useState(false);

  const fetchDown = useCallback(async () => {
    await delay(600);

    if (shouldFail) {
      throw new Error('The server said no');
    }

    setRows((current) => [...current, ...makeRows(12, 'Task')]);
  }, [shouldFail]);

  const handleError = useCallback(
    (cause: unknown, direction: ScrollDirection) => {
      setError(
        `fetch${direction === 'up' ? 'Up' : 'Down'} failed: ${
          cause instanceof Error ? cause.message : String(cause)
        }`
      );
    },
    []
  );

  return (
    <section className="demo">
      <div className="demo__header">
        <h2>Custom loader &amp; error handling</h2>
        <p className="demo__note">
          Replaces the built-in spinner and routes rejections to{' '}
          <code>onError</code>.
        </p>
      </div>
      <div className="demo__toolbar">
        <button
          type="button"
          onClick={() => {
            setShouldFail((current) => !current);
            setError(null);
          }}
        >
          {shouldFail ? 'Stop failing' : 'Make the next fetch fail'}
        </button>
        <span className="status">{rows.length} rows</span>
      </div>
      {error && <div className="error-banner">{error}</div>}
      <AsyncList
        className="demo__list"
        fetchDown={fetchDown}
        onError={handleError}
        CustomLoader={SpinnerLoader}
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
