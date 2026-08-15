import { Component } from 'react';
import { RotateCw } from 'lucide-react';

/**
 * ============================================================================
 * ErrorBoundary.jsx
 * ============================================================================
 * React class-component error boundary.
 *
 * Catches render / lifecycle errors thrown by any descendant, logs them to the
 * console (and an optional `onError` callback), and renders a themed Arabic
 * fallback UI with an "إعادة تحميل" (reload) action that resets the boundary so
 * the subtree is rendered again.
 *
 * @param {Object}   props
 * @param {React.ReactNode} props.children       - Subtree to guard
 * @param {React.ComponentType} [props.fallback] - Custom fallback component. It
 *   receives `{ error, resetError }` as props.
 * @param {Function} [props.onError]             - Optional error callback
 */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null
    };
  }

  /**
   * Triggered when a child throws during render. Update state so the next
   * render shows the fallback UI instead of crashing the whole app.
   */
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  /**
   * Called after an error is caught. Logs for diagnostics and forwards to an
   * optional external handler (e.g. telemetry / analytics).
   */
  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] caught render error:', error, errorInfo);
    if (typeof this.props.onError === 'function') {
      this.props.onError(error, errorInfo);
    }
  }

  /**
   * Reset the boundary state so the guarded subtree is re-rendered. The subtree
   * will re-throw if the underlying cause is still present.
   */
  resetError = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      const { fallback: Fallback } = this.props;
      const fallbackProps = {
        error: this.state.error,
        resetError: this.resetError
      };

      // Allow consumers to supply a fully custom fallback UI.
      if (Fallback) {
        return <Fallback {...fallbackProps} />;
      }

      const message = this.state.error?.message || 'حدث خطأ غير متوقع';

      return (
        <div
          className="h-full min-h-[320px] flex items-center justify-center p-6"
          dir="rtl"
        >
          <div
            className="glass-card w-full max-w-md p-8 text-center"
            role="alert"
          >
            <div className="text-6xl mb-4" aria-hidden="true">
              😔
            </div>

            <h2 className="text-xl font-bold text-[#e6edf3] mb-2">
              حدث خطأ غير متوقع
            </h2>

            <p className="text-sm text-[#adbac7] mb-6 leading-relaxed break-words">
              {message}
            </p>

            <button
              type="button"
              onClick={this.resetError}
              className="btn-primary w-full inline-flex items-center justify-center gap-2"
            >
              <RotateCw className="w-4 h-4" aria-hidden="true" />
              إعادة تحميل
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
