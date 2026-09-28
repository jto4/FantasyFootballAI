import { readBoundedJson } from './http.js';

export async function generateImage(apiKey: string, prompt: string): Promise<{ src: string }> {
  if (!prompt.trim() || prompt.length > 4_000)
    throw new Error('Image prompt must be between 1 and 4,000 characters.');
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
