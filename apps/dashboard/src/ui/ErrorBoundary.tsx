import { Component, type ReactNode } from 'react';

export class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean; revision: number }
> {
  state = { failed: false, revision: 0 };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <main className="settings-card" role="alert">
          <h1>The dashboard could not display this page</h1>
          <p>
            Your saved data remains in the local service. Retry this page or return to the league
            desk.
          </p>
          <button
            onClick={() => this.setState({ failed: false, revision: this.state.revision + 1 })}
          >
            Retry page
          </button>
          <button
            onClick={() => {
              window.location.hash = '/desk';
              window.location.reload();
            }}
          >
            Open league desk
          </button>
        </main>
      );
    return <div key={this.state.revision}>{this.props.children}</div>;
  }
}
