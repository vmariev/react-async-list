# @vmariev/react-async-list

## 1.0.1

### Patch Changes

- Documentation and package metadata only — no runtime changes.
  
  - Make the virtualizer story discoverable: it is now a feature bullet at the top
    rather than a buried subsection, and the guide states explicitly that
    `@tanstack/react-virtual` is a `devDependency` of this repository's demo, not a
    dependency of the package. Installing this still pulls in nothing but `react`.
  - Broaden the npm description and keywords so the package is findable by people
    searching for infinite scroll combined with virtualization or a headless hook.
  - Sync the version in `package-lock.json`, which had drifted from `package.json`.

## 1.0.0

First release.

The component was extracted from an internal one that had been in production for
some time, then substantially reworked: the loading engine was split out of the
markup, every third-party dependency was replaced, and a number of long-standing
defects were fixed. The prop names of the original are still accepted as
`@deprecated` aliases, so code written against it keeps compiling — see
[Coming from the original component](./README.md#coming-from-the-original-component).

### Highlights

- **`useAsyncList`** — the whole loading engine as a headless hook, so the same
  scroll maths can drive a table, a grid or a virtualizer instead of the
  component's own markup.
- **Zero runtime dependencies.** `classnames`, `p-memoize`, `@react-hook/merged-ref`,
  `lodash` and `styled-components` are all replaced by internal utilities; only
  `react` remains, as a peer (`>=18 <20`).
- **ESM + CJS + TypeScript declarations**, an `exports` map, and a stylesheet at
  `@vmariev/react-async-list/styles.css` for consumers who would rather import
  it than have it injected.
- **`scrollbar="custom" | "native" | "hidden"`**, plus `CustomScrollbar`
  exported for use on your own containers.
- **Styling hooks**: per-slot `classNames`, ten CSS custom properties, and
  `injectStyles={false}`.
- **`onError`**, so a failed fetch is observable rather than silent.
- **Escape hatches**: `itemCount` and `contentKey` for the flood guard,
  `as` for rendering the scroller as another element, and `check({ force: true })`
  for data that arrived by a route the list cannot observe.

### Defects fixed relative to the original component

- **Repeated requests at an edge.** A list parked at an edge with a live fetcher
  issued roughly three requests per second, indefinitely, with no user
  interaction: every fetch flipped loading state, which re-rendered, which
  re-ran the post-render check, which saw the same edge still in range. Now a
  fetch that returns nothing quiets that direction until the content, the
  viewport or a disable flag changes. See
  [the flood guard](./README.md#the-flood-guard).
- **Head-of-line blocking.** A single shared "is anything loading" guard meant a
  slow `fetchUp` starved `fetchDown` completely. Directions are now independent.
- **A rejected fetch wedged a direction forever.** `.then()` with no `.catch()`
  left the loading flag stuck on. Rejections now clear state, report through
  `onError`, and become retryable once the user scrolls.
- **A failing endpoint could be retried several times a second** while the list
  sat idle. Retries are now tied to the user's scroll position moving.
- **`onScroll` distances flipped meaning in reverse mode** — `top` was derived
  from the raw `scrollTop`, so in a reversed list it measured the distance from
  the _bottom_. Both values are now distances from the corresponding visual edge.
- **Reverse mode assumed a negative `scrollTop`.** The convention differs between
  engines, and hard-coding it silently inverts every write on an engine that
  disagrees. It is now measured per container. See
  [the negative `scrollTop` problem](./README.md#the-negative-scrolltop-problem).
- **A reverse list opened on the oldest item** on engines using the standard
  convention. It now anchors to the newest item everywhere.
- **Loading indicators shifted layout**, which moved the scroll position and
  retriggered the fetch they were reporting. They now overlay.
- **A parent re-rendering faster than the settle delay starved the follow-up
  check**, so a page too short to fill the viewport stalled instead of pulling
  the next one. The check is a throttle rather than a debounce.
- **A drag that outlived the component.** The custom scrollbar's thumb attached
  its listeners to `document` and removed them only on mouse-up, so unmounting
  the list mid-drag left the whole page with `cursor: grabbing` and
  `user-select: none` for the rest of the session.
- **Dragging the thumb on a touch device also panned the page**, because the
  `touchmove` listener never cancelled the default action.

### Dropped

- `styled-components`, and with it the broken `../../styled` import that made the
  original extraction impossible to compile.
- The `autoHidden` prop, which was declared but never read.
- Dead percentage-based scroll helpers and an unreferenced content component.
