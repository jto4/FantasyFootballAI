const headlessArgument = '--sidekick-headless';

export function isHeadlessLaunch(argumentsList) {
  return argumentsList.includes(headlessArgument);
}

export function shouldKeepDashboardClosed({ headless, showWindowRequested }) {
  return headless && !showWindowRequested;
}
