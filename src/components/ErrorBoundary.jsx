"use client";

import { Component } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

/**
 * Reusable error boundary that catches render errors in its children and
 * displays a friendly fallback instead of crashing the whole page.
 *
 * Usage:
 *   <ErrorBoundary label="Fee Management">
 *     <FeesTab />
 *   </ErrorBoundary>
 *
 * When a child throws, the boundary shows:
 *   - A "Something went wrong" card with the tab/section name
 *   - The error message (collapsed by default)
 *   - A "Try again" button that re-mounts the children
 *
 * In development mode, the full stack trace is visible for debugging.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, showDetails: false };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    // Log to console in development for easier debugging
    if (process.env.NODE_ENV !== "production") {
      console.error(
        `[ErrorBoundary] ${this.props.label || "Component"} crashed:`,
        error,
        errorInfo
      );
    }
  }

  render() {
    if (this.state.error) {
      const label = this.props.label || "this section";
      return (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-rose-500" />
          <h3 className="mt-3 text-sm font-bold text-rose-800">
            Something went wrong in {label}
          </h3>
          <p className="mt-1 text-xs text-rose-600">
            This section hit an unexpected error. The rest of the page is
            unaffected.
          </p>

          <button
            onClick={() =>
              this.setState({ error: null, showDetails: false })
            }
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-rose-500"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Try again
          </button>

          {process.env.NODE_ENV !== "production" && (
            <div className="mt-4 text-left">
              <button
                onClick={() =>
                  this.setState((s) => ({
                    showDetails: !s.showDetails,
                  }))
                }
                className="text-[11px] font-medium text-rose-500 underline transition hover:text-rose-700"
              >
                {this.state.showDetails ? "Hide" : "Show"} error details
              </button>
              {this.state.showDetails && (
                <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-white p-3 text-left text-[11px] leading-relaxed text-rose-800 ring-1 ring-rose-200">
                  {this.state.error?.message}
                  {"\n\n"}
                  {this.state.error?.stack}
                </pre>
              )}
            </div>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
