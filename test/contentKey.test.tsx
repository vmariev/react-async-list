import { render } from '@testing-library/react';
import { useCallback, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useAsyncList } from '../src/hooks/useAsyncList';
import { advance, advanceInSteps, renderList, scrollToEdge } from './harness';
import { ROW_HEIGHT } from './layout';

const ONE_CYCLE = 500;
const FULL_LIST = 20;

/**
 * `contentKey` covers what geometry cannot see.
 *
 * The flood guard notices new data through the scroll height and the item count.
 * A fetch that *replaces* items — a refresh, a filter change — with the same
 * number of items at the same height moves neither, so the guard concludes
 * nothing happened and stops. Handing it a token that tracks the data closes
 * that hole.
 */

type ReplacingListProps = {
  contentKey?: string | number;
  onFetchDown: () => void;
};

/** Every fetch swaps in a fresh set of rows: same count, same height. */
const ReplacingList = ({ contentKey, onFetchDown }: ReplacingListProps) => {
  const [generation, setGeneration] = useState(0);

  const fetchDown = useCallback(async () => {
    onFetchDown();
    await new Promise((resolve) => setTimeout(resolve, 50));
    setGeneration((current) => current + 1);
  }, [onFetchDown]);

  const { ref } = useAsyncList({
    fetchDown,
    itemCount: FULL_LIST,
    contentKey: contentKey === undefined ? undefined : generation,
  });

  return (
    <div data-scroller ref={ref}>
      <div>
        {Array.from({ length: FULL_LIST }, (_, index) => (
          <div data-row key={`${generation}-${index}`}>
            gen {generation} row {index}
          </div>
        ))}
      </div>
    </div>
  );
};

describe('contentKey', () => {
  it('without it, a replacing fetch stops after one attempt', async () => {
    const onFetchDown = vi.fn();
    const { container } = render(<ReplacingList onFetchDown={onFetchDown} />);
    const scroller = container.querySelector<HTMLElement>('[data-scroller]')!;

    await scrollToEdge(scroller, 'bottom');
    await advance(ONE_CYCLE);
    await advanceInSteps(2000);

    // Geometry and item count are identical after the swap, so the guard cannot
    // tell that anything arrived. This is the documented limitation.
    expect(onFetchDown).toHaveBeenCalledTimes(1);
  });

  it('with it, the same fetch keeps being recognised as productive', async () => {
    const onFetchDown = vi.fn();
    const { container } = render(
      <ReplacingList contentKey={0} onFetchDown={onFetchDown} />
    );
    const scroller = container.querySelector<HTMLElement>('[data-scroller]')!;

    await scrollToEdge(scroller, 'bottom');
    await advance(ONE_CYCLE);
    await advanceInSteps(2000);

    expect(onFetchDown.mock.calls.length).toBeGreaterThan(1);
  });

  it('is threaded through the component too', async () => {
    const onFetchDown = vi.fn();
    const { scroller, rerender } = await renderList({
      initialRows: FULL_LIST,
      emptyPages: true,
      contentKey: 'page-1',
      onFetchDown,
    });

    await scrollToEdge(scroller, 'bottom');
    await advance(ONE_CYCLE);
    expect(onFetchDown).toHaveBeenCalledTimes(1);

    // Same geometry, same count — only the token moved.
    await rerender({ contentKey: 'page-2' });
    await scrollToEdge(scroller, 'bottom');
    await advance(ONE_CYCLE);

    expect(onFetchDown).toHaveBeenCalledTimes(2);
  });

  it('an unchanged key does not reopen the guard', async () => {
    const onFetchDown = vi.fn();
    const { scroller, rerender } = await renderList({
      initialRows: FULL_LIST,
      emptyPages: true,
      contentKey: 'page-1',
      onFetchDown,
    });

    await scrollToEdge(scroller, 'bottom');
    await advance(ONE_CYCLE);
    onFetchDown.mockClear();

    await rerender({ contentKey: 'page-1' });
    await advanceInSteps(2000);

    expect(onFetchDown).not.toHaveBeenCalled();
  });

  // The nested-wrapper case: items under <tbody> are invisible to the DOM
  // fallback, so a count or a key has to come from the data.
  it('rescues a nested structure the DOM fallback cannot see through', async () => {
    const onFetchDown = vi.fn();

    const NestedList = () => {
      const [rows, setRows] = useState(1);

      const fetchDown = useCallback(async () => {
        onFetchDown();
        await new Promise((resolve) => setTimeout(resolve, 20));
        setRows((current) => current + 1);
      }, []);

      // Deliberately no itemCount: only a contentKey.
      const { ref } = useAsyncList({ fetchDown, contentKey: rows });

      return (
        <div data-scroller ref={ref}>
          <table>
            <thead>
              <tr>
                <th>h</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: rows }, (_, index) => (
                <tr data-row key={index}>
                  <td>{index}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    };

    const { container } = render(<NestedList />);
    await advanceInSteps(3000);

    const scroller = container.querySelector<HTMLElement>('[data-scroller]')!;

    // <table> always has exactly two children, so without the key this would
    // have stalled on the first page.
    expect(onFetchDown.mock.calls.length).toBeGreaterThan(3);
    expect(scroller.querySelectorAll('[data-row]').length).toBeGreaterThan(3);
    expect(scroller.scrollHeight).toBeGreaterThan(3 * ROW_HEIGHT);
  });
});

describe('missing itemCount warning', () => {
  it('warns once, naming the option, when the count has to be guessed', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    try {
      const Bare = () => {
        const { ref } = useAsyncList({ fetchDown: async () => {} });
        return (
          <div data-scroller ref={ref}>
            <div>
              <div data-row>row</div>
            </div>
          </div>
        );
      };

      render(<Bare />);
      await advance(400);

      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]?.[0])).toContain('itemCount');
    } finally {
      process.env.NODE_ENV = previous;
      warn.mockRestore();
    }
  });

  it('stays quiet when itemCount is supplied', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    try {
      const WithCount = () => {
        const { ref } = useAsyncList({
          fetchDown: async () => {},
          itemCount: 1,
        });
        return (
          <div data-scroller ref={ref}>
            <div>
              <div data-row>row</div>
            </div>
          </div>
        );
      };

      render(<WithCount />);
      await advance(400);

      expect(warn).not.toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = previous;
      warn.mockRestore();
    }
  });

  it('stays quiet when a contentKey is supplied instead', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    try {
      const WithKey = () => {
        const { ref } = useAsyncList({
          fetchDown: async () => {},
          contentKey: 'a',
        });
        return (
          <div data-scroller ref={ref}>
            <div>
              <div data-row>row</div>
            </div>
          </div>
        );
      };

      render(<WithKey />);
      await advance(400);

      expect(warn).not.toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = previous;
      warn.mockRestore();
    }
  });
});
