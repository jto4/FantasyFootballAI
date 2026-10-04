import { useState, useEffect } from 'react';
import type { LocalImage, SecretState } from '../CredentialsSection';
import { readImageProviderPreference } from '../image-provider';
export function useImageLibrary(secretState: SecretState, setMessage: (message: string) => void) {
  const [imagePrompt, setImagePrompt] = useState('');
  const [imageProvider, setImageProvider] = useState<'openai' | 'stability'>(() =>
    readImageProviderPreference(),
  );
  const [imageProviderManuallySelected, setImageProviderManuallySelected] = useState(false);
  const [generatedImage, setGeneratedImage] = useState('');
  const [localImages, setLocalImages] = useState<LocalImage[]>([]);
  const [imageLibraryLoading, setImageLibraryLoading] = useState(true);
  const [imageLibraryError, setImageLibraryError] = useState('');
  const [imageGenerationBusy, setImageGenerationBusy] = useState(false);

  const imageProviderCredential =
    imageProvider === 'openai' ? 'image-generation' : 'stability-image-generation';
  const imageGenerationConfigured =
    secretState.find((item) => item.provider === imageProviderCredential)?.configured === true;
  const imageProviderConfigured = secretState.some(
    (item) =>
      (item.provider === 'image-generation' || item.provider === 'stability-image-generation') &&
      item.configured,
  );

  useEffect(() => {
    if (
      !imageProviderManuallySelected &&
      !secretState.find((item) => item.provider === 'image-generation')?.configured &&
      secretState.find((item) => item.provider === 'stability-image-generation')?.configured
    )
      setImageProvider('stability');
  }, [imageProviderManuallySelected, secretState]);

  async function createImage() {
    setImageGenerationBusy(true);
    setGeneratedImage('');
    setMessage('Generating image. The prompt will be sent to the image provider.');
    try {
      const response = await fetch('/api/images', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: imagePrompt, provider: imageProvider }),
      });
      const result = (await response.json()) as {
        id?: string;
        src?: string;
        saved?: boolean;
        createdAt?: string;
        size?: number;
        mimeType?: string;
        error?: string;
      };
      if (!response.ok || !result.src)
        throw new Error(result.error ?? 'Image generation did not return an image.');
      setGeneratedImage(result.src);
      if (result.saved && result.id && result.createdAt && result.size && result.mimeType) {
        setLocalImages((images) => [
          {
            id: result.id!,
            createdAt: result.createdAt!,
            size: result.size!,
            mimeType: result.mimeType!,
          },
          ...images,
        ]);
        setMessage('Image generated and saved in your local data folder.');
      } else {
        setMessage('Image preview generated. Download it to keep a local copy.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Image generation failed.');
    } finally {
      setImageGenerationBusy(false);
    }
  }

  async function refreshImages() {
    setImageLibraryLoading(true);
    setImageLibraryError('');
    try {
      const response = await fetch('/api/images');
      if (!response.ok)
        throw new Error(`Could not read the local image library (${response.status}).`);
      const images = (await response.json()) as LocalImage[];
      if (!Array.isArray(images)) throw new Error('The local image library response was invalid.');
      setLocalImages(images);
    } catch (error) {
      setImageLibraryError(
        error instanceof Error ? error.message : 'Could not read the local image library.',
      );
    } finally {
      setImageLibraryLoading(false);
    }
  }

  async function removeLocalImage(id: string) {
    if (!window.confirm('Permanently delete this image from the local data folder?')) return;
    const response = await fetch(`/api/images/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!response.ok) {
      setMessage('Could not delete that local image.');
      return;
    }
    setLocalImages((images) => images.filter((image) => image.id !== id));
    if (generatedImage === `/api/images/${id}`) setGeneratedImage('');
    setMessage('Local image deleted.');
  }

  return {
    imagePrompt,
    setImagePrompt,
    imageProvider,
    setImageProvider,
    setImageProviderManuallySelected,
    generatedImage,
    localImages,
    imageLibraryLoading,
    imageLibraryError,
    imageGenerationBusy,
    imageGenerationConfigured,
    imageProviderConfigured,
    createImage,
    refreshImages,
    removeLocalImage,
  };
}
