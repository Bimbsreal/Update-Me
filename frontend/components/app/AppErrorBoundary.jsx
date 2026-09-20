'use client';

import { Component } from 'react';

/**
 * Prevents a single page/section crash from blanking the entire app shell.
 */
export class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      message: error?.message || 'Something went wrong.',
    };
  }

  componentDidCatch(error) {
    if (typeof console !== 'undefined') {
      console.error('[AppErrorBoundary]', error?.message || error);
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, message: '' });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="mx-auto max-w-lg rounded-card border border-status-attention/30 bg-white p-6 text-center shadow-card">
          <h2 className="text-lg font-bold text-ink">This section could not load</h2>
          <p className="mt-2 text-sm text-ink-muted">
            {this.props.fallbackMessage ||
              'An unexpected error occurred. You can try again or continue using other parts of Update Me.'}
          </p>
          <button
            type="button"
            onClick={this.handleRetry}
            className="mt-4 rounded-control bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
