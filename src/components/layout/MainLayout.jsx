import Header from './Header.jsx';
import Navigation from './Navigation.jsx';
import ErrorBoundary from '../ErrorBoundary.jsx';

/**
 * ============================================================================
 * MainLayout.jsx
 * ============================================================================
 * Application shell layout: luxury Header on top, horizontally scrollable
 * Navigation tab bar, and a scrollable main content area.
 *
 * Every rendered child is wrapped in an <ErrorBoundary> so a crash in any
 * module shows the themed fallback UI instead of a blank screen.
 *
 * @param {Object}  props
 * @param {Array<{ id: string, label: string, icon?: React.ComponentType }>} props.modules
 *   - Module definitions passed straight through to <Navigation>.
 * @param {string}  props.activeModule - Currently active module id
 * @param {Function} props.onSelect(id) - Module selection callback
 * @param {React.ReactNode} props.children - Active module content
 * @param {React.ReactNode} [props.headerActions] - Optional actions rendered
 *   inside the header (children slot of <Header>).
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
      className="h-screen flex flex-col overflow-hidden"
      style={{ background: 'var(--bg-primary)' }}
      dir="rtl"
    >
      {/* Luxury header with optional actions */}
      <Header>{headerActions}</Header>

      {/* Module navigation tab bar */}
      <Navigation
        modules={modules}
        activeModule={activeModule}
        onSelect={onSelect}
      />

      {/* Main content area */}
      <main
        className="flex-1 overflow-hidden p-6"
        style={{ background: 'var(--bg-primary)' }}
      >
        <ErrorBoundary>
          <div className="h-full">{children}</div>
        </ErrorBoundary>
      </main>
    </div>
  );
};

export default MainLayout;
