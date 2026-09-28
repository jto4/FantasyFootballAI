import assert from 'node:assert/strict';
import test from 'node:test';
import { checkForDesktopUpdate } from './update-check.mjs';

const latestRelease = (tag_name, options = {}) =>
  new Response(JSON.stringify({ tag_name, draft: false, prerelease: false, ...options }), {
    headers: { 'content-type': 'application/json' },
  });

test('reports a newer published stable release without sending local data', async () => {
  let requestedUrl;
  let requestOptions;
  const result = await checkForDesktopUpdate('0.1.0', async (url, options) => {
    requestedUrl = url;
    requestOptions = options;
    return latestRelease('v0.2.0');
  });

  assert.deepEqual(result, {
    status: 'available',
    currentVersion: '0.1.0',
    latestVersion: '0.2.0',
  });
  assert.equal(requestedUrl, 'https://api.github.com/repos/jto4/FantasyFootballAI/releases/latest');
  assert.equal(requestOptions.method, 'GET');
  assert.equal(requestOptions.headers.Accept, 'application/vnd.github+json');
  assert.equal(requestOptions.headers['X-GitHub-Api-Version'], '2026-03-10');
  assert.equal(requestOptions.redirect, 'error');
  assert.ok(requestOptions.signal instanceof AbortSignal);
  assert.deepEqual(
    Object.keys(requestOptions.headers).sort(),
    ['Accept', 'User-Agent', 'X-GitHub-Api-Version'].sort(),
  );
  assert.equal(requestOptions.body, undefined);
});

test('reports current, no published release, and network error states clearly', async () => {
  assert.deepEqual(await checkForDesktopUpdate('0.1.0', async () => latestRelease('v0.1.0')), {
    status: 'current',
    currentVersion: '0.1.0',
    latestVersion: '0.1.0',
  });
  assert.deepEqual(
    await checkForDesktopUpdate('0.1.0', async () => new Response(null, { status: 404 })),
    { status: 'unreleased', currentVersion: '0.1.0' },
  );
  const unavailable = await checkForDesktopUpdate('0.1.0', async () => {
    throw new Error('contains implementation details');
  });
  assert.equal(unavailable.status, 'error');
  assert.equal(unavailable.message.includes('implementation details'), false);
});

test('rejects draft, prerelease, malformed, and oversized release metadata', async () => {
  for (const response of [
    latestRelease('v1.0.0', { draft: true }),
    latestRelease('v1.0.0', { prerelease: true }),
    latestRelease('future-release'),
    new Response('x'.repeat(64 * 1024 + 1), {
      headers: { 'content-length': String(64 * 1024 + 1) },
    }),
    new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(64 * 1024 + 1));
          controller.close();
        },
      }),
    ),
  ]) {
    assert.equal((await checkForDesktopUpdate('0.1.0', async () => response)).status, 'error');
  }
});

test('does not treat malformed installed versions as update candidates', async () => {
  let called = false;
  const result = await checkForDesktopUpdate('local-build', async () => {
    called = true;
    return latestRelease('v1.0.0');
  });

  assert.equal(result.status, 'error');
  assert.equal(called, false);
});
