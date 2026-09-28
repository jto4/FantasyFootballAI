export function createDesktopSmokePlan(platform, isCi) {
  const skipGuiSmoke = platform === 'win32' && isCi;
  const useXvfb = platform === 'linux' && isCi;

  return {
    skipGuiSmoke,
    useXvfb,
    sandboxArgs: useXvfb ? ['--no-sandbox'] : [],
  };
}
