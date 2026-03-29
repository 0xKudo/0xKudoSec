import { Component } from 'react';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '32px', color: 'var(--severity-critical)', fontFamily: 'var(--font)' }}>
          <h2>Tool Error</h2>
          <p style={{ marginTop: '8px', color: 'var(--text-muted)' }}>
            {this.state.error?.message || 'This tool encountered an unexpected error.'}
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
