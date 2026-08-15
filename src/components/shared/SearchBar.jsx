import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';

/**
 * SearchBar.jsx
 * Debounced search input (300ms by default) with a Search icon on the
 * start side (right in RTL) and a clear (X) button.
 *
 * Fires `onChange` immediately for live typing, and `onDebouncedChange`
 * after the debounce delay for expensive filtering / queries.
 *
 * @param {Object}  props
 * @param {string}  [props.value]              - Controlled value
 * @param {Function} [props.onChange(value)]   - Immediate change callback
 * @param {Function} [props.onDebouncedChange(value)] - Debounced callback
 * @param {number}  [props.debounceDelay=300]  - Debounce delay (ms)
 * @param {string}  [props.placeholder='بحث...']
 * @param {string}  [props.ariaLabel='بحث']
 */
const SearchBar = ({
  value,
  onChange,
  onDebouncedChange,
  debounceDelay = 300,
  placeholder = 'بحث...',
  disabled = false,
  autoFocus = false,
  ariaLabel = 'بحث',
  className = ''
}) => {
  const [internalValue, setInternalValue] = useState(value || '');
  const lastEmittedRef = useRef(value || '');
  const debounceTimerRef = useRef(null);

  // Keep internal state in sync when the prop changes externally.
  useEffect(() => {
    setInternalValue(value || '');
    lastEmittedRef.current = value || '';
  }, [value]);

  // Debounce the debounced callback.
  useEffect(() => {
    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = window.setTimeout(() => {
      if (internalValue !== lastEmittedRef.current) {
        lastEmittedRef.current = internalValue;
        onDebouncedChange?.(internalValue);
      }
    }, debounceDelay);

    return () => {
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
      }
    };
  }, [internalValue, debounceDelay, onDebouncedChange]);

  const handleChange = (e) => {
    const next = e.target.value;
    setInternalValue(next);
    onChange?.(next);
  };

  const handleClear = () => {
    setInternalValue('');
    onChange?.('');
    lastEmittedRef.current = '';
    onDebouncedChange?.('');
  };

  return (
    <div className={['relative', className].join(' ')}>
      <Search
        className="absolute start-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#768390] pointer-events-none"
        aria-hidden="true"
      />
      <input
        type="search"
        value={internalValue}
        onChange={handleChange}
        onKeyDown={(e) => {
          // Allow Enter to flush the debounced value immediately.
          if (e.key === 'Enter') {
            if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current);
            lastEmittedRef.current = internalValue;
            onDebouncedChange?.(internalValue);
          }
        }}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        className={[
          'input-luxury rounded-full ps-10 pe-10',
          'appearance-none [&::-webkit-search-cancel-button]:appearance-none',
          disabled ? 'opacity-60 cursor-not-allowed' : ''
        ].join(' ')}
      />
      {internalValue && (
        <button
          type="button"
          onClick={handleClear}
          aria-label="مسح البحث"
          className="absolute end-3 top-1/2 -translate-y-1/2 p-1 rounded-full text-[#768390] hover:text-[#e6edf3] hover:bg-white/5 transition-colors duration-150 cursor-pointer"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
};

export default SearchBar;
