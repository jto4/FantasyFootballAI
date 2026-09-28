import express from 'express';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createImageRouter } from './image-routes.js';

describe('image API routes', () => {
  const servers: Array<ReturnType<ReturnType<typeof express>['listen']>> = [];
  const directories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map(
        (server) =>
          new Promise<void>((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
          }),
      ),
    );
    await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
  });

  async function startServer(
    overrides: Partial<Parameters<typeof createImageRouter>[0]> = {},
  ): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), 'sidekick-image-routes-'));
    directories.push(directory);
    const app = express();
    app.use(express.json());
    app.use(
      createImageRouter({
        databasePath: join(directory, 'state.sqlite'),
        readImageGenerationKey: async () => 'test-key',
        generateImage: async () => ({ src: 'https://images.example.test/generated.png' }),
        ...overrides,
      }),
    );
    const server = app.listen(0, '127.0.0.1');
    servers.push(server);
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('Test server did not bind a port.');
    return `http://127.0.0.1:${address.port}`;
  }

  it('validates prompts and requires a configured image generation key', async () => {
    const generateImage = vi.fn(async () => ({ src: 'unused' }));
    const baseUrl = await startServer({
      readImageGenerationKey: async () => undefined,
      generateImage,
    });

    const missingPrompt = await fetch(`${baseUrl}/api/images`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: '   ' }),
    });
    expect(missingPrompt.status).toBe(400);

    const unconfigured = await fetch(`${baseUrl}/api/images`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'Make a draft day image' }),
    });
    expect(unconfigured.status).toBe(409);
    expect(generateImage).not.toHaveBeenCalled();
  });

  it('stores generated data images and serves, downloads, lists, and deletes them', async () => {
    const imageBytes = Buffer.from('bounded generated image bytes');
    const baseUrl = await startServer({
      generateImage: async () => ({
        src: `data:image/png;base64,${imageBytes.toString('base64')}`,
      }),
    });

    const created = await fetch(`${baseUrl}/api/images`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'A championship trophy' }),
    });
    expect(created.status).toBe(201);
    const image = (await created.json()) as { id: string; src: string; saved: boolean };
    expect(image.saved).toBe(true);

    const listed = await fetch(`${baseUrl}/api/images`);
    expect((await listed.json()).map((entry: { id: string }) => entry.id)).toEqual([image.id]);

    const viewed = await fetch(`${baseUrl}${image.src}`);
    expect(viewed.headers.get('content-type')).toBe('image/png');
    expect(viewed.headers.get('cache-control')).toBe('no-store');
    expect(viewed.headers.get('x-content-type-options')).toBe('nosniff');
    expect(Buffer.from(await viewed.arrayBuffer())).toEqual(imageBytes);

    const downloaded = await fetch(`${baseUrl}${image.src}?download=1`);
    expect(downloaded.headers.get('content-disposition')).toContain(`${image.id}.png`);

    const deleted = await fetch(`${baseUrl}${image.src}`, { method: 'DELETE' });
    expect(deleted.status).toBe(204);
    expect(await (await fetch(`${baseUrl}/api/images`)).json()).toEqual([]);
  });

  it('returns remote generated images without persisting them locally', async () => {
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/images`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'A championship trophy' }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      src: 'https://images.example.test/generated.png',
      saved: false,
    });
    expect(await (await fetch(`${baseUrl}/api/images`)).json()).toEqual([]);
  });
});
