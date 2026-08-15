import { useCallback, useRef, type Ref } from 'react';

import { useIsomorphicLayoutEffect } from './useIsomorphicLayoutEffect';

const assign = <T>(
  targets: readonly (Ref<T> | undefined | null)[],
  node: T | null
) => {
  for (const target of targets) {
    if (!target) {
      continue;
    }

    if (typeof target === 'function') {
      target(node);
    } else {
      (target as { current: T | null }).current = node;
    }
  }
};

/**
 * Combines several refs into one callback ref, so a single DOM node can be
 * exposed to a forwarded ref and tracked internally at the same time.
 *
 * The returned callback is **stable for the lifetime of the component**, which
 * matters more than it looks. React detaches and reattaches a callback ref
 * whenever its identity changes, so a merged ref rebuilt on every render — the
 * obvious `useCallback(fn, refs)` implementation — would flap every time a
 * consumer wrote `ref={(node) => …}` inline. Each flap called our internal
 * tracker with `null` and then the node again, which meant two extra renders and
 * a scroll listener torn down and resubscribed, on every parent render.
 *
 * Keeping the callback stable means React never does that. The cost is that we
 * have to hand the node over ourselves when the ref list changes, which is what
 * the effect below does: clear the refs that left, populate the ones that
 * arrived.
 */
export const useMergedRef = <T>(
  ...refs: (Ref<T> | undefined | null)[]
): ((node: T | null) => void) => {
  const nodeRef = useRef<T | null>(null);
  const refsRef = useRef(refs);

  useIsomorphicLayoutEffect(() => {
    const previous = refsRef.current;
    const hasChanged =
      previous.length !== refs.length ||
      refs.some((ref, index) => ref !== previous[index]);

    if (!hasChanged) {
      return;
    }

    // Only the refs that are genuinely gone get cleared. A ref present in both
    // lists must never see `null`, or a stable internal tracker would be
    // knocked out by an unrelated inline ref changing identity next to it.
    assign(
      previous.filter((ref) => ref && !refs.includes(ref)),
      null
    );

    refsRef.current = refs;
    assign(refs, nodeRef.current);
  });

  return useCallback((node: T | null) => {
    nodeRef.current = node;
    assign(refsRef.current, node);
  }, []);
};
