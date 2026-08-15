import { describe, expect, it } from 'vitest';

import { cx } from '../src/utils/cx';

describe('cx', () => {
  it('joins truthy values', () => {
    expect(cx('a', 'b', 'c')).toBe('a b c');
  });

  it('drops falsy values, which is how conditional classes are written', () => {
    expect(cx('a', false, null, undefined, '', 'b')).toBe('a b');
  });

  // An empty string would render as class="" on the element.
  it('returns undefined when nothing survives', () => {
    expect(cx()).toBeUndefined();
    expect(cx(false, null, undefined, '')).toBeUndefined();
  });

  it('keeps a zero, which is a legitimate class name fragment', () => {
    expect(cx(0)).toBe('0');
  });
});
