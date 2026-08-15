# @vmariev/react-async-list

A scroll container for React that loads more items as either edge comes into view.

Point it at an async function, give it a bounded height, and it handles the rest: trigger zones, concurrency guards, loading indicators, and the awkward parts of bottom-anchored (chat-style) lists.

- **Zero runtime dependencies.** Only `react` as a peer.
- **Bidirectional.** Load older items at the top, newer at the bottom, or both — each direction independent.
- **Won't flood your API.** A fetch that comes back empty stops that direction until something changes. [Details](#the-flood-guard).
- **Reverse mode** for chat transcripts — pinned to the bottom, new items don't move the view.
- **No setup.** Styles are injected at runtime; there's no CSS import to remember.
- **Works with a virtualizer.** `useAsyncList` gives you the loading engine without any markup, so it drives a `<table>`, a grid, or [`@tanstack/react-virtual`](https://tanstack.com/virtual) / `react-window` / `react-virtuoso` — none of which this package depends on. [Show me](#with-a-virtualizer).
- **Optional custom scrollbar** that looks the same on every platform.
- ESM + CJS + TypeScript declarations. React 18 and 19.

**[Try it on CodeSandbox →](https://codesandbox.io/p/sandbox/zealous-blackwell-573gfd)** — every example below, running.

---

## Contents

- [Install](#install)
- [Quick start](#quick-start)
- [The container needs a bounded height](#the-container-needs-a-bounded-height)
- [Loading in both directions](#loading-in-both-directions)
- [Reverse (chat) mode](#reverse-chat-mode)
  - [The negative `scrollTop` problem](#the-negative-scrolltop-problem)
- [How loading is triggered](#how-loading-is-triggered)
  - [The flood guard](#the-flood-guard)
  - [When the signature cannot see the change](#when-the-signature-cannot-see-the-change)
- [Error handling](#error-handling)
- [Scrollbar modes](#scrollbar-modes)
- [Custom loaders](#custom-loaders)
- [Styling](#styling)
- [Headless: `useAsyncList`](#headless-useasynclist)
  - [With a virtualizer](#with-a-virtualizer)
- [Imperative access](#imperative-access)
- [Server-side rendering](#server-side-rendering)
- [API reference](#api-reference)
- [Coming from the original component](#coming-from-the-original-component)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [License](#license)

---

## Install

```bash
npm install @vmariev/react-async-list
```

```bash
yarn add @vmariev/react-async-list
```

`react` is a peer dependency (`>=18 <20`). Nothing else is required — no CSS import, no style library, no polyfills.

## Quick start

```tsx
import { useCallback, useState } from 'react';
import { AsyncList } from '@vmariev/react-async-list';

export const UserList = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  // Resolve only once your state has been updated — the component uses the
  // resolution of this promise to decide it is safe to consider loading again.
  const fetchDown = useCallback(async () => {
    const page = await api.getUsers({ cursor });

    setUsers((current) => [...current, ...page.items]);
    setCursor(page.nextCursor);
    setHasMore(Boolean(page.nextCursor));
  }, [cursor]);

  return (
    <AsyncList
      style={{ height: 400 }}
      fetchDown={fetchDown}
      isDisableFetchDown={!hasMore}
    >
      {users.map((user) => (
        <UserRow key={user.id} user={user} />
      ))}
    </AsyncList>
  );
};
```

[Open it in a sandbox](https://codesandbox.io/p/sandbox/zealous-blackwell-573gfd) if you would rather poke at it than read.

Two rules cover almost all usage:

1. **`fetchDown` must resolve after your state update**, so `await` your `setState` data flow rather than firing and forgetting.
2. **Set `isDisableFetchDown` when the source is exhausted.** Without it the list keeps asking, and your API keeps answering with an empty page.

## The container needs a bounded height

`AsyncList` is a scroll container. Like any scroll container, it only scrolls if something limits its height — otherwise it grows to fit its content, never overflows, and therefore never triggers a fetch.

```tsx
// ✅ fixed height
<AsyncList style={{ height: 400 }} … />

// ✅ capped height, shrinks for short lists
<AsyncList style={{ maxHeight: '60vh' }} … />

// ✅ fills a constrained flex parent
<div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
  <Header />
  <AsyncList … />   {/* flex-grow: 1 and min-height: 0 are already set */}
</div>

// ❌ no height constraint anywhere — grows forever, never scrolls
<div>
  <AsyncList … />
</div>
```

If your list loads one page and then stops, this is the first thing to check. See [Troubleshooting](#troubleshooting).

## Loading in both directions

Pass both fetchers. Each direction has its own loading state, its own cooldown, and its own disable flag, so a slow `fetchUp` never blocks `fetchDown`.

```tsx
<AsyncList
  style={{ height: 500 }}
  fetchUp={loadOlder}
  fetchDown={loadNewer}
  isDisableFetchUp={!hasOlder}
  isDisableFetchDown={!hasNewer}
>
  {items.map((item) => (
    <Row key={item.id} item={item} />
  ))}
</AsyncList>
```

One thing to know: a two-way list mounted at `scrollTop: 0` **is** at its top edge, so it will immediately start loading older pages. If you're opening onto a specific item, scroll there before the user sees the list:

```tsx
const listRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  const list = listRef.current;
  if (list) {
    list.scrollTop = (list.scrollHeight - list.clientHeight) / 2;
  }
}, []);

<AsyncList ref={listRef} fetchUp={loadOlder} fetchDown={loadNewer}>
  …
</AsyncList>;
```

## Reverse (chat) mode

`isReverse` anchors the list to its bottom edge, which is what a message transcript wants: the newest item sits at the bottom, appending a message doesn't shift the view, and scrolling **up** loads history.

```tsx
<AsyncList
  style={{ height: '100%' }}
  isReverse
  fetchUp={loadOlderMessages}
  isDisableFetchUp={!hasHistory}
  exitOffset={1}
>
  {messages.map((message) => (
    <MessageBubble key={message.id} message={message} />
  ))}
</AsyncList>
```

Children stay in normal order — oldest first, newest last. Reverse mode changes the _anchoring_, not your data.

`exitOffset={1}` keeps the list glued to the bottom across a load, so an incoming message can't leave the view hovering one pixel off the edge. See [`exitOffset`](#exitoffset) for what that prop actually does.

### The negative `scrollTop` problem

Reverse mode is `flex-direction: column-reverse`, and that changes where the scroll origin sits. Most engines — Chromium among them — then report `scrollTop` as **negative**: `-maxScrollTop` at the visual top through `0` at the visual bottom. Engines using the standard convention report `0 … maxScrollTop` with `0` at the visual top, which is the exact opposite.

Assuming either one is a bug waiting to surface in somebody else's browser: every write would be silently inverted. So the library doesn't assume. On mount it **probes the container** — assigns `-1` and checks whether it sticks — and normalises everything to a single quantity: _distance from the visual top_. The probe writes and restores `scrollTop` inside one task, so nothing is painted in between, it runs once per element, and non-reversed containers are never probed at all.

What this means for you:

- `onScroll`'s `top` and `bottom` are always distances from the visual top and bottom, in both orientations. `bottom: 0` means "at the newest item" in a chat.
- A reverse list starts at the newest item on every engine. Where the convention would otherwise open it on the oldest message, the list anchors itself once, as soon as there is something to scroll.
- The custom scrollbar needs no orientation special-casing; the thumb is positioned from the top in both modes.
- If you touch `scrollTop` directly, you're back to raw engine values and the sign is yours to handle. Prefer `useAsyncList`'s `scrollToTop` / `scrollToBottom`, or the exported `getTopScrollOffset` / `setTopScrollOffset` helpers, all of which speak in visual distances.

```tsx
import {
  getTopScrollOffset,
  setTopScrollOffset,
} from '@vmariev/react-async-list';

// Engine-agnostic, orientation-agnostic.
const fromTop = getTopScrollOffset(element, isReverse);
setTopScrollOffset(element, isReverse, fromTop + 100);
```

`detectScrollRegime(element, isReverse)` is exported too, if you need to know which convention you're on.

## How loading is triggered

On every scroll event the component measures how far each edge is from the viewport, in pixels:

```
┌─────────────────────────────┐
│  ← topOffset                │  fetchUp fires when topOffset ≤ triggerOffset
│ ░░░░░░░ trigger zone ░░░░░░ │
│                             │
│        visible rows         │
│                             │
│ ░░░░░░░ trigger zone ░░░░░░ │
│  ← bottomOffset             │  fetchDown fires when bottomOffset ≤ triggerOffset
└─────────────────────────────┘
```

`triggerOffset` defaults to `400`px. Raise it to prefetch earlier (smoother, more requests), lower it to fetch later (fewer requests, more chance of the user hitting the end).

Each direction is evaluated independently, so a slow `fetchUp` can't hold up `fetchDown`.

### The flood guard

The single most important property: **a fetch that returns nothing stops that direction from being retried until something actually changes.**

Without this rule, an infinite-scroll list is easy to turn into a denial-of-service attack on your own API. The failure mode is subtle and needs no user interaction at all:

```
parked at the edge → fetch → returns nothing (normal, you're at the end)
                   → loading state flips → re-render → re-check
                   → still at the edge → fetch → …forever, ~3 requests/second
```

This library tracks a _content signature_ per direction — the container's scroll height, its client height, how many items are rendered, and your `contentKey` if you supply one. An attempt is skipped when the signature matches the last attempt in the same direction, because the same question can't get a different answer. Re-attempting becomes possible again as soon as:

- the content or the viewport changes size, or items are added or removed;
- you flip an `isDisableFetch*` flag;
- the previous attempt **failed** and the user has since scrolled somewhere else;
- you call `check({ force: true })` from `useAsyncList`.

The item count is part of the signature on purpose. Until a list overflows, `scrollHeight` equals `clientHeight` no matter how many rows you add, so heights alone would report "nothing changed" and stall a list that is still filling up.

`AsyncList` counts your `children` for this, unwrapping fragments on the way — `Children.count` does not look inside one, so `<AsyncList><>{rows.map(…)}</></AsyncList>` would otherwise report a permanent count of `1` and stall the list on its first page.

### When the signature cannot see the change

The guard notices new data through geometry and the item count. A fetch that
**replaces** items rather than appending them — a refresh, a filter change — can
return the same number of items at the same height, moving neither. The guard
then concludes nothing happened and stops loading.

`contentKey` closes that: any value that changes when the data changes.

```tsx
<AsyncList
  fetchDown={refresh}
  contentKey={cursor} // or a page number, or `${rows[0]?.id}:${rows.at(-1)?.id}`
>
  …
</AsyncList>
```

It is also the simplest fix when items sit under a wrapper the DOM cannot see
through — a `<table>`, a virtualizer — and you would rather not thread an
`itemCount` through.

Two details worth knowing, because both are easy to get wrong:

- The count comes from your `children`, not from counting DOM nodes. A loading indicator is a DOM child too, so a DOM-derived count would shift as the spinner mounts and unmounts — and a check landing in that window would see a "changed" signature and allow a repeat fetch against identical data.
- Swapping the `fetchUp`/`fetchDown` function does **not** reopen the guard. Inline `fetchDown={async () => …}` gets a fresh identity on every render, and since fetching causes renders, reopening on identity would clear the guard continuously and bring the flood straight back. If the cursor really moved, items were added, so the signature already differs.

Three further guards sit underneath, each covering a different double-fire path:

| Guard                                            | Stops                                                                  |
| ------------------------------------------------ | ---------------------------------------------------------------------- |
| Per-direction in-flight flag (synchronous)       | A burst of scroll events starting the same fetch twice within one tick |
| Per-direction cooldown (`loadCooldownMs`, 200ms) | Two fetches in the same direction landing back to back                 |
| Content signature                                | Repeating a request that already came back empty                       |

Re-checks are triggered by a render (throttled to at most one per `settleDelayMs`, so a parent re-rendering faster than that can't starve it) and by a `ResizeObserver` on the container and its content. That combination is what makes a page too short to fill the viewport pull in the next one instead of stalling.

If you still want a belt-and-braces stop, set `isDisableFetchDown` when your API reports no next page. It's the clearest signal and it short-circuits everything above.

### `exitOffset`

By default the component **never moves your scroll position**. `exitOffset` opts into parking it a fixed number of pixels from the edge across a fetch.

Its real use is the chat case: `exitOffset={1}` pins the list _to_ the bottom edge while history loads, so an arriving message can't leave the view hovering just off the edge.

A common misreading — worth stating because the upstream name for this was `moveScrollOutsideTriggerZone` — is that a small `exitOffset` prevents repeated requests. It does not: `0` and `1` are both well inside the default 400px trigger zone, so neither escapes it. Repeated requests are handled by [the flood guard](#the-flood-guard), not by this prop. Setting `exitOffset` above `triggerOffset` does move the list clear of the zone, but at the cost of a visible jump, and it's rarely what you want.

Leave it unset for ordinary lists.

## Error handling

If `fetchUp` or `fetchDown` rejects, the loading state is cleared and that direction stays usable. Nothing wedges.

Retrying is deliberately tied to the user: the direction reopens once the scroll position has **moved** from where the failure happened. Scroll events that don't move the position — the ones a wheel gesture keeps firing at the very end of a list — don't count. Without that rule a broken endpoint would be retried several times a second for as long as it stayed broken, with the list sitting idle.

So a recovered endpoint is picked up when the user scrolls away and back. To retry immediately, either toggle `isDisableFetchDown` off and on, or call `check({ force: true })` from `useAsyncList`.

Pass `onError` to react to the failure. Without it, the error is logged to the console rather than swallowed or left as an unhandled rejection.

```tsx
<AsyncList
  fetchDown={fetchDown}
  onError={(error, direction) => {
    toast.error(`Could not load more (${direction})`);
    reportError(error);
  }}
>
  …
</AsyncList>
```

To stop retrying after a failure, set `isDisableFetchDown` in your handler and offer the user a retry control.

## Scrollbar modes

```tsx
<AsyncList scrollbar="custom" … />   {/* default */}
<AsyncList scrollbar="native" … />
<AsyncList scrollbar="hidden" … />
```

| Mode     | Behaviour                                                                                                                                                             |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `custom` | Native bar hidden, a styleable bar drawn over the content. Identical on every platform, supports drag and click-to-page, hides itself when there's nothing to scroll. |
| `native` | The browser's own scrollbar. Lightest option — no extra wrapper element, no `ResizeObserver`.                                                                         |
| `hidden` | No visible scrollbar; the list still scrolls by wheel, touch, and keyboard.                                                                                           |

`custom` adds one wrapper element around the scroller and observes its size. If you don't need a consistent look, `native` is cheaper.

## Custom loaders

`CustomLoader` replaces the built-in spinner. It receives the `className` to apply — which carries the positioning that keeps the loader from shifting layout — plus the edge it's rendered at.

```tsx
import {
  AsyncList,
  type AsyncListLoaderProps,
} from '@vmariev/react-async-list';

const MyLoader = ({ className, direction }: AsyncListLoaderProps) => (
  <div className={className}>
    {direction === 'up' ? 'Loading history…' : 'Loading more…'}
  </div>
);

<AsyncList CustomLoader={MyLoader} fetchDown={fetchDown}>
  …
</AsyncList>;
```

Always spread the given `className` onto your outermost element. The loaders are absolutely positioned on purpose: one that changed the content height would move the scroll position and retrigger the very fetch it's reporting.

## Styling

The stylesheet is injected into `<head>` on first mount — **prepended**, so your own CSS always wins on ties. Every library selector is a single class, so you never need `!important` or specificity tricks.

### CSS custom properties

The preferred route for colours and sizes. Set them on any ancestor:

```css
.my-chat {
  --react-async-list-thumb-color: rgb(59 130 246 / 45%);
  --react-async-list-thumb-color-hover: rgb(59 130 246 / 80%);
  --react-async-list-thumb-radius: 4px;
  --react-async-list-scrollbar-width: 8px;
  --react-async-list-loader-color: #3b82f6;
}
```

| Variable                               | Default                     |
| -------------------------------------- | --------------------------- |
| `--react-async-list-thumb-color`       | `hsl(218deg 54% 20% / 15%)` |
| `--react-async-list-thumb-color-hover` | `hsl(218deg 54% 20% / 28%)` |
| `--react-async-list-thumb-radius`      | `100px`                     |
| `--react-async-list-track-color`       | `none`                      |
| `--react-async-list-scrollbar-width`   | `6px`                       |
| `--react-async-list-scrollbar-inset`   | `6px`                       |
| `--react-async-list-loader-size`       | `20px`                      |
| `--react-async-list-loader-color`      | `currentColor`              |
| `--react-async-list-loader-duration`   | `1.2s`                      |
| `--react-async-list-loader-inset`      | `5px`                       |

### Slot class names

For anything the variables don't cover, target a slot:

```tsx
<AsyncList
  className="my-list"
  classNames={{
    scroller: 'my-scroller',
    content: 'my-content',
    loader: 'my-loader',
    thumb: 'my-thumb',
  }}
/>
```

| Slot        | Element                   |
| ----------- | ------------------------- |
| `root`      | Outermost element         |
| `scroller`  | The scrolling element     |
| `content`   | Wrapper around `children` |
| `loader`    | Both loaders              |
| `scrollbar` | Custom scrollbar bar      |
| `track`     | Custom scrollbar track    |
| `thumb`     | Custom scrollbar thumb    |

`className` (and `style`) go to the **outermost** element. In `custom` scrollbar mode that's the scrollbar wrapper, not the scroller — which is what you want, since height belongs on the outer box. Use `classNames.scroller` to reach the scrolling element itself.

This also means `styled(AsyncList)` works as expected:

```tsx
const List = styled(AsyncList)`
  max-height: 300px;
  border: 1px solid #ddd;
`;
```

### Library class names

All BEM, all prefixed:

```
react-async-list                                 scroller
react-async-list_reverse                         reverse mode
react-async-list_hide-native-scrollbar           native bar suppressed
react-async-list__content                        content wrapper
react-async-list__loader                         loader base
react-async-list__loader_up | _down              loader per edge
react-async-list-scrollbar                       custom scrollbar wrapper
react-async-list-scrollbar__viewport             the scroller, inside the wrapper
react-async-list-scrollbar__bar | __track | __thumb
react-async-list-loader                          default spinner
react-async-list-loader__item[_2 … _12]          its twelve spokes
```

### Opting out of injection

To control ordering explicitly, or under a `style-src` CSP that forbids inline styles:

```tsx
import '@vmariev/react-async-list/styles.css';

<AsyncList injectStyles={false} … />
```

## Headless: `useAsyncList`

The whole loading engine, without any markup. Use it when the DOM structure has to be yours — a `<table>`, a CSS grid, a virtualized viewport.

```tsx
import { useAsyncList } from '@vmariev/react-async-list';

const RecordTable = () => {
  const [rows, setRows] = useState<Row[]>([]);

  const fetchDown = useCallback(async () => {
    const page = await api.getRows();
    setRows((current) => [...current, ...page]);
  }, []);

  const { ref, isLoadingDown, scrollToTop, scrollToBottom } = useAsyncList({
    fetchDown,
    triggerOffset: 200,
    // Items are nested inside <tbody>, so tell the hook how many there are.
    itemCount: rows.length,
  });

  return (
    <>
      <button onClick={() => scrollToBottom({ behavior: 'smooth' })}>
        Jump to end
      </button>

      <div ref={ref} style={{ height: 400, overflowY: 'auto' }}>
        <table>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {isLoadingDown && <Spinner />}
      </div>
    </>
  );
};
```

Note you supply `overflowY: 'auto'` yourself — the hook does no styling at all.

It accepts every loading-related `AsyncList` prop, plus one the component fills in for you:

| Option      | Type     | Description                                                                                                                                                                                                                                                                                                                                  |
| ----------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `itemCount` | `number` | How many items are currently rendered. Feeds [the flood guard](#the-flood-guard), which needs it to tell a productive fetch from an empty one while the list is still under-filled. Falls back to counting the container's child elements, which is less precise if your items sit under a wrapper — as they do inside a `<table>`. Pass it. |

Returns:

| Field                           | Type                                      | Description                                                                                                                                                                  |
| ------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ref`                           | `(node: HTMLElement \| null) => void`     | Attach to your scroll container                                                                                                                                              |
| `element`                       | `HTMLElement \| null`                     | The container, once mounted                                                                                                                                                  |
| `isLoadingUp` / `isLoadingDown` | `boolean`                                 | Per-direction loading state                                                                                                                                                  |
| `check(options?)`               | `(options?: { force?: boolean }) => void` | Re-evaluate the trigger zones now. `{ force: true }` bypasses [the flood guard](#the-flood-guard), for when your data source gained items by a route the list can't observe. |
| `scrollToTop(options?)`         | `(options?: ScrollToOptions) => void`     | Correct in both orientations                                                                                                                                                 |
| `scrollToBottom(options?)`      | `(options?: ScrollToOptions) => void`     | Correct in both orientations                                                                                                                                                 |

### With a virtualizer

This library deliberately renders every child, so very long lists want a
virtualizer. Rather than building one in, pair the hook with a real one — it owns
the windowing, `useAsyncList` owns the paging.

**No virtualizer is bundled or required.** The example below uses
[`@tanstack/react-virtual`](https://tanstack.com/virtual), which appears in this
repository only as a `devDependency` for the demo; installing this package pulls
in nothing but `react`. The same shape works with `react-window`,
`react-virtuoso`, or one you wrote yourself.

```tsx
import { useCallback, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useAsyncList } from '@vmariev/react-async-list';

const ROW_HEIGHT = 40;

export const VirtualFeed = () => {
  const [rows, setRows] = useState<Row[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const fetchDown = useCallback(async () => {
    const page = await api.getRows({ after: rows.length });

    setRows((current) => [...current, ...page.items]);
    setHasMore(page.hasMore);
  }, [rows.length]);

  const { ref } = useAsyncList({
    fetchDown,
    isDisableFetchDown: !hasMore,
    // Essential here. Only a handful of rows exist in the DOM at any moment, so
    // the DOM-derived fallback would be wrong; the guard needs the real count.
    itemCount: rows.length,
  });

  const virtualizer = useVirtualizer({
    count: rows.length,
    estimateSize: () => ROW_HEIGHT,
    getScrollElement: () => scrollerRef.current,
  });

  // Both want the scroll container: ours to watch it, the virtualizer to measure
  // it. One node, two refs.
  const setScroller = useCallback(
    (node: HTMLDivElement | null) => {
      scrollerRef.current = node;
      ref(node);
    },
    [ref]
  );

  return (
    <div ref={setScroller} style={{ height: 400, overflowY: 'auto' }}>
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((item) => (
          <div
            key={item.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: item.size,
              transform: `translateY(${item.start}px)`,
            }}
          >
            {rows[item.index]?.label}
          </div>
        ))}
      </div>
    </div>
  );
};
```

Three things make this work, and each one is a trap if you skip it:

1. **Pass `itemCount`.** Virtualization means the DOM holds ~10 rows regardless of
   how many you have, so the fallback count is meaningless and the flood guard
   would either stall or misfire.
2. **Merge the refs.** Both the hook and the virtualizer need the same scroll
   element. Assign to your own ref _and_ call the hook's, as above — or use the
   exported `useMergedRef` if you prefer.
3. **The virtualizer's spacer keeps `scrollHeight` honest**, which is what the
   trigger zones measure. Don't collapse it while loading.

`AsyncList` itself is not involved — its markup would fight the virtualizer's
absolute positioning. This is exactly why the engine is available separately.

`useMergedRef` is exported for step 2, so the two-owners-one-node dance is not
yours to hand-roll:

```tsx
import { useMergedRef } from '@vmariev/react-async-list';

const setScroller = useMergedRef<HTMLDivElement>(scrollerRef, ref);
```

A working version lives in `example/demos/Virtualized.tsx` — 5000 rows paged in,
roughly fifteen of them in the DOM at any moment. Run `npm run dev` locally, or
[open the sandbox](https://codesandbox.io/p/sandbox/zealous-blackwell-573gfd).

## Imperative access

`ref` forwards to the scrolling element, so the DOM API is right there:

```tsx
const listRef = useRef<HTMLDivElement>(null);

listRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
const atBottom = listRef.current!.scrollTop === 0; // in reverse mode
```

In reverse mode `scrollTop` is negative. If you'd rather not think about that, use `useAsyncList`'s `scrollToTop` / `scrollToBottom`.

To observe scrolling, `onScroll` reports pixel distances rather than a raw event — the same numbers the trigger logic uses:

```tsx
<AsyncList
  onScroll={({ top, bottom, height }) => {
    setShowJumpButton(bottom > 800);
  }}
/>
```

## Server-side rendering

Safe to render on the server. Every `window`, `document`, `ResizeObserver`, and `requestAnimationFrame` access is guarded, and layout effects fall back to `useEffect` server-side, so there are no hydration warnings.

Nothing loads until the component mounts in a browser, so render the first page from your server data and let the list take over from there.

## API reference

### `AsyncList`

#### Loading

| Prop                 | Type                                                  | Default | Description                                                   |
| -------------------- | ----------------------------------------------------- | ------- | ------------------------------------------------------------- |
| `fetchUp`            | `() => Promise<void>`                                 | —       | Loads older/preceding items. Resolve after your state update. |
| `fetchDown`          | `() => Promise<void>`                                 | —       | Loads newer/following items. Resolve after your state update. |
| `isDisableFetchUp`   | `boolean`                                             | `false` | Stop loading upwards.                                         |
| `isDisableFetchDown` | `boolean`                                             | `false` | Stop loading downwards.                                       |
| `onError`            | `(error: unknown, direction: 'up' \| 'down') => void` | —       | A fetch rejected. Errors are logged if this is absent.        |

#### Geometry

| Prop             | Type               | Default | Description                                                                                                                                                           |
| ---------------- | ------------------ | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `isReverse`      | `boolean`          | `false` | Bottom-anchored (chat) mode.                                                                                                                                          |
| `triggerOffset`  | `number`           | `400`   | Distance in px from either edge at which a fetch starts.                                                                                                              |
| `exitOffset`     | `number`           | —       | Park the scroll position this far from the edge across a fetch. [Details](#exitoffset).                                                                               |
| `loadCooldownMs` | `number`           | `200`   | Minimum gap between two fetches in the same direction.                                                                                                                |
| `settleDelayMs`  | `number`           | `200`   | Delay before re-checking the trigger zones after a render.                                                                                                            |
| `contentKey`     | `string \| number` | —       | A token that changes when your data changes. Only needed when a fetch replaces items instead of appending them. [Details](#when-the-signature-cannot-see-the-change). |

#### Presentation

| Prop           | Type                                  | Default          | Description                                     |
| -------------- | ------------------------------------- | ---------------- | ----------------------------------------------- |
| `scrollbar`    | `'custom' \| 'native' \| 'hidden'`    | `'custom'`       | [Scrollbar modes](#scrollbar-modes).            |
| `CustomLoader` | `ComponentType<AsyncListLoaderProps>` | built-in spinner | Replace the loading indicator.                  |
| `className`    | `string`                              | —                | Applied to the outermost element.               |
| `classNames`   | `AsyncListSlots`                      | —                | [Per-slot class names](#slot-class-names).      |
| `injectStyles` | `boolean`                             | `true`           | Set `false` to import `styles.css` yourself.    |
| `as`           | `ElementType`                         | `'div'`          | Element or component to render the scroller as. |

#### Events and the rest

| Prop       | Type                                                               | Description                                                                           |
| ---------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `onScroll` | `(state: { top: number; bottom: number; height: number }) => void` | Pixel distances to each edge, plus `scrollHeight`.                                    |
| `ref`      | `Ref<HTMLDivElement>`                                              | Forwarded to the scrolling element.                                                   |
| …rest      | `ComponentPropsWithoutRef<'div'>`                                  | `id`, `style`, `role`, `tabIndex`, `aria-*`, `data-*` — all spread onto the scroller. |

### Other exports

| Export                                                                                                                                | Description                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `useAsyncList`                                                                                                                        | [The headless engine](#headless-useasynclist).                                                                                 |
| `CustomScrollbar`                                                                                                                     | The scrollbar as a standalone render-prop component, for your own containers.                                                  |
| `Loader`                                                                                                                              | The default spinner.                                                                                                           |
| `getTopScrollOffset`, `getBottomScrollOffset`, `setTopScrollOffset`, `getRawScrollTop`, `getMaxScrollTop`, `applyExitOffset`, `clamp` | The scroll maths, in visual distances rather than raw engine values.                                                           |
| `useMergedRef`                                                                                                                        | Combines several refs onto one node, stably. Needed whenever something else — a virtualizer — also wants the scroll container. |
| `detectScrollRegime`, `resetScrollRegime`                                                                                             | Which `scrollTop` convention an element uses. See [the negative `scrollTop` problem](#the-negative-scrolltop-problem).         |
| `ASYNC_LIST_CSS`, `STYLE_ELEMENT_ID`, `useInjectedStyles`                                                                             | The stylesheet, for custom injection.                                                                                          |
| `DEFAULT_TRIGGER_OFFSET`, `DEFAULT_LOAD_COOLDOWN_MS`, `DEFAULT_SETTLE_DELAY_MS`                                                       | The defaults, as constants.                                                                                                    |

Types: `AsyncListProps`, `AsyncListSlots`, `AsyncListLoaderProps`, `AsyncListScrollState`, `AsyncListScrollbarMode`, `ScrollDirection`, `ScrollRegime`, `UseAsyncListOptions`, `UseAsyncListResult`, `CustomScrollbarProps`, `CustomScrollbarRenderProps`, `CustomScrollbarSlots`, `LoaderProps`.

## Coming from the original component

This package started life as a component inside a private codebase, and was
reworked on the way out. Its prop names are still accepted, marked
`@deprecated`, so code written against the original keeps compiling while your
editor points at the replacement.

| Original                              | Here                                                                             |
| ------------------------------------- | -------------------------------------------------------------------------------- |
| `triggerTopPosition`                  | `triggerOffset`                                                                  |
| `deathZone`, `scrollZoneExitPosition` | `exitOffset`                                                                     |
| `isHiddenScroll`                      | `scrollbar="hidden"`                                                             |
| `contentElementId`                    | `id`                                                                             |
| `asyncListMix`                        | `classNames.scroller`                                                            |
| `innerRef`                            | `ref` (now points at the scrolling element)                                      |
| `onScroll(isScrolling: boolean)`      | `onScroll({ top, bottom, height })` — distances from the visual edges, see below |
| `autoHidden`                          | removed — it was never read                                                      |

Behaviour that changed, not just names:

- **`styled-components` is gone.** The original required it; this has no style
  dependency at all. You can drop it if it was only there for this component.
- **`ref` points at the scrolling element**, not an outer wrapper, so
  `ref.current.scrollTop` does what you'd expect.
- **`scrollbar` defaults to `custom`.** Pass `scrollbar="native"` for the
  browser's own bar, which is what the original effectively gave you.
- **Loaders only render while loading.** The original showed them whenever a
  fetcher was present.
- **Rejections no longer wedge a direction.** A `.then()` without a `.catch()`
  used to leave the loading flag stuck on forever.
- **Repeated requests at an edge are fixed.** A list parked at an edge with a
  live fetcher used to issue roughly three requests per second indefinitely. See
  [the flood guard](#the-flood-guard). If you were holding a scroll offset at `1`
  to work around this, you no longer need to.
- **`onScroll` distances no longer flip meaning in reverse mode.** They were
  derived from the raw `scrollTop`, so in a reversed list `top` actually measured
  the distance from the _bottom_. Both values are now distances from the
  corresponding visual edge in every orientation. If you were reading `top` in a
  chat to detect "at the newest message", read `bottom` instead.
- **Reverse mode no longer assumes a negative `scrollTop`.** The convention is
  measured per container rather than hard-coded. See
  [the negative `scrollTop` problem](#the-negative-scrolltop-problem).

## Troubleshooting

**Nothing ever loads.** The container has no height constraint, so it never scrolls. See [The container needs a bounded height](#the-container-needs-a-bounded-height).

**It loads one page and stops.** Either `fetchDown` resolved before your state updated — `await` the update path — or the new page didn't reach the trigger zone and `isDisableFetchDown` is already true.

**It fires several requests in a row / never stops loading.** [The flood guard](#the-flood-guard) should prevent this: once a fetch comes back without adding anything, that direction goes quiet until the content changes. If you're still seeing repeats, the fetches are _productive_ — each one really is adding rows — and the list is simply consuming a source that never ends. Set `isDisableFetchDown` when your API reports no next page.

One case does produce one extra request per change by design: if items arrive by another route (a websocket push, say) while the list sits at the edge, the content changed, so the guard re-opens and the list asks again. `isDisableFetch*` is the way to suppress that.

**A two-way list loads all its history on mount.** At `scrollTop: 0` it really is at the top edge. Scroll to a starting position first — see [Loading in both directions](#loading-in-both-directions).

**Duplicate items appear.** Each fetch is called once, but a cursor captured in a stale closure will request the same page twice. Include the cursor in your `useCallback` deps, or track it in a ref.

**The custom scrollbar doesn't appear.** It hides itself when there's nothing to scroll. If content is definitely taller than the box, check that no consumer CSS overrides `.react-async-list-scrollbar__bar`'s `position` or `height`.

**My CSS is being overridden.** It shouldn't be — the stylesheet is prepended to `<head>` and every selector is a single class. The one exception is loader positioning, which uses a doubled class deliberately; match that specificity if you need to override it.

## Development

```bash
npm install
npm run dev          # demo at http://localhost:5173
npm test             # vitest, jsdom
npm run test:watch
npm run lint         # eslint
npm run format       # prettier --write .
npm run typecheck
npm run build        # dist/: ESM, CJS, .d.ts, styles.css
```

CI runs `lint`, `format:check`, `typecheck`, `test`, `build`, a drift check on
the generated stylesheet, and `npm pack --dry-run` on Node 22 and 24.

**Contributing needs Node 22.22.2 or newer** (see `.nvmrc`) — jsdom 30, which
the tests run in, refuses to load on anything older. This is a development
requirement only: the published package is browser code and has no Node
constraint of its own.

Two notes on the lint setup. Only `rules-of-hooks` and `exhaustive-deps` are
enabled from `eslint-plugin-react-hooks`, not its `recommended` preset: v7 also
ships the React Compiler rules, which forbid reading refs during render and
mutating module state — both of which this library does deliberately, because
writing scrollbar geometry straight to the DOM is how scrolling avoids
re-rendering the list. And `exhaustive-deps` is an **error**, not a warning; it
has already caught two real staleness bugs here.

### Releasing

Publishing is done by CI, never from a laptop: the workflow signs the package
with provenance, which local `npm publish` cannot do, and it avoids two people
racing to publish the same version. There is deliberately no `release` script.

**1 — describe the change, in the same pull request that makes it.** Changesets
turns these files into the changelog, so the description is written while the
change is fresh:

```bash
npm run changeset
```

Pick the bump (`patch` for fixes and docs, `minor` for new API, `major` for
breaking changes), write a sentence, and commit the generated
`.changeset/*.md` file alongside your code.

**2 — cut the version.** This consumes every pending changeset file, bumps
`package.json` and `package-lock.json`, and folds the descriptions into
`CHANGELOG.md`:

```bash
npm run version
```

```bash
git add -A && git commit -m "release: $(node -p "require('./package.json').version")"
```

**3 — push, then tag.** The tag is derived from `package.json` so it cannot drift
from the version being published:

```bash
git push origin main
```

```bash
git tag -a "v$(node -p "require('./package.json').version")" -m "v$(node -p "require('./package.json').version")"
```

```bash
git push origin --tags
```

**4 — create the GitHub release** on that tag. This is what triggers publishing:
the workflow runs `typecheck`, `build`, and `npm publish --provenance`. It needs
an `NPM_TOKEN` repository secret — a granular token with **write access to the
`@vmariev` scope**, or a classic Automation token. A token limited to selected
packages cannot create a new one.

**5 — verify.** The npmjs.com page is cached and lags by minutes to hours; the
registry is authoritative:

```bash
npm view @vmariev/react-async-list version
```

A published version is immutable — npm will not let you overwrite it, and
unpublishing burns the number for good. If something is wrong, release the next
patch.

### Tests

jsdom performs no layout, so `test/layout.ts` models the parts that matter — `scrollHeight` derived from the rendered rows, a settable `scrollTop`, and a `ResizeObserver` stub. It is installed on `HTMLElement.prototype` before anything mounts, so geometry is correct at the first measurement.

The suites worth reading before changing `useAsyncList`, because each one pins down a bug that actually shipped:

| Suite                          | Guarantee                                                                                                                                                                                      |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `floodGuard.test.tsx`          | A list parked at an edge issues **one** request, not one every 300ms — including in reverse mode at `scrollTop: 0`, with any `exitOffset`, with inline fetchers, and under constant re-renders |
| `loading.test.tsx`             | An under-filled list keeps filling until it overflows; directions load independently, including reaching the far edge mid-fetch                                                                |
| `errors.test.tsx`              | A rejection doesn't wedge a direction, doesn't spin while idle, and recovers                                                                                                                   |
| `scrollRegime.test.tsx`        | The probe, and every reverse-mode behaviour run against **both** `scrollTop` conventions — the cross-engine safety net                                                                         |
| `rendering.test.tsx`           | Class names, slots, `as`, ref forwarding, deprecated aliases, style injection                                                                                                                  |
| `useAsyncList.test.tsx`        | The headless hook driving a `<table>`, and the reverse-mode sign flip in `scrollToTop`/`scrollToBottom`                                                                                        |
| `contentKey.test.tsx`          | A replacing fetch stays visible to the guard; the dev warning for a missing `itemCount`                                                                                                        |
| `layoutReads.test.tsx`         | An exhausted list stops reading layout altogether — counted, not assumed                                                                                                                       |
| `mergedRef.test.tsx`           | The merged ref is stable, so an inline `ref` cannot churn the subscription                                                                                                                     |
| `virtualized.test.tsx`         | Paging a virtualized container, and the stall that happens without `itemCount`                                                                                                                 |
| `reviewFixes.test.tsx`         | A drag that outlives the component, `className`/`style` landing together, and items wrapped in a fragment                                                                                      |
| `scroll.test.ts`, `cx.test.ts` | The pure offset maths and the class-name helper                                                                                                                                                |

Note that tests advance fake timers in slices rather than one jump: React commits renders when an `act` scope exits, so a single large jump would run many timers against stale DOM and make "nothing happened" assertions vacuous.

The demo in `example/` imports the package by name, aliased to `src/`, so changes hot-reload.

Styles are authored as plain CSS with BEM class names in [`src/styles/async-list.css`](src/styles/async-list.css). `scripts/build-css.mjs` inlines that file into `src/styles/generated.ts` for runtime injection and copies it to `dist/styles.css`; it runs automatically before `build`, `dev`, and `typecheck`, so edit the `.css` file and never the generated one.

## License

MIT © [vmariev](https://github.com/vmariev)
