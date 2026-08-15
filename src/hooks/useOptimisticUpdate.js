import { useState, useCallback, useRef } from 'react';

/**
 * Custom hook for optimistic UI updates with automatic rollback on error
 * Works with Zustand stores or local state
 *
 * @template T
 * @example
 * // With Zustand store
 * import useProductsStore from '@/stores/useProductsStore';
 *
 * const { execute, isOptimistic } = useOptimisticUpdate();
 *
 * const updateProduct = async (productId, updates) => {
 *   await execute({
 *     optimisticUpdate: () => {
 *       useProductsStore.getState().updateProduct(productId, updates);
 *     },
 *     rollback: (previousState) => {
 *       useProductsStore.getState().setProducts(previousState);
 *     },
 *     request: async () => {
 *       const response = await fetch(`/api/products/${productId}`, {
 *         method: 'PUT',
 *         body: JSON.stringify(updates)
 *       });
 *       if (!response.ok) throw new Error('Update failed');
 *       return response.json();
 *     },
 *     getSnapshot: () => useProductsStore.getState().products
 *   });
 * };
 *
 * @returns {{
 *   execute: (options: {
 *     optimisticUpdate: () => void,
 *     rollback: (snapshot: T) => void,
 *     request: () => Promise<any>,
 *     getSnapshot: () => T,
 *     onSuccess?: (result: any) => void,
 *     onError?: (error: Error) => void
 *   }) => Promise<void>,
 *   isOptimistic: boolean,
 *   error: Error | null
 * }}
 */
const useOptimisticUpdate = () => {
  const [isOptimistic, setIsOptimistic] = useState(false);
  const [error, setError] = useState(null);
  const abortControllerRef = useRef(null);

  /**
   * Execute optimistic update
   * @param {{
   *   optimisticUpdate: () => void,
   *   rollback: (snapshot: T) => void,
   *   request: () => Promise<any>,
   *   getSnapshot: () => T,
   *   onSuccess?: (result: any) => void,
   *   onError?: (error: Error) => void
   * }} options
   */
  const execute = useCallback(async ({
    optimisticUpdate,
    rollback,
    request,
    getSnapshot,
    onSuccess,
    onError
  }) => {
    // Abort previous request if still pending
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller
    abortControllerRef.current = new AbortController();

    // Capture current state before optimistic update
    const snapshot = getSnapshot();

    // Apply optimistic update immediately
    setIsOptimistic(true);
    setError(null);
    optimisticUpdate();

    try {
      // Execute the actual request
      const result = await request();

      // Success - keep the optimistic update
      setIsOptimistic(false);

      if (onSuccess) {
        onSuccess(result);
      }

      return result;
    } catch (err) {
      // Only process if not aborted
      if (err.name !== 'AbortError') {
        // Error - rollback to previous state
        rollback(snapshot);
        setIsOptimistic(false);

        const errorObj = err instanceof Error ? err : new Error(String(err));
        setError(errorObj);

        if (onError) {
          onError(errorObj);
        }

        throw errorObj;
      }
    }
  }, []);

  return {
    execute,
    isOptimistic,
    error
  };
};

export default useOptimisticUpdate;
