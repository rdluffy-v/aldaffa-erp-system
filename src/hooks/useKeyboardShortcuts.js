import { useEffect, useRef, useCallback } from 'react';

/**
 * Custom hook for registering keyboard shortcuts
 * Supports combinations (Ctrl+S, Alt+F1, etc.) and prevents conflicts
 *
 * @example
 * useKeyboardShortcuts({
 *   'ctrl+s': (e) => {
 *     e.preventDefault();
 *     saveDocument();
 *   },
 *   'f1': (e) => {
 *     e.preventDefault();
 *     openHelp();
 *   },
 *   'ctrl+shift+p': () => {
 *     openCommandPalette();
 *   }
 * });
 *
 * @param {Object.<string, (event: KeyboardEvent) => void>} shortcuts - Object mapping key combinations to handlers
 * @param {boolean} [enabled=true] - Whether shortcuts are enabled
 * @returns {void}
 */
const useKeyboardShortcuts = (shortcuts, enabled = true) => {
  // Use ref to store shortcuts to avoid stale closures
  const shortcutsRef = useRef(shortcuts);

  // Update ref when shortcuts change
  useEffect(() => {
    shortcutsRef.current = shortcuts;
  }, [shortcuts]);

  /**
   * Normalize key combination string
   * @param {string} combo - Key combination (e.g., "Ctrl+S", "ctrl+shift+p")
   * @returns {string} Normalized combination
   */
  const normalizeCombo = useCallback((combo) => {
    return combo.toLowerCase().split('+').sort().join('+');
  }, []);

  /**
   * Get current pressed key combination from event
   * @param {KeyboardEvent} event - Keyboard event
   * @returns {string} Current key combination
   */
  const getCurrentCombo = useCallback((event) => {
    const keys = [];

    if (event.ctrlKey || event.metaKey) keys.push('ctrl');
    if (event.altKey) keys.push('alt');
    if (event.shiftKey) keys.push('shift');

    const key = event.key.toLowerCase();

    // Handle special keys
    if (key !== 'control' && key !== 'alt' && key !== 'shift' && key !== 'meta') {
      keys.push(key);
    }

    return keys.sort().join('+');
  }, []);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    /**
     * Handle keydown event
     * @param {KeyboardEvent} event - Keyboard event
     */
    const handleKeyDown = (event) => {
      const currentCombo = getCurrentCombo(event);

      // Normalize all registered shortcuts for comparison
      const normalizedShortcuts = Object.keys(shortcutsRef.current).reduce((acc, key) => {
        acc[normalizeCombo(key)] = shortcutsRef.current[key];
        return acc;
      }, {});

      const handler = normalizedShortcuts[currentCombo];

      if (handler) {
        // Prevent default browser behavior for registered shortcuts
        event.preventDefault();
        handler(event);
      }
    };

    // Attach listener to document
    document.addEventListener('keydown', handleKeyDown);

    // Cleanup
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [enabled, normalizeCombo, getCurrentCombo]);
};

export default useKeyboardShortcuts;
