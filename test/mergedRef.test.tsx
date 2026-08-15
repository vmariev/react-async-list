import { render } from '@testing-library/react';
import { useRef, useState, type Ref } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { AsyncList } from '../src/AsyncList';
import { useMergedRef } from '../src/hooks/useMergedRef';
import { advance, renderList, scrollToEdge } from './harness';

describe('useMergedRef', () => {
  /**
   * The whole point. React detaches and reattaches a callback ref whenever its
   * identity changes, and an unstable merged ref made that happen on every
   * parent render for anyone writing `ref={(node) => …}` inline.
   */
  it('returns the same callback across renders, even as inputs change', () => {
    const seen: ((node: HTMLDivElement | null) => void)[] = [];

    const Probe = ({ tick }: { tick: number }) => {
      // A fresh inline ref on every render, the common consumer style.
      const merged = useMergedRef<HTMLDivElement>((_node) => void tick);
      seen.push(merged);
      return <div ref={merged} />;
    };

    const { rerender } = render(<Probe tick={0} />);
    rerender(<Probe tick={1} />);
    rerender(<Probe tick={2} />);

    expect(seen).toHaveLength(3);
    expect(new Set(seen).size).toBe(1);
  });

  it('populates every ref it is given', () => {
    const objectRef = { current: null as HTMLDivElement | null };
    const callbackRef = vi.fn();

    const Probe = () => {
      const merged = useMergedRef<HTMLDivElement>(objectRef, callbackRef);
      return <div ref={merged} data-probe />;
    };

    const { container } = render(<Probe />);
    const node = container.querySelector('[data-probe]');

    expect(objectRef.current).toBe(node);
    expect(callbackRef).toHaveBeenCalledWith(node);
  });

  it('tolerates null and undefined entries', () => {
    const objectRef = { current: null as HTMLDivElement | null };

    const Probe = () => {
      const merged = useMergedRef<HTMLDivElement>(null, objectRef, undefined);
      return <div ref={merged} data-probe />;
    };

    const { container } = render(<Probe />);

    expect(objectRef.current).toBe(container.querySelector('[data-probe]'));
  });

  it('clears refs on unmount', () => {
    const objectRef = { current: null as HTMLDivElement | null };

    const Probe = () => {
      const merged = useMergedRef<HTMLDivElement>(objectRef);
      return <div ref={merged} />;
    };

    const { unmount } = render(<Probe />);
    expect(objectRef.current).not.toBeNull();

    unmount();

    expect(objectRef.current).toBeNull();
  });

  // Because the callback is stable, React will not re-run it when the ref list
  // changes — so the hook has to move the node across itself.
  it('hands the node over when a ref is swapped out', () => {
    const first = { current: null as HTMLDivElement | null };
    const second = { current: null as HTMLDivElement | null };

    const Probe = ({ target }: { target: Ref<HTMLDivElement> }) => {
      const merged = useMergedRef<HTMLDivElement>(target);
      return <div ref={merged} data-probe />;
    };

    const { container, rerender } = render(<Probe target={first} />);
    const node = container.querySelector('[data-probe]');

    expect(first.current).toBe(node);

    rerender(<Probe target={second} />);

    expect(second.current).toBe(node);
    expect(first.current).toBeNull();
  });

  // The failure this guards against: an inline ref changing identity next to a
  // stable internal tracker must not knock the tracker out.
  it('never clears a ref that is present in both lists', () => {
    const stable = vi.fn();

    const Probe = ({ tick }: { tick: number }) => {
      const merged = useMergedRef<HTMLDivElement>(stable, () => void tick);
      return <div ref={merged} />;
    };

    const { rerender } = render(<Probe tick={0} />);
    stable.mockClear();

    rerender(<Probe tick={1} />);
    rerender(<Probe tick={2} />);

    expect(stable).not.toHaveBeenCalledWith(null);
  });
});

describe('AsyncList with an unstable forwarded ref', () => {
  it('keeps working across many parent renders', async () => {
    const onFetchDown = vi.fn();
    let latest: HTMLElement | null = null;

    const Parent = ({ tick }: { tick: number }) => (
      <AsyncList
        scrollbar="native"
        // Deliberately inline: a new identity on every render.
        ref={(node) => {
          latest = node;
        }}
        fetchDown={async () => {
          onFetchDown();
        }}
        data-tick={tick}
      >
        {Array.from({ length: 20 }, (_, index) => (
          <div data-row key={index}>
            row {index}
          </div>
        ))}
      </AsyncList>
    );

    const { container, rerender } = render(<Parent tick={0} />);
    const scroller = container.querySelector<HTMLElement>('.react-async-list')!;

    for (let tick = 1; tick <= 20; tick += 1) {
      rerender(<Parent tick={tick} />);
      await advance(10);
    }

    // The ref still points at the live scroller, not at a stale or null node.
    expect(latest).toBe(scroller);

    // And the list is still wired up: reaching the edge still loads.
    await scrollToEdge(scroller, 'bottom');
    await advance(500);

    expect(onFetchDown).toHaveBeenCalled();
  });

  it('does not lose the scroll subscription when the parent re-renders', async () => {
    const onScroll = vi.fn();
    const { scroller, rerender } = await renderList({
      initialRows: 20,
      emptyPages: true,
      onScroll,
    });

    for (let index = 0; index < 15; index += 1) {
      await rerender({ 'aria-label': `render-${index}` });
    }

    onScroll.mockClear();
    await scrollToEdge(scroller, 'bottom');

    expect(onScroll).toHaveBeenCalled();
  });
});

describe('object refs from useRef', () => {
  it('are populated and stay populated', async () => {
    const seen: (HTMLDivElement | null)[] = [];

    const Parent = ({ tick }: { tick: number }) => {
      const ref = useRef<HTMLDivElement>(null);
      const [, force] = useState(0);
      void force;
      seen.push(ref.current);

      return (
        <AsyncList scrollbar="native" ref={ref} data-tick={tick}>
          <div data-row>row</div>
        </AsyncList>
      );
    };

    const { container, rerender } = render(<Parent tick={0} />);
    rerender(<Parent tick={1} />);
    await advance(10);

    const scroller = container.querySelector('.react-async-list');

    // First render sees null (refs attach after render); later renders see the
    // node and must never see null again.
    expect(seen.slice(1).every((value) => value === scroller)).toBe(true);
  });
});
