import React from 'react';

/**
 * Organic Luxury Flacon SVG Line-Art Icons
 * Crafted specifically for Aldaffa Perfumes Atelier design system.
 */

export const FlaconClassic = ({ className = "w-6 h-6", ...props }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
    <rect x="9.5" y="2" width="5" height="3" rx="1" />
    <path d="M10.5 5v2h3V5" />
    <path d="M7 8.5C7 7.67 7.67 7 8.5 7h7c.83 0 1.5.67 1.5 1.5l1 9.5c.1 1-.7 2-1.7 2H7.7c-1 0-1.8-1-1.7-2l1-9.5z" />
    <path d="M8 14c1.5 1 4-1 8 0" strokeDasharray="1 1" opacity="0.6" />
    <circle cx="12" cy="12" r="1.5" opacity="0.5" />
  </svg>
);

export const FlaconAtomizer = ({ className = "w-6 h-6", ...props }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
    <circle cx="6" cy="6" r="3" />
    <path d="M8.5 7.5l2.5 1.5" />
    <path d="M11 9h4v2h-4z" />
    <path d="M15 9.5h2" />
    <path d="M19 8l1.5-1M19 10.5l2 .5M18.5 12.5l1.5 1.5" strokeDasharray="1 1" opacity="0.7" />
    <path d="M9 12c0-1 1-1 3-1s3 0 3 1v7a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-7z" />
  </svg>
);

export const FlaconSphere = ({ className = "w-6 h-6", ...props }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
    <ellipse cx="12" cy="3.5" rx="2.5" ry="1.5" />
    <path d="M12 5v2.5" />
    <circle cx="12" cy="14" r="6.5" />
    <path d="M7 13.5c2 1.5 4.5-1 6.5.5s2.5.5 4 0" strokeDasharray="1.5 1.5" opacity="0.6" />
    <circle cx="12" cy="13.5" r="1.2" opacity="0.4" />
  </svg>
);

export const FlaconCrystal = ({ className = "w-6 h-6", ...props }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
    <polygon points="12,2 15,4.5 13.5,6.5 10.5,6.5 9,4.5" />
    <path d="M10.5 6.5v2h3v-2" />
    <polygon points="12,8.5 18,10.5 16.5,20.5 7.5,20.5 6,10.5" />
    <path d="M12 8.5L12 20.5M6 10.5L12 14.5L18 10.5" opacity="0.5" />
  </svg>
);

export const FlaconDropper = ({ className = "w-6 h-6", ...props }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
    <path d="M10 2.5C10 2 11 1.5 12 1.5s2 .5 2 1v2h-4v-2z" />
    <rect x="9" y="4.5" width="6" height="2" rx="0.5" />
    <rect x="7" y="7.5" width="10" height="13" rx="2" />
    <line x1="12" y1="6.5" x2="12" y2="17" opacity="0.6" />
    <circle cx="12" cy="14" r="1.5" opacity="0.5" />
  </svg>
);

export const FlaconOudJar = ({ className = "w-6 h-6", ...props }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
    <path d="M12 2c.5 1 2 2 2 3H10c0-1 1.5-2 2-3z" />
    <rect x="8" y="5" width="8" height="2" rx="1" />
    <path d="M5.5 9c0-1 1.5-2 3-2h7c1.5 0 3 1 3 2l-.8 8.5c-.2 1.5-1.5 2.5-3 2.5H9.3c-1.5 0-2.8-1-3-2.5L5.5 9z" />
    <path d="M9 13.5c1.5-1.5 4.5-1.5 6 0" opacity="0.5" />
  </svg>
);

export const FlaconEmblem = ({ className = "w-8 h-8", ...props }) => (
  <svg viewBox="0 0 36 36" fill="none" className={className} {...props}>
    <defs>
      <linearGradient id="flaconGold" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#D4A359" />
        <stop offset="50%" stopColor="#FBDF9D" />
        <stop offset="100%" stopColor="#9EBAA4" />
      </linearGradient>
    </defs>
    <circle cx="18" cy="18" r="16.5" stroke="url(#flaconGold)" strokeWidth="1.2" strokeDasharray="3 2" opacity="0.6" />
    <rect x="15" y="6" width="6" height="3" rx="1" stroke="#D4A359" strokeWidth="1.5" />
    <path d="M11 11c0-1.2 1.2-2 2.5-2h9c1.3 0 2.5.8 2.5 2l1.2 13c.1 1.5-1 2.8-2.5 2.8h-11c-1.5 0-2.6-1.3-2.5-2.8l1.3-13z" stroke="#D4A359" strokeWidth="1.5" />
    <circle cx="18" cy="18" r="3.5" stroke="#9EBAA4" strokeWidth="1.2" />
    <path d="M16 18c1-1.5 3-1.5 4 0s-1 2.5-2 2.5" stroke="#D8A49B" strokeWidth="1.2" />
  </svg>
);

// Map module IDs to matching flacon line-art
export const MODULE_FLACON_MAP = {
  dashboard: FlaconEmblem,
  pos: FlaconAtomizer,
  online: FlaconSphere,
  returns: FlaconClassic,
  debtors: FlaconOudJar,
  inventory: FlaconCrystal,
  purchases: FlaconClassic,
  barcodes: FlaconCrystal,
  withdrawals: FlaconDropper,
  capital: FlaconSphere,
  gifts: FlaconAtomizer,
  losses: FlaconDropper,
  mixlab: FlaconCrystal,
  discounts: FlaconClassic,
  categories: FlaconOudJar,
  notes: FlaconClassic,
  invoices: FlaconClassic,
  advisor: FlaconEmblem,
  shift: FlaconOudJar,
  settings: FlaconCrystal
};
