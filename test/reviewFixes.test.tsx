import { act, render } from '@testing-library/react';
import { useCallback, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { AsyncList } from '../src/AsyncList';
import { advance, advanceInSteps, renderList, scrollToEdge } from './harness';
import { ROW_HEIGHT } from './layout';

const rows = (count: number) =>
  Array.from({ length: count }, (_, index) => <div data-row key={index} />);

/** Gives the scrollbar something to draw a thumb for. */
const makeScrollable = (container: HTMLElement) => {
  const scroller = container.querySelector<HTMLElement>('.react-async-list')!;
  const track = container.querySelector<HTMLElement>(
    '.react-async-list-scrollbar__track'
  )!;

  Object.defineProperty(track, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ height: 200, top: 0, bottom: 200, left: 0, right: 6 }),
  });

  return scroller;
};

describe('a drag that outlives the component', () => {
  /**
   * The listeners live on `document` and the cursor styles live on `body`, so
   * unmounting mid-drag used to leave the whole page with `cursor: grabbing`
   * and `user-select: none` — for the rest of the session, with no way back.
   */
  it('releases the body styles when the list unmounts mid-drag', async () => {
    const { container, unmount } = render(
      <AsyncList scrollbar="custom">{rows(30)}</AsyncList>
    );
    makeScrollable(container);
    const thumb = container.querySelector<HTMLElement>(
      '.react-async-list-scrollbar__thumb'
    )!;

    await act(async () => {
      thumb.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true, clientY: 10 })
      );
    });
    await act(async () => {
      document.dispatchEvent(
        new MouseEvent('mousemove', { bubbles: true, clientY: 60 })
      );
    });

    expect(document.body.style.cursor).toBe('grabbing');

    unmount();

    expect(document.body.style.cursor).toBe('');
    expect(document.body.style.userSelect).toBe('');
  });

  it('detaches the document listeners on unmount', async () => {
    const { container, unmount } = render(
      <AsyncList scrollbar="custom">{rows(30)}</AsyncList>
    );
    const scroller = makeScrollable(container);
    const thumb = container.querySelector<HTMLElement>(
      '.react-async-list-scrollbar__thumb'
    )!;

    await act(async () => {
      thumb.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true, clientY: 10 })
      );
    });

    unmount();
    const after = scroller.scrollTop;

    await act(async () => {
      document.dispatchEvent(
        new MouseEvent('mousemove', { bubbles: true, clientY: 400 })
      );
    });

    expect(scroller.scrollTop).toBe(after);
    expect(document.body.style.cursor).toBe('');
  });

  it('still cleans up on a normal mouseup', async () => {
    const { container } = render(
      <AsyncList scrollbar="custom">{rows(30)}</AsyncList>
    );
    makeScrollable(container);
    const thumb = container.querySelector<HTMLElement>(
      '.react-async-list-scrollbar__thumb'
    )!;

    await act(async () => {
      thumb.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true, clientY: 10 })
      );
      document.dispatchEvent(
        new MouseEvent('mousemove', { bubbles: true, clientY: 60 })
      );
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });

    expect(document.body.style.cursor).toBe('');
  });

  // Otherwise the page pans underneath the thumb on a touch device.
  it('cancels the default action while dragging by touch', async () => {
    const { container } = render(
      <AsyncList scrollbar="custom">{rows(30)}</AsyncList>
    );
    makeScrollable(container);
    const thumb = container.querySelector<HTMLElement>(
      '.react-async-list-scrollbar__thumb'
    )!;

    await act(async () => {
      thumb.dispatchEvent(
        new TouchEvent('touchstart', {
          bubbles: true,
          touches: [{ clientY: 10 } as unknown as Touch],
        })
      );
    });

    const move = new TouchEvent('touchmove', {
      bubbles: true,
      cancelable: true,
      touches: [{ clientY: 60 } as unknown as Touch],
    });

    await act(async () => {
      document.dispatchEvent(move);
    });

    expect(move.defaultPrevented).toBe(true);
  });
});

describe('className and style land together', () => {
  it.each(['custom', 'native', 'hidden'] as const)(
    'both go to the outermost element in %s mode',
    (scrollbar) => {
      const { container } = render(
        <AsyncList
          scrollbar={scrollbar}
          className="mine"
          style={{ height: 400 }}
        >
          {rows(3)}
        </AsyncList>
      );
      const outer = container.firstElementChild as HTMLElement;

      expect(outer.classList).toContain('mine');
      expect(outer.style.height).toBe('400px');
    }
  );

  it('does not leave style on the inner scroller in custom mode', () => {
    const { container } = render(
      <AsyncList scrollbar="custom" style={{ height: 400 }}>
        {rows(3)}
      </AsyncList>
    );
    const scroller = container.querySelector<HTMLElement>('.react-async-list')!;

    expect(scroller).not.toBe(container.firstElementChild);
    expect(scroller.style.height).toBe('');
  });
});

describe('items wrapped in a fragment', () => {
  /**
   * `Children.count` does not look inside a fragment, so this used to report a
   * permanent item count of 1: the guard never saw the list grow and stalled it
   * on the first page, without even the missing-`itemCount` warning to explain
   * why, because a count *was* supplied.
   */
  const FragmentList = ({ onFetchDown }: { onFetchDown: () => void }) => {
    const [count, setCount] = useState(1);

    const fetchDown = useCallback(async () => {
      onFetchDown();
      await new Promise((resolve) => setTimeout(resolve, 20));
      setCount((current) => current + 1);
    }, [onFetchDown]);

    return (
      <AsyncList scrollbar="native" fetchDown={fetchDown}>
        <>{rows(count)}</>
      </AsyncList>
    );
  };

  it('keeps filling when children come from a fragment', async () => {
    const onFetchDown = vi.fn();
    const { container } = render(<FragmentList onFetchDown={onFetchDown} />);

    await advanceInSteps(3000);

    const scroller = container.querySelector<HTMLElement>('.react-async-list')!;

    expect(onFetchDown.mock.calls.length).toBeGreaterThan(3);
    expect(scroller.querySelectorAll('[data-row]').length).toBeGreaterThan(3);
    expect(scroller.scrollHeight).toBeGreaterThan(3 * ROW_HEIGHT);
  });

  it('unwraps nested fragments too', () => {
    const { container } = render(
      <AsyncList scrollbar="native">
        <>
          <>{rows(5)}</>
        </>
      </AsyncList>
    );

    expect(container.querySelectorAll('[data-row]').length).toBe(5);
  });

  it('still stops once the source is disabled', async () => {
    const onFetchDown = vi.fn();
    const { scroller } = await renderList({
      initialRows: 20,
      isDisableFetchDown: true,
      onFetchDown,
    });

    await scrollToEdge(scroller, 'bottom');
    await advance(500);

    expect(onFetchDown).not.toHaveBeenCalled();
  });
});
