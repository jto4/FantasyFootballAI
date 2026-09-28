export function createDesktopSmokePlan(platform, isCi) {
  const skipHostedWindowsRuntimeSmoke = platform === 'win32' && isCi;
  const useXvfb = platform === 'linux' && isCi;

  return {
    skipHostedWindowsRuntimeSmoke,
    useXvfb,
    sandboxArgs: useXvfb ? ['--no-sandbox'] : [],
  };
}
