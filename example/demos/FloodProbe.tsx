import { useCallback, useEffect, useRef, useState } from 'react';
import { AsyncList } from '@kinavi/react-async-list';

import { makeRows, type Row } from '../fakeApi';

/**
 * Diagnostic harness: counts how often fetchUp/fetchDown are invoked while the
 * list sits parked at an edge. Driven from the console in tests, not a docs
 * example.
 */
type ProbeConfig = {
  label: string;
  isReverse: boolean;
  exitOffset?: number;
  withFetchUp: boolean;
  withFetchDown: boolean;
  disableUp: boolean;
  disableDown: boolean;
  /** Simulates a parent that re-renders on a timer (mobx/chat-like). */
  rerenderMs?: number;
  /** Resolve fetches without adding rows, to isolate trigger behaviour. */
  emptyPages?: boolean;
  startRows?: number;
  pageSize?: number;
};

declare global {
  interface Window {
    __probe: Record<string, { up: number; down: number; t: number[] }>;
  }
}

if (typeof window !== 'undefined') {
  window.__probe = window.__probe ?? {};
}

const Probe = (config: ProbeConfig) => {
  const {
    label,
    isReverse,
    exitOffset,
    withFetchUp,
    withFetchDown,
    disableUp,
    disableDown,
    rerenderMs,
    emptyPages,
    startRows = 30,
    pageSize = 5,
  } = config;

  const [rows, setRows] = useState<Row[]>(() => makeRows(startRows, label));
  const [, setTick] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  if (typeof window !== 'undefined' && !window.__probe[label]) {
    window.__probe[label] = { up: 0, down: 0, t: [] };
  }

  useEffect(() => {
    if (!rerenderMs) {
      return;
    }
    const id = window.setInterval(() => setTick((v) => v + 1), rerenderMs);
    return () => window.clearInterval(id);
  }, [rerenderMs]);

  const record = (direction: 'up' | 'down') => {
    const entry = window.__probe[label];
    if (entry) {
      entry[direction] += 1;
      entry.t.push(performance.now());
    }
  };

  const fetchUp = useCallback(async () => {
    record('up');
    await new Promise((r) => setTimeout(r, 120));
    if (!emptyPages) {
      setRows((current) => [...makeRows(pageSize, label), ...current]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [label, emptyPages, pageSize]);

  const fetchDown = useCallback(async () => {
    record('down');
    await new Promise((r) => setTimeout(r, 120));
    if (!emptyPages) {
      setRows((current) => [...current, ...makeRows(pageSize, label)]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [label, emptyPages, pageSize]);

  return (
    <div data-probe={label}>
      <div className="scroll-modes__label">{label}</div>
      <AsyncList
        ref={listRef}
        className="demo__list"
        style={{ height: 140 }}
        isReverse={isReverse}
        exitOffset={exitOffset}
        fetchUp={withFetchUp ? fetchUp : undefined}
        fetchDown={withFetchDown ? fetchDown : undefined}
        isDisableFetchUp={disableUp}
        isDisableFetchDown={disableDown}
        scrollbar="native"
      >
        {rows.map((row) => (
          <div className="row" key={row.id}>
            {row.label}
          </div>
        ))}
      </AsyncList>
    </div>
  );
};

const CONFIGS: ProbeConfig[] = [
  // The scenario described: a reverse chat parked at the bottom (top === 0)
  // with a live fetchDown that is never disabled.
  {
    label: 'reverse-bottom-exit0',
    isReverse: true,
    exitOffset: 0,
    withFetchUp: false,
    withFetchDown: true,
    disableUp: false,
    disableDown: false,
    emptyPages: true,
  },
  {
    label: 'reverse-bottom-exit1',
    isReverse: true,
    exitOffset: 1,
    withFetchUp: false,
    withFetchDown: true,
    disableUp: false,
    disableDown: false,
    emptyPages: true,
  },
  {
    label: 'reverse-bottom-noexit',
    isReverse: true,
    withFetchUp: false,
    withFetchDown: true,
    disableUp: false,
    disableDown: false,
    emptyPages: true,
  },
  // Same, but correctly disabled — the documented way to stop.
  {
    label: 'reverse-bottom-disabled',
    isReverse: true,
    exitOffset: 0,
    withFetchUp: false,
    withFetchDown: true,
    disableUp: false,
    disableDown: true,
    emptyPages: true,
  },
  // Non-reverse list parked at the top with a live fetchUp.
  {
    label: 'normal-top-fetchup',
    isReverse: false,
    withFetchUp: true,
    withFetchDown: false,
    disableUp: false,
    disableDown: false,
    emptyPages: true,
  },
  // Head-of-line blocking: does a slow fetchUp stall fetchDown?
  {
    label: 'both-directions',
    isReverse: false,
    withFetchUp: true,
    withFetchDown: true,
    disableUp: false,
    disableDown: false,
    emptyPages: true,
  },
  // Frequent parent re-renders, as in a mobx-driven chat.
  {
    label: 'rerender-60ms',
    isReverse: true,
    exitOffset: 1,
    withFetchUp: false,
    withFetchDown: true,
    disableUp: false,
    disableDown: true,
    rerenderMs: 60,
    emptyPages: true,
  },
  // Productive but tiny pages: must keep going until the viewport is full,
  // without the user scrolling. This is the behaviour the flood guard must not
  // break — it is the difference between "stopped asking" and "stalled".
  {
    label: 'short-pages',
    isReverse: false,
    withFetchUp: false,
    withFetchDown: true,
    disableUp: false,
    disableDown: false,
    startRows: 0,
    pageSize: 1,
  },
  // Same, under constant re-renders, which used to be able to starve the
  // post-render re-check entirely.
  {
    label: 'short-pages-rerender',
    isReverse: false,
    withFetchUp: false,
    withFetchDown: true,
    disableUp: false,
    disableDown: false,
    startRows: 0,
    pageSize: 1,
    rerenderMs: 30,
  },
];

export const FloodProbe = () => (
  <section className="demo" style={{ gridColumn: '1 / -1' }}>
    <div className="demo__header">
      <h2>Flood probe (regression harness)</h2>
      <p className="demo__note">
        Every list below is parked at an edge with a fetcher that is never
        disabled. The <code>empty-page</code> probes must stay at{' '}
        <strong>zero</strong> fetches while idle; the <code>short-pages</code>{' '}
        probes must keep filling until they overflow. Counts live in{' '}
        <code>window.__probe</code>.
      </p>
    </div>
    <div
      style={{
        display: 'grid',
        gap: 12,
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
      }}
    >
      {CONFIGS.map((config) => (
        <Probe key={config.label} {...config} />
      ))}
    </div>
  </section>
);
