import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateImage } from './image.js';

describe('image generation', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns GPT Image base64 output as a data URL', async () => {
    const image = Buffer.alloc(300_000, 7).toString('base64');
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ data: [{ b64_json: image, output_format: 'webp' }] })),
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateImage('secret-key', 'Fantasy football trophy');

    expect(result.src).toBe(`data:image/webp;base64,${image}`);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.com/v1/images/generations',
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: 'Bearer secret-key' }),
      }),
    );
  });

  it('supports secure hosted image URLs from compatible models', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ data: [{ url: 'https://images.example.test/result.png' }] }),
          ),
        ),
    );

    await expect(generateImage('key', 'A team logo')).resolves.toEqual({
      src: 'https://images.example.test/result.png',
    });
  });

  it('uses Stability AI Stable Image Core and stores its binary response as local image data', async () => {
    const imageBytes = Buffer.from('stability-image-bytes');
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(imageBytes, { headers: { 'content-type': 'image/png' } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateImage('stability-secret', 'A fantasy league trophy', 'stability');

    expect(result.src).toBe(`data:image/png;base64,${imageBytes.toString('base64')}`);
    const [url, request] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('https://api.stability.ai/v2beta/stable-image/generate/core');
    expect(request?.method).toBe('POST');
    expect(request?.headers).toMatchObject({
      authorization: 'Bearer stability-secret',
      accept: 'image/*',
    });
    expect(request?.body).toBeInstanceOf(FormData);
    expect((request?.body as FormData).get('prompt')).toBe('A fantasy league trophy');
    expect((request?.body as FormData).get('output_format')).toBe('png');
  });

  it('rejects unsupported Stability response types and oversized binary responses', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('not an image', { headers: { 'content-type': 'text/html' } }),
      )
      .mockResolvedValueOnce(
        new Response('x'.repeat(20_000_001), { headers: { 'content-type': 'image/png' } }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateImage('key', 'A logo', 'stability')).rejects.toThrow(
      'Stability AI returned an unsupported image format.',
    );
    await expect(generateImage('key', 'A logo', 'stability')).rejects.toThrow(/size limit/);
  });

  it('rejects invalid prompts and unsafe or malformed image results', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(generateImage('key', '  ')).rejects.toThrow(/prompt/);
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [{ url: 'http://images.example.test/result.png' }] })),
    );
    await expect(generateImage('key', 'A logo')).rejects.toThrow(/unsafe/);

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ b64_json: '!!!!' }] })));
    await expect(generateImage('key', 'A logo')).rejects.toThrow(/invalid image data/);
  });

  it('bounds large provider results and reports sanitized HTTP errors', async () => {
    const oversized = 'x'.repeat(20_000_001);
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response(oversized))
        .mockResolvedValueOnce(new Response('secret provider detail', { status: 401 })),
    );
    await expect(generateImage('key', 'A logo')).rejects.toThrow(/size limit/);
    await expect(generateImage('key', 'A logo')).rejects.toThrow('Image generation failed (401).');
  });
});
