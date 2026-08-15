import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AsyncList } from '../src/AsyncList';
import { STYLE_ELEMENT_ID } from '../src/styles/css';
import { advance, renderList, scrollToEdge } from './harness';

const rows = (count: number) =>
  Array.from({ length: count }, (_, index) => (
    <div data-row key={index}>
      row {index}
    </div>
  ));

describe('markup and class names', () => {
  it('renders children inside the content wrapper', () => {
    const { container } = render(
      <AsyncList scrollbar="native">{rows(3)}</AsyncList>
    );

    const content = container.querySelector('.react-async-list__content');

    expect(content).not.toBeNull();
    expect(content!.querySelectorAll('[data-row]')).toHaveLength(3);
  });

  it('marks reverse mode on the scroller', () => {
    const { container } = render(
      <AsyncList scrollbar="native" isReverse>
        {rows(1)}
      </AsyncList>
    );

    expect(container.querySelector('.react-async-list_reverse')).not.toBeNull();
  });

  it.each([
    ['custom', true],
    ['hidden', true],
    ['native', false],
  ] as const)(
    'scrollbar=%s hides the native bar: %s',
    (scrollbar, shouldHide) => {
      const { container } = render(
        <AsyncList scrollbar={scrollbar}>{rows(1)}</AsyncList>
      );
      const scroller = container.querySelector('.react-async-list');

      expect(
        scroller!.classList.contains('react-async-list_hide-native-scrollbar')
      ).toBe(shouldHide);
    }
  );

  it('renders the custom scrollbar only in custom mode', () => {
    const custom = render(<AsyncList scrollbar="custom">{rows(1)}</AsyncList>);
    expect(
      custom.container.querySelector('.react-async-list-scrollbar__thumb')
    ).not.toBeNull();

    const native = render(<AsyncList scrollbar="native">{rows(1)}</AsyncList>);
    expect(
      native.container.querySelector('.react-async-list-scrollbar__thumb')
    ).toBeNull();
  });

  it('puts className on the outermost element in every scrollbar mode', () => {
    const custom = render(
      <AsyncList scrollbar="custom" className="mine">
        {rows(1)}
      </AsyncList>
    );
    expect(custom.container.firstElementChild).toHaveProperty('className');
    expect(custom.container.firstElementChild!.classList).toContain('mine');

    const native = render(
      <AsyncList scrollbar="native" className="mine">
        {rows(1)}
      </AsyncList>
    );
    expect(native.container.firstElementChild!.classList).toContain('mine');
  });

  it('applies each slot class name', () => {
    const { container } = render(
      <AsyncList
        scrollbar="custom"
        classNames={{
          root: 'slot-root',
          scroller: 'slot-scroller',
          content: 'slot-content',
          scrollbar: 'slot-bar',
          track: 'slot-track',
          thumb: 'slot-thumb',
        }}
      >
        {rows(1)}
      </AsyncList>
    );

    for (const slot of [
      'slot-root',
      'slot-scroller',
      'slot-content',
      'slot-bar',
      'slot-track',
      'slot-thumb',
    ]) {
      expect(container.querySelector(`.${slot}`)).not.toBeNull();
    }
  });

  it('spreads unknown props onto the scroller', () => {
    const { container } = render(
      <AsyncList scrollbar="native" id="list" role="log" data-testid="x">
        {rows(1)}
      </AsyncList>
    );
    const scroller = container.querySelector('.react-async-list')!;

    expect(scroller.id).toBe('list');
    expect(scroller.getAttribute('role')).toBe('log');
    expect(scroller.getAttribute('data-testid')).toBe('x');
  });

  it('renders the scroller as another element via `as`', () => {
    const { container } = render(
      <AsyncList scrollbar="native" as="section">
        {rows(1)}
      </AsyncList>
    );

    expect(container.querySelector('section.react-async-list')).not.toBeNull();
  });

  it('forwards ref to the scrolling element', () => {
    const ref = { current: null as HTMLDivElement | null };

    render(
      <AsyncList scrollbar="native" ref={ref}>
        {rows(1)}
      </AsyncList>
    );

    expect(ref.current).not.toBeNull();
    expect(ref.current!.classList).toContain('react-async-list');
  });
});

describe('deprecated prop aliases', () => {
  it('maps isHiddenScroll to scrollbar="hidden"', () => {
    const { container } = render(
      <AsyncList isHiddenScroll>{rows(1)}</AsyncList>
    );

    expect(
      container.querySelector('.react-async-list-scrollbar__thumb')
    ).toBeNull();
    expect(
      container
        .querySelector('.react-async-list')!
        .classList.contains('react-async-list_hide-native-scrollbar')
    ).toBe(true);
  });

  it('maps contentElementId to id', () => {
    const { container } = render(
      <AsyncList scrollbar="native" contentElementId="legacy">
        {rows(1)}
      </AsyncList>
    );

    expect(container.querySelector('.react-async-list')!.id).toBe('legacy');
  });

  it('maps deathZone and scrollZoneExitPosition to exitOffset', async () => {
    const viaDeathZone = await renderList({
      initialRows: 20,
      isReverse: true,
      deathZone: 1,
      emptyPages: true,
    });

    await scrollToEdge(viaDeathZone.scroller, 'bottom', true);
    await advance(500);

    expect(viaDeathZone.layout.scrollTop).toBe(-1);
  });

  it('prefers the new name when both are given', async () => {
    const { scroller, layout } = await renderList({
      initialRows: 20,
      isReverse: true,
      exitOffset: 5,
      deathZone: 1,
      emptyPages: true,
    });

    await scrollToEdge(scroller, 'bottom', true);
    await advance(500);

    expect(layout.scrollTop).toBe(-5);
  });
});

describe('loading indicators', () => {
  it('shows a loader only while that direction is loading', async () => {
    const { scroller } = await renderList({
      initialRows: 20,
      fetchLatencyMs: 5000,
    });

    expect(scroller.querySelector('.react-async-list__loader')).toBeNull();

    await scrollToEdge(scroller, 'bottom');
    await advance(100);

    expect(
      scroller.querySelector('.react-async-list__loader_down')
    ).not.toBeNull();

    await advance(6000);

    expect(scroller.querySelector('.react-async-list__loader')).toBeNull();
  });

  it('passes the direction and class name to a custom loader', async () => {
    const CustomLoader = vi.fn(
      ({ className, direction }: { className?: string; direction: string }) => (
        <div className={className} data-direction={direction} />
      )
    );

    const { scroller } = await renderList({
      initialRows: 20,
      fetchLatencyMs: 5000,
      CustomLoader,
    });

    await scrollToEdge(scroller, 'bottom');
    await advance(100);

    const loader = scroller.querySelector('[data-direction]');

    expect(loader).not.toBeNull();
    expect(loader!.getAttribute('data-direction')).toBe('down');
    expect(loader!.classList).toContain('react-async-list__loader');
  });
});

describe('style injection', () => {
  it('injects one stylesheet, prepended so consumer CSS wins on ties', () => {
    render(<AsyncList scrollbar="native">{rows(1)}</AsyncList>);
    render(<AsyncList scrollbar="native">{rows(1)}</AsyncList>);

    const tags = document.querySelectorAll(`#${STYLE_ELEMENT_ID}`);

    expect(tags).toHaveLength(1);
    expect(document.head.firstElementChild).toBe(tags[0]);
  });

  it('skips injection when injectStyles is false', () => {
    render(
      <AsyncList scrollbar="native" injectStyles={false}>
        {rows(1)}
      </AsyncList>
    );

    expect(document.getElementById(STYLE_ELEMENT_ID)).toBeNull();
  });
});
