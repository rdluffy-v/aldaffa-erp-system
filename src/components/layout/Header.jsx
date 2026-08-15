import { useEffect, useState } from 'react';

/**
 * Header.jsx
 * Dark luxury top header: brand, live Arabic (ar-SD) date & time,
 * and an optional children slot for header actions.
 *
 * @param {Object} props
 * @param {React.ReactNode} [props.children] - Right-side action area
 */
const Header = ({ children }) => {
  const [now, setNow] = useState(() => new Date());

  // Refresh the clock every 30 seconds.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  // Formatting with the Sudanese Arabic locale via native Intl.
  const dateFormatter = new Intl.DateTimeFormat('ar-SD', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const timeFormatter = new Intl.DateTimeFormat('ar-SD', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });

  const dateText = dateFormatter.format(now);
  const timeText = timeFormatter.format(now);

  return (
    <header className="relative w-full bg-gradient-to-l from-[#0d1117] via-[#161b22] to-[#0d1117] border-b border-white/5 px-6 py-4">
      {/* Luxurious gold accent hairline at the bottom edge */}
      <div
        className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-l from-transparent via-[#d97706]/60 to-transparent"
        aria-hidden="true"
      />
      {/* Subtle top glow */}
      <div
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-l from-transparent via-[#fbbf24]/30 to-transparent"
        aria-hidden="true"
      />

      <div className="relative flex items-center justify-between gap-6">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <span
            className="text-2xl leading-none drop-shadow-[0_0_12px_rgba(251,191,36,0.55)]"
            aria-hidden="true"
          >
            🌟
          </span>
          <div className="leading-tight">
            <h1 className="text-xl font-bold text-[#e6edf3] tracking-wide">
              الدفة للعطور
            </h1>
            <p className="text-[11px] text-[#768390] uppercase tracking-[0.18em]">
              Aldaffa Perfumes ERP
            </p>
          </div>
        </div>

        {/* Date / time + custom actions */}
        <div className="flex items-center gap-6">
          <div className="text-end select-none">
            <p className="text-sm font-semibold text-[#fbbf24]">{dateText}</p>
            <p className="text-xs text-[#adbac7] tabular-nums mt-0.5">{timeText}</p>
          </div>
          {children && <div className="flex items-center gap-3">{children}</div>}
        </div>
      </div>
    </header>
  );
};

export default Header;
