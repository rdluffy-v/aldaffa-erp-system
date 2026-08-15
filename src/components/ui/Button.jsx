import { isValidElement } from 'react';
import { Loader2 } from 'lucide-react';

/**
 * Button.jsx
 * Premium button system for Aldaffa ERP.
 *
 * Variants: primary | secondary | danger | ghost
 * Sizes:    sm | md | lg
 *
 * Supports loading state (spinner), disabled, lucide-react icons,
 * full-width layout and RTL-aware icon placement.
 *
 * @param {Object}  props
 * @param {string}  [props.variant='primary'] - Visual variant
 * @param {string}  [props.size='md']         - sm | md | lg
 * @param {boolean} [props.loading=false]     - Show spinner + disable
 * @param {boolean} [props.disabled=false]    - Disable interaction
 * @param {React.ComponentType|React.ReactNode} [props.icon] - lucide icon component or element
 * @param {string}  [props.iconPosition='start'] - 'start' | 'end' (RTL-aware)
 * @param {string}  [props.type='button']     - Native button type
 * @param {boolean} [props.fullWidth=false]   - Stretch to container width
 */
const Button = ({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon,
  iconPosition = 'start',
  type = 'button',
  fullWidth = false,
  className = '',
  children,
  onClick,
  ariaLabel,
  ...rest
}) => {
  const isDisabled = disabled || loading;

  const variantClasses = {
    primary: 'btn-primary',
    secondary: 'btn-secondary',
    danger:
      'bg-gradient-to-br from-red-500 to-red-600 text-white font-bold ' +
      'border border-red-400/20 rounded-lg ' +
      'shadow-[0_4px_14px_rgba(239,68,68,0.25)] ' +
      'hover:shadow-[0_0_22px_rgba(239,68,68,0.4)] hover:-translate-y-0.5 ' +
      'active:translate-y-0',
    ghost:
      'bg-transparent text-[#adbac7] font-semibold ' +
      'border border-white/10 rounded-lg ' +
      'hover:bg-white/5 hover:text-[#e6edf3] hover:border-[rgba(217,119,6,0.35)]'
  };

  const sizeClasses = {
    sm: 'px-3 py-1.5 text-xs gap-1.5',
    md: 'px-4 py-2.5 text-sm gap-2',
    lg: 'px-6 py-3 text-base gap-2.5'
  };

  const iconSizeClasses = {
    sm: 'w-3.5 h-3.5',
    md: 'w-4 h-4',
    lg: 'w-5 h-5'
  };

  const renderIcon = (iconSource, cls) => {
    if (!iconSource) return null;
    // Already a rendered React element — use as-is
    if (isValidElement(iconSource)) return iconSource;
    // Plain text/emoji glyph
    if (typeof iconSource === 'string' || typeof iconSource === 'number') {
      return iconSource;
    }
    // Component reference (plain function OR forwardRef/memo object)
    const IconComponent = iconSource;
    return <IconComponent className={cls} aria-hidden="true" />;
  };

  const iconNode = loading ? null : renderIcon(icon, iconSizeClasses[size]);

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={isDisabled}
      aria-label={ariaLabel}
      aria-busy={loading}
      aria-disabled={isDisabled}
      className={[
        'relative inline-flex items-center justify-center select-none cursor-pointer',
        'transition-all duration-200 no-select pointer',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none',
        variantClasses[variant],
        sizeClasses[size],
        fullWidth ? 'w-full' : '',
        iconPosition === 'end' && 'flex-row-reverse',
        className
      ].join(' ')}
      {...rest}
    >
      {loading ? (
        <Loader2 className={iconSizeClasses[size] ?? 'w-4 h-4'} aria-hidden="true" />
      ) : (
        iconNode
      )}
      <span className="inline-flex items-center">{children}</span>
    </button>
  );
};

export default Button;
