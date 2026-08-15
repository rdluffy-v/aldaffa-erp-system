import { useState, useCallback, useEffect } from 'react';

/**
 * Custom hook for syncing state with localStorage
 * Handles JSON serialization/deserialization and storage events
 *
 * @template T
 * @example
 * const [user, setUser, removeUser] = useLocalStorage('user', null);
 *
 * // Set user data
 * setUser({ id: 1, name: 'John Doe' });
 *
 * // Remove from localStorage
 * removeUser();
 *
 * @param {string} key - The localStorage key
 * @param {T} initialValue - Initial value if key doesn't exist
 * @returns {[T, (value: T | ((prev: T) => T)) => void, () => void]} Tuple of [value, setValue, remove]
 */
const useLocalStorage = (key, initialValue) => {
  // State to store our value
  const [storedValue, setStoredValue] = useState(() => {
    if (typeof window === 'undefined') {
      return initialValue;
    }

    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(`Error loading localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  // Return a wrapped version of useState's setter function that persists to localStorage
  const setValue = useCallback((value) => {
    try {
      // Allow value to be a function for same API as useState
      const valueToStore = value instanceof Function ? value(storedValue) : value;

      setStoredValue(valueToStore);

      if (typeof window !== 'undefined') {
        window.localStorage.setItem(key, JSON.stringify(valueToStore));
      }
    } catch (error) {
      console.error(`Error setting localStorage key "${key}":`, error);
    }
  }, [key, storedValue]);

  // Remove item from localStorage
  const remove = useCallback(() => {
    try {
      setStoredValue(initialValue);

      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(key);
      }
    } catch (error) {
      console.error(`Error removing localStorage key "${key}":`, error);
    }
  }, [key, initialValue]);

  // Listen for storage changes from other tabs/windows
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleStorageChange = (e) => {
      if (e.key === key && e.newValue !== null) {
        try {
          setStoredValue(JSON.parse(e.newValue));
        } catch (error) {
          console.error(`Error parsing storage event for key "${key}":`, error);
        }
      } else if (e.key === key && e.newValue === null) {
        setStoredValue(initialValue);
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [key, initialValue]);

  return [storedValue, setValue, remove];
};

export default useLocalStorage;
