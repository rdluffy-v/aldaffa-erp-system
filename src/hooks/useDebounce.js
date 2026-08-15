import { useState, useEffect } from 'react';

/**
 * Custom hook for debouncing value changes
 * Useful for search inputs, API calls, and performance optimization
 *
 * @template T
 * @example
 * const [searchTerm, setSearchTerm] = useState('');
 * const debouncedSearchTerm = useDebounce(searchTerm, 500);
 *
 * useEffect(() => {
 *   if (debouncedSearchTerm) {
 *     // Fetch search results
 *     fetchResults(debouncedSearchTerm);
 *   }
 * }, [debouncedSearchTerm]);
 *
 * @param {T} value - The value to debounce
 * @param {number} [delay=300] - Delay in milliseconds
 * @returns {T} The debounced value
 */
const useDebounce = (value, delay = 300) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    // Set up the timeout to update debounced value after delay
    const timeoutId = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // Cleanup function to clear timeout if value changes before delay
    return () => {
      clearTimeout(timeoutId);
    };
  }, [value, delay]);

  return debouncedValue;
};

export default useDebounce;
