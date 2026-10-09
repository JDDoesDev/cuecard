import { useState } from 'react';
import { fetchAndCacheImage } from '@/lib/media/urlToBlob';
import styles from './URLImageInput.module.css';

interface URLImageInputProps {
  onImageAdded: (blobUrl: string, originalUrl: string, cacheKey?: string) => void;
}

export function URLImageInput({ onImageAdded }: URLImageInputProps) {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedUrl = url.trim();

    // Validate URL format
    if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) {
      setError('URL must start with http:// or https://');
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      const { blobUrl, cacheKey } = await fetchAndCacheImage(trimmedUrl);
      onImageAdded(blobUrl === trimmedUrl ? '' : blobUrl, trimmedUrl, cacheKey);
      setUrl(''); // Clear input on success
    } catch (err) {
      console.error('Failed to add image from URL:', err);
      setError('Failed to load image. Check URL or CORS permissions.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.inputGroup}>
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/image.jpg"
          className={styles.input}
          disabled={isLoading}
        />
        <button type="submit" className={styles.button} disabled={isLoading || !url.trim()}>
          {isLoading ? 'Loading...' : 'Add'}
        </button>
      </div>
      {error && <div className={styles.error}>{error}</div>}
    </form>
  );
}
