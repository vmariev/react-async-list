import { describe, expect, it } from 'vitest';

import {
  applyExitOffset,
  clamp,
  getBottomScrollOffset,
  getMaxScrollTop,
  getTopScrollOffset,
} from '../src/utils/scroll';

/**
 * A stand-in for a scroll container. In reverse mode browsers report a negative
 * `scrollTop`, from `-maxScrollTop` at the top of the content to `0` at the
 * bottom, which is what these fixtures reproduce.
 */
const container = (
  scrollTop: number,
  scrollHeight = 1000,
  clientHeight = 200
) => ({ scrollTop, scrollHeight, clientHeight }) as HTMLElement;

describe('getMaxScrollTop', () => {
  it('is the overflow amount', () => {
    expect(getMaxScrollTop(container(0, 1000, 200))).toBe(800);
  });

  it('is zero when the content fits, never negative', () => {
    expect(getMaxScrollTop(container(0, 150, 200))).toBe(0);
  });
});

describe('offsets in normal orientation', () => {
  it('measures from the top of the content', () => {
    expect(getTopScrollOffset(container(0), false)).toBe(0);
    expect(getTopScrollOffset(container(300), false)).toBe(300);
    expect(getTopScrollOffset(container(800), false)).toBe(800);
  });

  it('measures from the bottom of the content', () => {
    expect(getBottomScrollOffset(container(0), false)).toBe(800);
    expect(getBottomScrollOffset(container(300), false)).toBe(500);
    expect(getBottomScrollOffset(container(800), false)).toBe(0);
  });
});

describe('offsets in reverse orientation', () => {
  it('treats scrollTop 0 as the bottom of the content', () => {
    expect(getBottomScrollOffset(container(0), true)).toBe(0);
    expect(getTopScrollOffset(container(0), true)).toBe(800);
  });

  it('treats -maxScrollTop as the top of the content', () => {
    expect(getTopScrollOffset(container(-800), true)).toBe(0);
    expect(getBottomScrollOffset(container(-800), true)).toBe(800);
  });

  it('reads the negative scrollTop by magnitude', () => {
    expect(getTopScrollOffset(container(-300), true)).toBe(500);
    expect(getBottomScrollOffset(container(-300), true)).toBe(300);
  });
});

describe('offsets when there is nothing to scroll', () => {
  // Both edges are "in range" here, which is what lets an under-filled list
  // keep requesting pages until it overflows.
  it('reports zero in both directions, either orientation', () => {
    const fits = container(0, 200, 200);

    expect(getTopScrollOffset(fits, false)).toBe(0);
    expect(getBottomScrollOffset(fits, false)).toBe(0);
    expect(getTopScrollOffset(fits, true)).toBe(0);
    expect(getBottomScrollOffset(fits, true)).toBe(0);
  });
});

describe('applyExitOffset', () => {
  const writable = (scrollTop: number, scrollHeight = 1000) => {
    const element = { scrollTop, scrollHeight, clientHeight: 200 };
    return element as HTMLElement;
  };

  it('leaves the position alone when already clear of the trigger zone', () => {
    const element = writable(500);

    applyExitOffset(element, false, 'down', 100, 50);

    expect(element.scrollTop).toBe(500);
  });

  it('parks the given distance from the bottom edge', () => {
    const element = writable(760); // bottomOffset 40, inside a 100px zone

    applyExitOffset(element, false, 'down', 100, 50);

    expect(element.scrollTop).toBe(750); // maxScrollTop 800 - 50
  });

  it('parks the given distance from the top edge', () => {
    const element = writable(10);

    applyExitOffset(element, false, 'up', 100, 50);

    expect(element.scrollTop).toBe(50);
  });

  it('writes a negative offset in reverse orientation', () => {
    const element = writable(-5); // bottomOffset 5 in reverse

    applyExitOffset(element, true, 'down', 100, 1);

    expect(element.scrollTop).toBe(-1);
  });

  it('parks at the reversed top edge', () => {
    const element = writable(-780); // topOffset 20 in reverse

    applyExitOffset(element, true, 'up', 100, 50);

    expect(element.scrollTop).toBe(-750); // -(800 - 50)
  });

  it('clamps an exit offset larger than the scrollable distance', () => {
    const element = writable(0, 250); // maxScrollTop 50

    applyExitOffset(element, false, 'down', 100, 5000);

    expect(element.scrollTop).toBe(0); // 50 - min(5000, 50)
  });

  // The prop is often misread as a way to stop repeated requests. It is not:
  // a small exit offset lands the list back inside the trigger zone.
  it('lands inside the trigger zone when the exit offset is smaller than it', () => {
    const element = writable(795);

    applyExitOffset(element, false, 'down', 400, 1);

    expect(getBottomScrollOffset(element, false)).toBe(1);
    expect(getBottomScrollOffset(element, false)).toBeLessThan(400);
  });
});

describe('clamp', () => {
  it('bounds a value on both sides', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(50, 0, 10)).toBe(10);
  });
});
