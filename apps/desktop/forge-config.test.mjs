import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const configPath = './forge.config.cjs';
const environmentKeys = [
  'SIDEKICK_MACOS_SIGNING',
  'APPLE_ID',
  'APPLE_APP_SPECIFIC_PASSWORD',
  'APPLE_TEAM_ID',
  'SIDEKICK_WINDOWS_SIGNING',
  'WINDOWS_CERTIFICATE_FILE',
  'WINDOWS_CERTIFICATE_PASSWORD',
];
const originalEnvironment = new Map(environmentKeys.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const [key, value] of originalEnvironment) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  delete require.cache[require.resolve(configPath)];
});

test('keeps local desktop packaging unsigned by default', () => {
  delete process.env.SIDEKICK_MACOS_SIGNING;
  delete process.env.APPLE_ID;
  delete process.env.APPLE_APP_SPECIFIC_PASSWORD;
  delete process.env.APPLE_TEAM_ID;
  delete process.env.SIDEKICK_WINDOWS_SIGNING;
  delete process.env.WINDOWS_CERTIFICATE_FILE;
  delete process.env.WINDOWS_CERTIFICATE_PASSWORD;

  const { packagerConfig, makers } = require(configPath);
  assert.equal('osxSign' in packagerConfig, false);
  assert.equal('osxNotarize' in packagerConfig, false);
  const macUpdateArchive = makers.find((maker) => maker.name === '@electron-forge/maker-zip');
  assert.deepEqual(macUpdateArchive.platforms, ['darwin']);
  const squirrel = makers.find((maker) => maker.name === '@electron-forge/maker-squirrel');
  assert.equal('certificateFile' in squirrel.config, false);
  assert.equal('certificatePassword' in squirrel.config, false);
  const rpm = makers.find((maker) => maker.name === '@electron-forge/maker-rpm');
  assert.equal(rpm.config.options.bin, 'Sunday Sidekick');
  assert.equal(rpm.config.options.license, 'MIT');
});

test('maps Windows signing credentials only after explicit signing opt-in', () => {
  process.env.SIDEKICK_WINDOWS_SIGNING = '1';
  process.env.WINDOWS_CERTIFICATE_FILE = 'C:\\runner-temp\\signing.pfx';
  process.env.WINDOWS_CERTIFICATE_PASSWORD = 'test-certificate-password';

  const { makers } = require(configPath);
  const squirrel = makers.find((maker) => maker.name === '@electron-forge/maker-squirrel');
  assert.equal(squirrel.config.certificateFile, 'C:\\runner-temp\\signing.pfx');
  assert.equal(squirrel.config.certificatePassword, 'test-certificate-password');
});

test('maps Apple credentials into Forge only after explicit signing opt-in', () => {
  process.env.SIDEKICK_MACOS_SIGNING = '1';
  process.env.APPLE_ID = 'owner@example.test';
  process.env.APPLE_APP_SPECIFIC_PASSWORD = 'test-app-password';
  process.env.APPLE_TEAM_ID = 'TEAM123456';

  const { packagerConfig } = require(configPath);
  assert.deepEqual(packagerConfig.osxSign, {});
  assert.deepEqual(packagerConfig.osxNotarize, {
    appleId: 'owner@example.test',
    appleIdPassword: 'test-app-password',
    teamId: 'TEAM123456',
  });
});
