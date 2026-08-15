import { motion } from 'framer-motion';

/**
 * Navigation.jsx
 * Horizontally scrollable module tab bar with an animated gold active
 * indicator (Framer Motion layout animation).
 *
 * @param {Object}  props
 * @param {Array<{ id: string, label: string, icon?: React.ComponentType }>} props.modules
 * @param {string}  [props.activeModule] - Currently active module id
 * @param {Function} props.onSelect(id)  - Selection callback
 */
const Navigation = ({ modules = [], activeModule, onSelect, className = '' }) => {
  return (
    <nav
      role="tablist"
      aria-label="التنقل الرئيسي"
      className={[
        'relative flex items-center gap-1 overflow-x-auto scrollbar-luxury px-2 py-2',
        className
      ].join(' ')}
    >
      {modules.map((mod) => {
        const isActive = activeModule === mod.id;
        const Icon = mod.icon;

        return (
          <motion.button
            key={mod.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect?.(mod.id)}
            whileTap={{ scale: 0.95 }}
            className={[
              'relative shrink-0 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold',
              'transition-colors duration-200 cursor-pointer no-select',
              isActive
                ? 'text-[#0d1117]'
                : 'text-[#adbac7] hover:text-[#e6edf3] hover:bg-white/5'
            ].join(' ')}
          >
            {/* Animated active pill (shared layoutId glides between tabs) */}
            {isActive && (
              <motion.span
                layoutId="navigation-active-indicator"
                className="absolute inset-0 rounded-lg bg-gradient-to-l from-[#fbbf24] to-[#f59e0b] shadow-[0_0_18px_rgba(217,119,6,0.5)]"
                transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                aria-hidden="true"
              />
            )}

            {Icon && (
              <Icon
                className="relative z-10 w-4 h-4 shrink-0"
                aria-hidden="true"
              />
            )}
            <span className="relative z-10 whitespace-nowrap">{mod.label}</span>
          </motion.button>
        );
      })}
    </nav>
  );
};

export default Navigation;
