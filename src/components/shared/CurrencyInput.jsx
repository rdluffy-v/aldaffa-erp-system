import { useState } from 'react';
import { AlertCircle, BadgeCheck } from 'lucide-react';

/**
 * CurrencyInput.jsx
 * Currency field for SDG (Sudanese Pound) amounts with live formatted
 * display, numeric validation (min/max/required) and RTL-aware layout.
 *
 * The user types a plain number; a formatted Arabic-Sudanese currency
 * readout is shown below the field.
 *
 * @param {Object}  props
 * @param {string}  [props.label]     - Field label
 * @param {number|null} [props.value] - Numeric value (null = empty)
 * @param {Function} props.onChange(numericValue|null) - Change callback
 * @param {string}  [props.error]     - External validation error
 * @param {string}  [props.hint]      - Helper text (hidden when error)
 * @param {number}  [props.min]       - Minimum valid amount
 * @param {number}  [props.max]       - Maximum valid amount
 * @param {boolean} [props.required]  - Marks field required
 * @param {boolean} [props.validated] - Show green check when value is valid
 */

const currencyFormatter = {
  format: (amount) => {
    const val = Number(amount) || 0;
    return `${val.toLocaleString('ar-LY', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} د.ل`;
  }
};

/** Keep only digits and a single decimal separator (supports '.' and '٫'). */
const sanitizeNumeric = (raw) => {
  let cleaned = raw
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))) // Arabic-Indic → ASCII
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))) // Extended Arabic-Indic
    .replace(/٫/g, '.'); // Arabic decimal separator → ASCII
  cleaned = cleaned.replace(/[^\d.]/g, '');
  // Keep only the first decimal point.
  const parts = cleaned.split('.');
  if (parts.length > 2) {
    cleaned = `${parts[0]}.${parts.slice(1).join('')}`;
  }
  // Limit to 2 fraction digits.
  if (cleaned.includes('.')) {
    const [int, frac] = cleaned.split('.');
    cleaned = `${int}.${frac.slice(0, 2)}`;
  }
  return cleaned;
};

const CurrencyInput = ({
  label,
  value,
  onChange,
  error,
  hint,
  placeholder = '0',
  min,
  max,
  required = false,
  validated = false,
  disabled = false,
  name,
  id,
  className = '',
  inputClassName = ''
}) => {
  const [text, setText] = useState(value == null ? '' : String(value));
  const [focused, setFocused] = useState(false);

  const inputId = id || name || `currency-${label?.replace(/\s+/g, '-').toLowerCase() || 'amount'}`;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;

  const handleChange = (e) => {
    const cleaned = sanitizeNumeric(e.target.value);
    setText(cleaned);
    const numeric = cleaned === '' ? null : parseFloat(cleaned);
    onChange?.(Number.isNaN(numeric) ? null : numeric);
  };

  // On blur, reformat the raw text to the canonical numeric string.
  const handleBlur = () => {
    setFocused(false);
    if (value != null && !Number.isNaN(value)) {
      setText(String(value));
    } else {
      setText('');
    }
  };

  // Derived range validation (merges with any external error).
  let derivedError = null;
  if (value != null && min != null && value < min) {
    derivedError = `القيمة يجب أن لا تقل عن ${min}`;
  } else if (value != null && max != null && value > max) {
    derivedError = `القيمة يجب أن لا تزيد عن ${max}`;
  } else if (required && (value == null || Number.isNaN(value))) {
    derivedError = 'هذا الحقل مطلوب';
  }

  const hasError = Boolean(error || derivedError);
  const effectiveError = error || derivedError;

  const formatted =
    value != null && !Number.isNaN(value) ? currencyFormatter.format(value) : '';
  const isValid = !hasError && formatted !== '' && value != null;

  return (
    <div className={className}>
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-[#adbac7] mb-1.5">
          {label}
          {required && <span className="text-red-400 ms-1" aria-hidden="true">*</span>}
        </label>
      )}

      <div className="relative">
        <input
          type="text"
          inputMode="decimal"
          id={inputId}
          name={name}
          value={text}
          onChange={handleChange}
          onFocus={() => setFocused(true)}
          onBlur={handleBlur}
          placeholder={placeholder}
          disabled={disabled}
          aria-invalid={hasError}
          aria-describedby={
            [hasError ? errorId : null, !hasError && hint ? hintId : null]
              .filter(Boolean)
              .join(' ') || undefined
          }
          className={[
            'input-luxury text-end tabular-nums',
            hasError
              ? '!border-red-500 focus:!border-red-500 focus:!shadow-[0_0_0_3px_rgba(239,68,68,0.18)]'
              : '',
            validated && isValid
              ? '!border-emerald-500/60 focus:!border-emerald-500'
              : '',
            disabled ? 'opacity-60 cursor-not-allowed' : '',
            inputClassName
          ].join(' ')}
        />
        {/* Libyan Dinar suffix badge */}
        <span
          className="absolute end-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-[#768390] pointer-events-none bg-[#0d1117]/40 px-1.5 py-0.5 rounded"
          aria-hidden="true"
        >
          د.ل
        </span>
      </div>

      {/* Formatted currency readout */}
      {!focused && formatted !== '' && !hasError && (
        <p className="text-xs mt-1.5 flex items-center gap-1" aria-live="polite">
          <span className="text-[#768390]">المبلغ:</span>
          <span className="text-[#fbbf24] font-bold">{formatted}</span>
        </p>
      )}

      {hasError ? (
        <p id={errorId} role="alert" className="flex items-center gap-1.5 text-xs text-red-400 mt-1.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          {effectiveError}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs text-[#768390] mt-1.5">{hint}</p>
      ) : isValid && validated ? (
        <p className="flex items-center gap-1.5 text-xs text-emerald-400 mt-1.5">
          <BadgeCheck className="w-3.5 h-3.5" aria-hidden="true" />
          قيمة صالحة
        </p>
      ) : null}
    </div>
  );
};

export default CurrencyInput;
