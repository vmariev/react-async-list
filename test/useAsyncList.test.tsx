import { act, render } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  useAsyncList,
  type UseAsyncListOptions,
} from '../src/hooks/useAsyncList';
import { advance, advanceInSteps, scrollTo } from './harness';
import { ROW_HEIGHT, useRegimeForNextMount } from './layout';

const ONE_CYCLE = 500;

type HarnessProps = UseAsyncListOptions & {
  initialRows?: number;
  pageSize?: number;
  emptyPages?: boolean;
  expose?: (api: ReturnType<typeof useAsyncList>) => void;
};

/**
 * A table, which `AsyncList`'s own markup could not produce — the point of the
 * hook. `data-scroller` opts the container into the test layout model.
 */
const TableHarness = (props: HarnessProps) => {
  const {
    initialRows = 0,
    pageSize = 1,
    emptyPages = false,
    expose,
    ...options
  } = props;

  const [rows, setRows] = useState(() =>
    Array.from({ length: initialRows }, (_, index) => index)
  );

  const api = useAsyncList({
    ...options,
    itemCount: rows.length,
    fetchDown: async () => {
      options.fetchDown?.();
      await new Promise((resolve) => setTimeout(resolve, 50));

      if (!emptyPages) {
        setRows((current) => [
          ...current,
          ...Array.from({ length: pageSize }, (_, i) => current.length + i),
        ]);
      }
    },
  });

  expose?.(api);

  return (
    <div data-scroller ref={api.ref}>
      <table>
        <tbody>
          {rows.map((row) => (
            <tr data-row key={row}>
              <td>{row}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

describe('useAsyncList', () => {
  it('drives a container it did not render', async () => {
    const fetchDown = vi.fn();
    const { container } = render(
      <TableHarness initialRows={0} pageSize={1} fetchDown={fetchDown} />
    );

    await advanceInSteps(3000);

    const scroller = container.querySelector('[data-scroller]')!;

    expect(fetchDown).toHaveBeenCalled();
    expect(scroller.querySelectorAll('[data-row]').length).toBeGreaterThan(1);
  });

  it('exposes per-direction loading state', async () => {
    let api!: ReturnType<typeof useAsyncList>;
    render(
      <TableHarness
        initialRows={2}
        emptyPages
        expose={(value) => {
          api = value;
        }}
      />
    );

    await advance(20);
    expect(api.isLoadingDown).toBe(true);
    expect(api.isLoadingUp).toBe(false);

    await advance(ONE_CYCLE);
    expect(api.isLoadingDown).toBe(false);
  });

  it('reports the element once mounted', async () => {
    let api!: ReturnType<typeof useAsyncList>;
    render(
      <TableHarness
        emptyPages
        expose={(value) => {
          api = value;
        }}
      />
    );

    await advance(10);

    expect(api.element).toBeInstanceOf(HTMLElement);
    expect(api.element?.hasAttribute('data-scroller')).toBe(true);
  });

  it('honours the flood guard just like the component', async () => {
    const fetchDown = vi.fn();
    const { container } = render(
      <TableHarness initialRows={20} emptyPages fetchDown={fetchDown} />
    );
    const scroller = container.querySelector<HTMLElement>('[data-scroller]')!;

    await scrollTo(scroller, scroller.scrollHeight - scroller.clientHeight);
    await advance(ONE_CYCLE);
    const settled = fetchDown.mock.calls.length;

    await advanceInSteps(3000);

    expect(fetchDown.mock.calls.length).toBe(settled);
  });

  // The documented escape hatch for data that arrived by a route the list
  // cannot observe.
  it('check({ force: true }) bypasses the flood guard', async () => {
    const fetchDown = vi.fn();
    let api!: ReturnType<typeof useAsyncList>;
    const { container } = render(
      <TableHarness
        initialRows={20}
        emptyPages
        fetchDown={fetchDown}
        expose={(value) => {
          api = value;
        }}
      />
    );
    const scroller = container.querySelector<HTMLElement>('[data-scroller]')!;

    await scrollTo(scroller, scroller.scrollHeight - scroller.clientHeight);
    await advance(ONE_CYCLE);
    const settled = fetchDown.mock.calls.length;

    // A plain check stays blocked.
    await act(async () => {
      api.check();
    });
    await advance(ONE_CYCLE);
    expect(fetchDown.mock.calls.length).toBe(settled);

    await act(async () => {
      api.check({ force: true });
    });
    await advance(ONE_CYCLE);

    expect(fetchDown.mock.calls.length).toBe(settled + 1);
  });

  describe('scrollToTop / scrollToBottom', () => {
    it('uses positive offsets in normal orientation', async () => {
      let api!: ReturnType<typeof useAsyncList>;
      const { container } = render(
        <TableHarness
          initialRows={20}
          emptyPages
          expose={(value) => {
            api = value;
          }}
        />
      );
      const scroller = container.querySelector<HTMLElement>('[data-scroller]')!;
      const max = 20 * ROW_HEIGHT - scroller.clientHeight;

      await act(async () => api.scrollToBottom());
      expect(scroller.scrollTop).toBe(max);

      await act(async () => api.scrollToTop());
      expect(scroller.scrollTop).toBe(0);
    });

    // The sign flip is the whole reason these helpers exist: consumers should
    // not have to know that a reversed container reports negative offsets.
    it('uses negative offsets on an engine that reports them', async () => {
      useRegimeForNextMount('negative');

      let api!: ReturnType<typeof useAsyncList>;
      const { container } = render(
        <TableHarness
          initialRows={20}
          isReverse
          emptyPages
          expose={(value) => {
            api = value;
          }}
        />
      );
      const scroller = container.querySelector<HTMLElement>('[data-scroller]')!;
      const max = 20 * ROW_HEIGHT - scroller.clientHeight;

      await act(async () => api.scrollToTop());
      expect(scroller.scrollTop).toBe(-max);

      await act(async () => api.scrollToBottom());
      expect(scroller.scrollTop).toBe(0);
    });
  });
});
