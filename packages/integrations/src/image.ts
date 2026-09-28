import { readBoundedJson } from './http.js';

export type ImageProvider = 'openai' | 'stability';

export async function generateImage(
  apiKey: string,
  prompt: string,
  provider: ImageProvider = 'openai',
): Promise<{ src: string }> {
  if (!prompt.trim() || prompt.length > 4_000)
    throw new Error('Image prompt must be between 1 and 4,000 characters.');
  if (provider === 'stability') return generateStabilityImage(apiKey, prompt);
  if (provider !== 'openai') throw new Error('Unsupported image provider.');
  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    signal: AbortSignal.timeout(60_000),
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-image-1', prompt, size: '1024x1024', n: 1 }),
  });
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(`Image generation failed (${response.status}).`);
  }
  // GPT Image returns base64 image bytes; legacy image models may return a hosted URL.
  const result = await readBoundedJson<{
    data?: { b64_json?: string; url?: string; output_format?: string }[];
  }>(response, 20_000_000);
  const image = result.data?.[0];
  if (image?.b64_json) {
    if (
      image.b64_json.length > 18_000_000 ||
      image.b64_json.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(image.b64_json)
    )
      throw new Error('Image provider returned invalid image data.');
    const format = image.output_format ?? 'png';
    const mimeType =
      format === 'jpeg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';
    return { src: `data:${mimeType};base64,${image.b64_json}` };
  }
  if (image?.url) {
    let url: URL;
    try {
      url = new URL(image.url);
    } catch {
      throw new Error('Image provider returned an invalid image URL.');
    }
    if (url.protocol !== 'https:') throw new Error('Image provider returned an unsafe image URL.');
    return { src: url.toString() };
  }
  throw new Error('Image provider returned no image data.');
}

async function generateStabilityImage(apiKey: string, prompt: string): Promise<{ src: string }> {
  const form = new FormData();
  form.set('prompt', prompt);
  form.set('output_format', 'png');
  const response = await fetch('https://api.stability.ai/v2beta/stable-image/generate/core', {
    method: 'POST',
    signal: AbortSignal.timeout(60_000),
    headers: { authorization: `Bearer ${apiKey}`, accept: 'image/*' },
    body: form,
  });
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(`Image generation failed (${response.status}).`);
  }
  const mimeType = response.headers.get('content-type')?.split(';', 1)[0]?.trim();
  if (mimeType !== 'image/png' && mimeType !== 'image/jpeg' && mimeType !== 'image/webp') {
    await response.body?.cancel().catch(() => undefined);
    throw new Error('Stability AI returned an unsupported image format.');
  }
  const bytes = await readBoundedBytes(response, 20_000_000);
  if (!bytes.length) throw new Error('Stability AI returned an empty image.');
  return { src: `data:${mimeType};base64,${Buffer.from(bytes).toString('base64')}` };
}

async function readBoundedBytes(response: Response, maximumBytes: number): Promise<Uint8Array> {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error('Image provider response exceeded the size limit.');
  }
  if (!response.body) throw new Error('Image provider returned no image body.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        throw new Error('Image provider response exceeded the size limit.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const output = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}
