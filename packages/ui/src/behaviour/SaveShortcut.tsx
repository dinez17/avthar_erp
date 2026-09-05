import { useEffect, useRef } from 'react';

type SaveHandler = () => void;

interface Registration {
  invoke: SaveHandler;
}

/**
 * Screens register their save action here. The list behaves as a stack, so a dialog
 * opened over a page takes the shortcut until it closes, then hands it back.
 */
const registrations: Registration[] = [];

/**
 * Registers this screen's save action for Ctrl+S (Cmd+S on macOS).
 *
 * Pass `enabled` to scope the registration — a dialog should pass its `open` flag so a
 * closed dialog never steals the shortcut from the page behind it.
 */
export function useSaveShortcut(handler: SaveHandler, enabled = true): void {
  const latest = useRef(handler);
  latest.current = handler;

  useEffect(() => {
    if (!enabled) return undefined;
    const registration: Registration = { invoke: () => latest.current() };
    registrations.push(registration);
    return () => {
      const index = registrations.indexOf(registration);
      if (index !== -1) registrations.splice(index, 1);
    };
  }, [enabled]);
}

/**
 * The single Ctrl+S listener for the app. Mount it once alongside the providers; the
 * screens themselves opt in with {@link useSaveShortcut}.
 */
export function SaveShortcut(): null {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key.toLowerCase() !== 's') return;
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;

      const current = registrations[registrations.length - 1];
      if (!current) return;

      // Only swallow the browser's own "save page" dialog when a screen can act on it.
      event.preventDefault();
      current.invoke();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return null;
}
