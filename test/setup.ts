import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

import { installLayoutModel, useRegimeForNextMount } from './layout';

installLayoutModel();

/**
 * jsdom has no ResizeObserver. This stub fires synchronously on `observe`,
 * matching the real one closely enough (a real observer also delivers an
 * initial entry), and lets a test simulate a later resize via `triggerAll`.
 */
class ResizeObserverStub implements ResizeObserver {
  static instances: ResizeObserverStub[] = [];

  private readonly callback: ResizeObserverCallback;
  private readonly targets = new Set<Element>();

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    ResizeObserverStub.instances.push(this);
  }

  observe(target: Element) {
    this.targets.add(target);
    this.callback([], this);
  }

  unobserve(target: Element) {
    this.targets.delete(target);
  }

  disconnect() {
    this.targets.clear();
  }

  static triggerAll() {
    for (const instance of ResizeObserverStub.instances) {
      if (instance.targets.size > 0) {
        instance.callback([], instance);
      }
    }
  }

  static reset() {
    ResizeObserverStub.instances = [];
  }
}

globalThis.ResizeObserver =
  ResizeObserverStub as unknown as typeof ResizeObserver;

export { ResizeObserverStub };

beforeEach(() => {
  // Fake timers cover the settle timeout, the load cooldown (via Date.now) and
  // requestAnimationFrame, so every trigger path is deterministic.
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  ResizeObserverStub.reset();
  useRegimeForNextMount(null);
  document.getElementById('react-async-list-styles')?.remove();
});
