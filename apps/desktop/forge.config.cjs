module.exports = {
  outDir: process.env.SIDEKICK_DESKTOP_OUT,
  packagerConfig: {
    asar: true,
    executableName: 'Sunday Sidekick',
    appBundleId: 'com.sundaysidekick.app',
    name: 'Sunday Sidekick',
    // Signing is opt-in for local packaging; tagged release jobs set the identity
    // and notarization credentials after importing the maintainer's certificate.
    ...(process.env.SIDEKICK_MACOS_SIGNING === '1'
      ? {
          osxSign: {},
          osxNotarize: {
            appleId: process.env.APPLE_ID,
            appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
            teamId: process.env.APPLE_TEAM_ID,
          },
        }
      : {}),
  },
  makers: [
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-dmg',
      platforms: ['darwin'],
      config: { format: 'ULFO' },
    },
    {
      name: '@electron-forge/maker-squirrel',
      platforms: ['win32'],
      config: {
        name: 'SundaySidekick',
        authors: 'Sunday Sidekick',
        // Local builds remain unsigned; tagged Windows release jobs opt in with
        // an ephemeral PFX and password provided through the runner environment.
        ...(process.env.SIDEKICK_WINDOWS_SIGNING === '1'
          ? {
              certificateFile: process.env.WINDOWS_CERTIFICATE_FILE,
              certificatePassword: process.env.WINDOWS_CERTIFICATE_PASSWORD,
            }
          : {}),
      },
    },
    {
      name: '@electron-forge/maker-deb',
      platforms: ['linux'],
      config: {
        options: {
          maintainer: 'Sunday Sidekick',
          categories: ['Utility'],
          bin: 'Sunday Sidekick',
        },
      },
    },
    {
      name: '@electron-forge/maker-rpm',
      platforms: ['linux'],
      config: {
        options: {
          bin: 'Sunday Sidekick',
        },
      },
    },
  ],
};
