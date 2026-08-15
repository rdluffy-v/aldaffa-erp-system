import { useState, useEffect } from 'react';

/**
 * Custom hook for responsive breakpoint detection using CSS media queries
 * Returns boolean indicating if the media query matches
 *
 * @example
 * const isMobile = useMediaQuery('(max-width: 768px)');
 * const isTablet = useMediaQuery('(min-width: 769px) and (max-width: 1024px)');
 * const isDesktop = useMediaQuery('(min-width: 1025px)');
 * const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');
 *
 * return (
 *   <div>
 *     {isMobile && <MobileLayout />}
 *     {isTablet && <TabletLayout />}
 *     {isDesktop && <DesktopLayout />}
 *   </div>
 * );
 *
 * @example
 * // Common breakpoints
 * const breakpoints = {
 *   mobile: useMediaQuery('(max-width: 640px)'),
 *   tablet: useMediaQuery('(min-width: 641px) and (max-width: 1024px)'),
 *   desktop: useMediaQuery('(min-width: 1025px)'),
 *   wide: useMediaQuery('(min-width: 1920px)')
 * };
 *
 * @param {string} query - CSS media query string
 * @returns {boolean} Whether the media query matches
 */
const useMediaQuery = (query) => {
  // Initialize with undefined to detect first render
  const [matches, setMatches] = useState(() => {
    // Return false during SSR or when window is not available
    if (typeof window === 'undefined') {
      return false;
    }

    try {
      return window.matchMedia(query).matches;
    } catch (error) {
      console.error('Invalid media query:', query, error);
      return false;
    }
  });

  useEffect(() => {
    // Return early if window is not available (SSR)
    if (typeof window === 'undefined') {
      return;
    }

    let mediaQueryList;

    try {
      mediaQueryList = window.matchMedia(query);
    } catch (error) {
      console.error('Invalid media query:', query, error);
      return;
    }

    // Update state with current match status
    setMatches(mediaQueryList.matches);

    /**
     * Handle media query change
     * @param {MediaQueryListEvent} event
     */
    const handleChange = (event) => {
      setMatches(event.matches);
    };

    // Modern browsers support addEventListener on MediaQueryList
    if (mediaQueryList.addEventListener) {
      mediaQueryList.addEventListener('change', handleChange);
    } else {
      // Fallback for older browsers
      mediaQueryList.addListener(handleChange);
    }

    // Cleanup
    return () => {
      if (mediaQueryList.removeEventListener) {
        mediaQueryList.removeEventListener('change', handleChange);
      } else {
        // Fallback for older browsers
        mediaQueryList.removeListener(handleChange);
      }
    };
  }, [query]);

  return matches;
};

export default useMediaQuery;
