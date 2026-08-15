import { useState, useCallback, useRef, useEffect } from 'react';

/**
 * Custom hook for handling async operations with loading/error states
 * Handles race conditions and component unmount scenarios
 *
 * @template T
 * @example
 * const { data, loading, error, execute, reset } = useAsync(async () => {
 *   const response = await fetch('/api/products');
 *   return response.json();
 * });
 *
 * // Execute on mount or manually
 * useEffect(() => { execute(); }, [execute]);
 *
 * @param {() => Promise<T>} asyncFunction - The async function to execute
 * @param {boolean} [immediate=false] - Whether to execute immediately on mount
 * @returns {{
 *   data: T | null,
 *   loading: boolean,
 *   error: Error | null,
 *   execute: () => Promise<void>,
 *   reset: () => void
 * }}
 */
const useAsync = (asyncFunction, immediate = false) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Track mounted state to prevent setting state on unmounted component
  const mountedRef = useRef(true);

  // Track the latest execution ID to handle race conditions
  const executionIdRef = useRef(0);

  const execute = useCallback(async () => {
    setLoading(true);
    setError(null);

    // Increment execution ID for this call
    const currentExecutionId = ++executionIdRef.current;

    try {
      const result = await asyncFunction();

      // Only update state if this is still the latest execution and component is mounted
      if (mountedRef.current && currentExecutionId === executionIdRef.current) {
        setData(result);
        setLoading(false);
      }
    } catch (err) {
      // Only update error state if this is still the latest execution and component is mounted
      if (mountedRef.current && currentExecutionId === executionIdRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
      }
    }
  }, [asyncFunction]);

  const reset = useCallback(() => {
    if (mountedRef.current) {
      setData(null);
      setError(null);
      setLoading(false);
      // Increment execution ID to invalidate any pending operations
      executionIdRef.current++;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    if (immediate) {
      execute();
    }

    return () => {
      mountedRef.current = false;
    };
  }, [execute, immediate]);

  return {
    data,
    loading,
    error,
    execute,
    reset
  };
};

export default useAsync;
