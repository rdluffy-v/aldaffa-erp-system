import { useEffect, useRef, useCallback } from 'react';

/**
 * Custom hook for detecting clicks outside a referenced element
 * Useful for dropdowns, modals, popovers, and context menus
 *
 * @example
 * const DropdownMenu = () => {
 *   const [isOpen, setIsOpen] = useState(false);
 *   const dropdownRef = useClickOutside(() => setIsOpen(false));
 *
 *   return (
 *     <div ref={dropdownRef}>
 *       <button onClick={() => setIsOpen(!isOpen)}>Toggle</button>
 *       {isOpen && <ul>...</ul>}
 *     </div>
 *   );
 * };
 *
 * @example
 * // With multiple refs
 * const Modal = () => {
 *   const modalRef = useRef(null);
 *   const triggerRef = useRef(null);
 *
 *   useClickOutside(() => closeModal(), [modalRef, triggerRef]);
 *
 *   return (
 *     <>
 *       <button ref={triggerRef}>Open</button>
 *       <div ref={modalRef}>Modal content</div>
 *     </>
 *   );
 * };
 *
 * @param {(event: MouseEvent | TouchEvent) => void} handler - Callback when click outside occurs
 * @param {Array<React.RefObject>} [additionalRefs=[]] - Additional refs to exclude from outside clicks
 * @param {boolean} [enabled=true] - Whether the hook is enabled
 * @returns {React.RefObject} Ref to attach to the element
 */
const useClickOutside = (handler, additionalRefs = [], enabled = true) => {
  const ref = useRef(null);
  const handlerRef = useRef(handler);

  // Update handler ref when handler changes
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    /**
     * Handle click/touch event
     * @param {MouseEvent | TouchEvent} event
     */
    const handleEvent = (event) => {
      // Get all refs to check
      const refs = [ref, ...additionalRefs];

      // Check if click is outside all refs
      const isOutside = refs.every((r) => {
        return r.current && !r.current.contains(event.target);
      });

      if (isOutside) {
        handlerRef.current(event);
      }
    };

    // Add event listeners with capture phase to catch events before they bubble
    document.addEventListener('mousedown', handleEvent, true);
    document.addEventListener('touchstart', handleEvent, true);

    // Cleanup
    return () => {
      document.removeEventListener('mousedown', handleEvent, true);
      document.removeEventListener('touchstart', handleEvent, true);
    };
  }, [additionalRefs, enabled]);

  return ref;
};

export default useClickOutside;
