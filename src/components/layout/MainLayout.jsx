import React from 'react';
import Header from './Header.jsx';
import Navigation from './Navigation.jsx';
import ErrorBoundary from '../ErrorBoundary.jsx';

/**
 * Organic Atelier MainLayout
 * Features:
 * - Curved canopy header with gradient arch
 * - Ambient organic decorative petals
 * - Smooth content container
 */
const MainLayout = ({
  modules = [],
  activeModule,
  onSelect,
  children,
  headerActions
}) => {
  return (
    <div
      className="h-screen flex flex-col overflow-hidden relative"
      style={{ background: 'var(--bg-primary)' }}
      dir="rtl"
    >
      {/* Background Ambient Organic Petals */}
      <div
        className="ambient-petal w-72 h-96 -left-16 top-28 rotate-12 opacity-40 dark:opacity-10"
        style={{
          background: 'linear-gradient(135deg, #9EBAA4 0%, #DCE7DD 100%)',
          borderRadius: '50% 50% 45% 55% / 40% 60% 40% 60%'
        }}
        aria-hidden="true"
      />
      <div
        className="ambient-petal w-64 h-80 -left-10 top-72 -rotate-12 opacity-35 dark:opacity-10"
        style={{
          background: 'linear-gradient(135deg, #FBE8C8 0%, #D4A359 100%)',
          borderRadius: '45% 55% 60% 40% / 55% 45% 55% 45%'
        }}
        aria-hidden="true"
      />

      {/* Organic Canopy Header */}
      <header className="canopy-header z-20 shrink-0">
        <Header>{headerActions}</Header>
        <Navigation
          modules={modules}
          activeModule={activeModule}
          onSelect={onSelect}
        />
      </header>

      {/* Main Content Pane */}
      <main className="flex-1 overflow-hidden p-4 relative z-10">
        <ErrorBoundary>
          <div className="h-full w-full">{children}</div>
        </ErrorBoundary>
      </main>
    </div>
  );
};

export default MainLayout;
