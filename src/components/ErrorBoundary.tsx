

import { Component, type ReactNode } from "react";

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crash">
        <div className="crash-card">
          <h1>ZTally hit a snag</h1>
          <p>The window failed to draw. Tracking keeps running in the background; nothing was lost.</p>
          <pre>{String(this.state.error.message || this.state.error)}</pre>
          <button className="btn primary" onClick={() => location.reload()}>
            Reload window
          </button>
        </div>
      </div>
    );
  }
}
