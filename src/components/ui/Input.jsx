import { AlertCircle } from 'lucide-react';

/**
 * Input.jsx
 * Accessible, RTL-aware text field for Aldaffa ERP.
 *
 * Supports text / number / email / password types, label, error + hint
 * messages, prefix / suffix adornments and luxury focus states.
 *
 * @param {Object}  props
 * @param {string}  [props.label]        - Field label
 * @param {string}  [props.error]        - Error message (shows red state)
 * @param {string}  [props.hint]         - Helper text (hidden when error)
 * @param {string}  [props.type='text']  - Native input type
 * @param {React.ReactNode} [props.prefix] - Leading adornment (start side)
 * @param {React.ReactNode} [props.suffix] - Trailing adornment (end side)
 */
const Input = ({
  label,
  error,
  hint,
  type = 'text',
  name,
  id,
  value,
  onChange,
  onBlur,
  onFocus,
  placeholder,
  disabled = false,
  required = false,
  autoFocus = false,
  prefix,
  suffix,
  className = '',
  inputClassName = '',
  labelClassName = '',
  ...rest
}) => {
  const inputId = id || name || `input-${label?.replace(/\s+/g, '-').toLowerCase() || 'field'}`;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;
  const hasError = Boolean(error);

  return (
    <div className={className}>
      {label && (
        <label
          htmlFor={inputId}
          className={`block text-sm font-medium text-[#adbac7] mb-1.5 ${labelClassName}`}
        >
          {label}
          {required && (
            <span className="text-red-400 ms-1" aria-hidden="true">*</span>
          )}
        </label>
      )}

      <div className="relative">
        {prefix && (
          <span className="absolute start-3 top-1/2 -translate-y-1/2 text-[#768390] pointer-events-none">
            {prefix}
          </span>
        )}
        <input
          type={type}
          id={inputId}
          name={name}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          onFocus={onFocus}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          autoFocus={autoFocus}
          aria-invalid={hasError}
          aria-describedby={
            [hasError ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined
          }
          className={[
            'input-luxury',
            prefix ? 'ps-11' : '',
            suffix ? 'pe-11' : '',
            hasError
              ? '!border-red-500 focus:!border-red-500 focus:!shadow-[0_0_0_3px_rgba(239,68,68,0.18)]'
              : '',
            disabled ? 'opacity-60 cursor-not-allowed' : '',
            inputClassName
          ].join(' ')}
          {...rest}
        />
        {suffix && (
          <span className="absolute end-3 top-1/2 -translate-y-1/2 text-[#768390] pointer-events-none">
            {suffix}
          </span>
        )}
      </div>

      {hasError ? (
        <p id={errorId} role="alert" className="flex items-center gap-1.5 text-xs text-red-400 mt-1.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs text-[#768390] mt-1.5">
          {hint}
        </p>
      ) : null}
    </div>
  );
};

export default Input;
