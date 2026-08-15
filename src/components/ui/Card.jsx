import { motion } from 'framer-motion';

/**
 * Card.jsx
 * Luxury glassmorphic card with header / body / footer slots.
 *
 * Uses the global `.glass-card` styling and adds Framer Motion hover
 * lift when `interactive` is enabled.
 *
 * @param {Object}  props
 * @param {React.ReactNode} [props.header]  - Header slot
 * @param {React.ReactNode} [props.footer]  - Footer slot
 * @param {string}  [props.padding='default'] - none | sm | default | lg
 * @param {boolean} [props.interactive=false] - Enables motion hover + click
 * @param {string}  [props.hover]           - Tailwind hover classes (optional)
 */
const Card = ({
  children,
  header,
  footer,
  padding = 'default',
  interactive = false,
  className = '',
  bodyClassName = '',
  headerClassName = '',
  footerClassName = '',
  onClick,
  ariaLabel,
  ...rest
}) => {
  const paddingClasses = {
    none: '',
    sm: 'p-3',
    default: 'p-5',
    lg: 'p-7'
  };

  const baseClass = [
    'glass-card',
    'flex flex-col',
    paddingClasses[padding] || paddingClasses.default,
    interactive ? 'cursor-pointer' : '',
    className
  ].join(' ');

  // Interactive cards get a Framer Motion lift + tap feedback.
  const motionProps = interactive
    ? {
        whileHover: { y: -3 },
        whileTap: { scale: 0.99 },
        transition: { type: 'spring', stiffness: 380, damping: 26 }
      }
    : {};

  const Wrapper = interactive ? motion.div : 'div';

  return (
    <Wrapper
      className={baseClass}
      onClick={onClick}
      aria-label={ariaLabel}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      } : undefined}
      {...motionProps}
      {...rest}
    >
      {header && (
        <div className={`border-b border-white/5 pb-4 mb-4 ${headerClassName}`}>
          {header}
        </div>
      )}

      <div className={`flex-1 ${bodyClassName}`}>{children}</div>

      {footer && (
        <div className={`border-t border-white/5 pt-4 mt-4 ${footerClassName}`}>
          {footer}
        </div>
      )}
    </Wrapper>
  );
};

export default Card;
