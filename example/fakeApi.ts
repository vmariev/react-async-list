export type Row = {
  id: string;
  label: string;
};

let idCounter = 0;

/** Globally unique, so React keys never collide across demos. */
const nextId = () => {
  idCounter += 1;
  return `row-${idCounter}`;
};

/** Per-label counters, so each list reads as numbered from 1. */
const labelCounters = new Map<string, number>();

const nextLabelNumber = (prefix: string) => {
  const next = (labelCounters.get(prefix) ?? 0) + 1;
  labelCounters.set(prefix, next);
  return next;
};

export const makeRows = (count: number, prefix: string): Row[] =>
  Array.from({ length: count }, () => ({
    id: nextId(),
    label: `${prefix} #${nextLabelNumber(prefix)}`,
  }));

export const delay = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

export type Message = {
  id: string;
  author: string;
  text: string;
  isOwn: boolean;
};

const TEXTS = [
  'Are we still on for tomorrow?',
  'Pushed the fix, take a look when you can.',
  'That was the last of the migrations.',
  'Reverse mode keeps the newest item pinned to the bottom.',
  'Scroll up and older messages load in.',
  'No layout jump — the loader is absolutely positioned.',
  'Works the same with a thousand items.',
];

export const makeMessages = (count: number, prefix: string): Message[] =>
  Array.from({ length: count }, (_, index) => ({
    id: nextId(),
    author: index % 3 === 0 ? 'You' : 'Dana',
    text: `${TEXTS[index % TEXTS.length]} (${prefix} #${nextLabelNumber(prefix)})`,
    isOwn: index % 3 === 0,
  }));
