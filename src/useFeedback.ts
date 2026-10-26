import { useEffect, useRef, useState } from "react";
import type { MouseEvent, PointerEvent } from "react";

const PREFERENCE = "classic.vibration";

export function useFeedback() {
  const supported = typeof navigator.vibrate === "function";
  const [enabled, setEnabled] = useState(() => {
    try {
      return supported && localStorage.getItem(PREFERENCE) === "on";
    } catch {
      return false;
    }
  });
  const [blocked, setBlocked] = useState(false);
  const lastTick = useRef(0);
  const timers = useRef(new Map<HTMLElement, ReturnType<typeof setTimeout>>());

  useEffect(
    () => () => {
      for (const [element, timer] of timers.current) {
        clearTimeout(timer);
        element.classList.remove("tap-feedback");
      }
      timers.current.clear();
    },
    [],
  );

  function vibrate(milliseconds: number) {
    if (!supported) return false;
    try {
      return navigator.vibrate(milliseconds);
    } catch {
      return false;
    }
  }
  function toggle() {
    const next = !enabled && supported;
    if (next && !vibrate(12)) {
      setBlocked(true);
      return;
    }
    setBlocked(false);
    setEnabled(next);
    try {
      localStorage.setItem(PREFERENCE, next ? "on" : "off");
    } catch {
      /* Feedback still works when preferences cannot be persisted. */
    }
  }
  function pulse(milliseconds = 10) {
    if (enabled && !vibrate(milliseconds)) setBlocked(true);
  }
  function tick() {
    const now = Date.now();
    if (now - lastTick.current < 65) return;
    lastTick.current = now;
    pulse(5);
  }
  function press(target: EventTarget | null) {
    if (!(target instanceof Element)) return;
    const element = target.closest<HTMLElement>("button, summary");
    if (!element || (element instanceof HTMLButtonElement && element.disabled))
      return;
    const pending = timers.current.get(element);
    if (pending) clearTimeout(pending);
    element.classList.remove("tap-feedback");
    // Restart the small tactile animation on repeated presses, preserving wheel positioning.
    void element.offsetWidth;
    element.classList.add("tap-feedback");
    timers.current.set(
      element,
      setTimeout(() => {
        element.classList.remove("tap-feedback");
        timers.current.delete(element);
      }, 240),
    );
    pulse();
  }
  const onPointerDownCapture = (event: PointerEvent) => {
    if (event.isPrimary && event.button === 0) press(event.target);
  };
  const onClickCapture = (event: MouseEvent) => {
    // Keyboard/assistive activation has no preceding pointer event.
    if (event.detail === 0) press(event.target);
  };
  return {
    supported,
    enabled,
    blocked,
    toggle,
    tick,
    onPointerDownCapture,
    onClickCapture,
  };
}

export type Feedback = ReturnType<typeof useFeedback>;
