import { useState, useMemo, useCallback } from 'react';

/**
 * Custom hook for pagination state management
 * Calculates offsets, total pages, and provides navigation functions
 *
 * @example
 * const {
 *   page,
 *   pageSize,
 *   offset,
 *   totalPages,
 *   hasNextPage,
 *   hasPrevPage,
 *   nextPage,
 *   prevPage,
 *   goToPage,
 *   setPageSize,
 *   reset
 * } = usePagination({ totalItems: 250, initialPageSize: 20 });
 *
 * // Use offset in SQL queries
 * const products = await db.query(
 *   'SELECT * FROM products LIMIT ? OFFSET ?',
 *   [pageSize, offset]
 * );
 *
 * @param {{
 *   totalItems: number,
 *   initialPage?: number,
 *   initialPageSize?: number
 * }} options - Pagination options
 * @returns {{
 *   page: number,
 *   pageSize: number,
 *   offset: number,
 *   totalPages: number,
 *   hasNextPage: boolean,
 *   hasPrevPage: boolean,
 *   nextPage: () => void,
 *   prevPage: () => void,
 *   goToPage: (page: number) => void,
 *   setPageSize: (size: number) => void,
 *   reset: () => void
 * }}
 */
const usePagination = ({
  totalItems,
  initialPage = 1,
  initialPageSize = 10
}) => {
  const [page, setPage] = useState(initialPage);
  const [pageSize, setPageSizeState] = useState(initialPageSize);

  // Calculate total pages
  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(totalItems / pageSize));
  }, [totalItems, pageSize]);

  // Calculate offset for SQL queries
  const offset = useMemo(() => {
    return (page - 1) * pageSize;
  }, [page, pageSize]);

  // Check if there's a next page
  const hasNextPage = useMemo(() => {
    return page < totalPages;
  }, [page, totalPages]);

  // Check if there's a previous page
  const hasPrevPage = useMemo(() => {
    return page > 1;
  }, [page]);

  // Navigate to next page
  const nextPage = useCallback(() => {
    setPage((prevPage) => Math.min(prevPage + 1, totalPages));
  }, [totalPages]);

  // Navigate to previous page
  const prevPage = useCallback(() => {
    setPage((prevPage) => Math.max(prevPage - 1, 1));
  }, []);

  // Navigate to specific page
  const goToPage = useCallback((targetPage) => {
    const pageNumber = Math.max(1, Math.min(targetPage, totalPages));
    setPage(pageNumber);
  }, [totalPages]);

  // Change page size and reset to first page
  const setPageSize = useCallback((newSize) => {
    const size = Math.max(1, newSize);
    setPageSizeState(size);
    setPage(1); // Reset to first page when page size changes
  }, []);

  // Reset pagination to initial state
  const reset = useCallback(() => {
    setPage(initialPage);
    setPageSizeState(initialPageSize);
  }, [initialPage, initialPageSize]);

  return {
    page,
    pageSize,
    offset,
    totalPages,
    hasNextPage,
    hasPrevPage,
    nextPage,
    prevPage,
    goToPage,
    setPageSize,
    reset
  };
};

export default usePagination;
