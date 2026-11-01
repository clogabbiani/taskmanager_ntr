"use client";

import { useEffect, useRef } from "react";

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.closest("[role=dialog]") !== null
  );
}

/**
 * Global keyboard shortcut. `key` is matched case-insensitively; with `mod`
 * the shortcut requires Ctrl (or Cmd on macOS) and also fires while typing.
 */
export function useHotkey(key: string, handler: (e: KeyboardEvent) => void, { mod = false } = {}) {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== key.toLowerCase() || e.altKey || e.repeat) return;
      const modPressed = e.ctrlKey || e.metaKey;
      if (mod ? !modPressed : modPressed || e.shiftKey || isTyping(e.target)) return;
      e.preventDefault();
      ref.current(e);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [key, mod]);
}
