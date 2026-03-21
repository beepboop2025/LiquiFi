/**
 * Global keyboard shortcuts for LiquiFi.
 *
 * Ctrl+1..9   — switch tabs
 * Ctrl+E      — toggle emergency kill switch
 * Ctrl+K or / — open command search (future)
 * Escape      — close modals/dialogs
 */

import { useEffect, useCallback } from 'react';

interface ShortcutHandlers {
  /** Array of tab IDs in order (index 0 = Ctrl+1) */
  tabIds: string[];
  setTab: (id: string) => void;
  onToggleKillSwitch?: () => void;
  onEscape?: () => void;
  onCommandPalette?: () => void;
}

export interface ShortcutEntry {
  keys: string;
  description: string;
}

export const SHORTCUT_LIST: ShortcutEntry[] = [
  { keys: 'Ctrl+1..9', description: 'Switch between tabs' },
  { keys: 'Ctrl+E', description: 'Toggle emergency kill switch' },
  { keys: 'Ctrl+K', description: 'Command palette (future)' },
  { keys: 'Escape', description: 'Close dialogs / dismiss' },
  { keys: '?', description: 'Show keyboard shortcuts' },
];

export function useKeyboardShortcuts({
  tabIds,
  setTab,
  onToggleKillSwitch,
  onEscape,
  onCommandPalette,
}: ShortcutHandlers): void {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

    // Ctrl+1..9 for tab switching (works even in inputs)
    if ((e.ctrlKey || e.metaKey) && e.key >= '1' && e.key <= '9') {
      e.preventDefault();
      const idx = parseInt(e.key, 10) - 1;
      if (idx < tabIds.length) {
        setTab(tabIds[idx]);
      }
      return;
    }

    // Ctrl+E for kill switch
    if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
      e.preventDefault();
      onToggleKillSwitch?.();
      return;
    }

    // Ctrl+K for command palette
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      onCommandPalette?.();
      return;
    }

    // Escape to close modals
    if (e.key === 'Escape') {
      onEscape?.();
      return;
    }

    // "/" for command palette (only outside inputs)
    if (e.key === '/' && !isInput) {
      e.preventDefault();
      onCommandPalette?.();
      return;
    }
  }, [tabIds, setTab, onToggleKillSwitch, onEscape, onCommandPalette]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
