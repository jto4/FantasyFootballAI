import { Router } from 'express';
import {
  deleteLocalImage,
  listLocalImages,
  readLocalImage,
  saveGeneratedImage,
} from './image-library.js';

export interface ImageRouteDependencies {
  databasePath: string;
  readImageGenerationKey: (provider: 'openai' | 'stability') => Promise<string | undefined>;
  generateImage: (
    key: string,
    prompt: string,
    provider: 'openai' | 'stability',
  ) => Promise<{ src: string }>;
}

/** Keep image-library HTTP behavior out of the API bootstrap and inject provider access. */
export function createImageRouter(dependencies: ImageRouteDependencies): Router {
  const router = Router();

  router.post('/api/images', async (req, res) => {
    const { prompt, provider = 'openai' } = req.body as {
      prompt?: unknown;
      provider?: unknown;
    };
    if (provider !== 'openai' && provider !== 'stability')
      return res.status(400).json({ error: 'Unsupported image provider.' });
    if (typeof prompt !== 'string') return res.status(400).json({ error: 'Prompt is required.' });
    if (!prompt.trim() || prompt.length > 4_000)
      return res
        .status(400)
        .json({ error: 'Image prompt must be between 1 and 4,000 characters.' });
    try {
      const key = await dependencies.readImageGenerationKey(provider);
      if (!key)
        return res.status(409).json({ error: `Save a ${provider} image key in Settings first.` });
      const generated = await dependencies.generateImage(key, prompt, provider);
      if (generated.src.startsWith('data:image/')) {
        const saved = await saveGeneratedImage(dependencies.databasePath, generated.src);
        return res.status(201).json({ ...saved, src: `/api/images/${saved.id}`, saved: true });
      }
      return res.json({ src: generated.src, saved: false });
    } catch (error) {
      res
        .status(502)
        .json({ error: error instanceof Error ? error.message : 'Image generation failed.' });
    }
  });

  router.get('/api/images', async (_req, res) => {
    try {
      res.json(await listLocalImages(dependencies.databasePath));
    } catch {
      res.status(500).json({ error: 'Could not read the local image library.' });
    }
  });

  router.get('/api/images/:id', async (req, res) => {
    try {
      const stored = await readLocalImage(dependencies.databasePath, req.params.id ?? '');
      if (!stored) return res.status(404).json({ error: 'Local image not found.' });
      res.setHeader('Content-Type', stored.image.mimeType);
      res.setHeader('Content-Length', stored.contents.length);
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      if (req.query.download === '1') {
        const extension =
          stored.image.mimeType === 'image/jpeg'
            ? 'jpg'
            : stored.image.mimeType === 'image/webp'
              ? 'webp'
              : 'png';
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="sunday-sidekick-${stored.image.id}.${extension}"`,
        );
      }
      return res.send(stored.contents);
    } catch {
      return res.status(500).json({ error: 'Could not read the local image.' });
    }
  });

  router.delete('/api/images/:id', async (req, res) => {
    try {
      if (!(await deleteLocalImage(dependencies.databasePath, req.params.id ?? '')))
        return res.status(404).json({ error: 'Local image not found.' });
      return res.status(204).end();
    } catch {
      return res.status(500).json({ error: 'Could not delete the local image.' });
    }
  });

  return router;
}
