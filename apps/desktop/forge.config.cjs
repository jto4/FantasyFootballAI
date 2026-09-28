module.exports = {
  outDir: process.env.SIDEKICK_DESKTOP_OUT,
  packagerConfig: {
    asar: true,
    executableName: 'Sunday Sidekick',
    appBundleId: 'com.sundaysidekick.app',
    name: 'Sunday Sidekick',
  },
  makers: [
    {
      name: '@electron-forge/maker-dmg',
      platforms: ['darwin'],
      config: { format: 'ULFO' },
    },
    {
      name: '@electron-forge/maker-squirrel',
      platforms: ['win32'],
      config: { name: 'SundaySidekick', authors: 'Sunday Sidekick' },
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
  ],
};
