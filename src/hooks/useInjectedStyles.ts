import { ASYNC_LIST_CSS, STYLE_ELEMENT_ID } from '../styles/css';
import { useIsomorphicLayoutEffect } from './useIsomorphicLayoutEffect';

/**
 * Injects the package stylesheet on first mount.
 *
 * The tag is **prepended** to `<head>`, not appended. All of the library's rules
 * are single-class selectors, so a consumer rule of equal specificity is decided
 * by source order — and a tag appended at render time would land after the
 * consumer's own stylesheet and win, which is backwards. Going in first means
 * your CSS always takes precedence.
 *
 * Idempotent: the element is keyed by id, so any number of lists share one tag.
 * It is deliberately never removed — tearing it down when the last list
 * unmounts would make styles flicker on the next mount.
 *
 * Pass `false` to opt out and import `@vmariev/react-async-list/styles.css`
 * yourself, e.g. to control ordering explicitly or to satisfy a strict CSP.
 */
export const useInjectedStyles = (enabled = true): void => {
  useIsomorphicLayoutEffect(() => {
    if (!enabled || typeof document === 'undefined') {
      return;
    }

    if (document.getElementById(STYLE_ELEMENT_ID)) {
      return;
    }

    const style = document.createElement('style');
    style.id = STYLE_ELEMENT_ID;
    style.textContent = ASYNC_LIST_CSS;
    document.head.prepend(style);
  }, [enabled]);
};
