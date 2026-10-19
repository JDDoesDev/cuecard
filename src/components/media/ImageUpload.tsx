import { useState } from 'react';
import { addImageFile } from '@/lib/media/projectAssets';
import styles from './ImageUpload.module.css';

interface ImageUploadProps {
  onImageAdded: (blobUrl: string, url: string, cacheKey?: string) => void;
}

export function ImageUpload({ onImageAdded }: ImageUploadProps) {
  const [status, setStatus] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    const errors: string[] = [];

    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      if (!file.type.startsWith('image/')) {
        errors.push(`${file.name} is not an image`);
        continue;
      }
      setStatus(`Compressing ${file.name}... (${i + 1}/${fileArray.length})`);

      try {
        const { url, blobUrl, cacheKey } = await addImageFile(file);
        onImageAdded(blobUrl ?? '', url, cacheKey);
      } catch (error) {
        console.error('Failed to process image:', error);
        const reason = error instanceof Error && error.message ? error.message : 'unknown error';
        errors.push(`${file.name}: ${reason}`);
      }
    }

    if (errors.length > 0) {
      setStatus(`Could not add ${errors.join('; ')}`);
      setTimeout(() => setStatus(''), 6000);
    } else {
      setStatus('');
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  return (
    <div className={styles.container}>
      <label
        className={`${styles.dropZone} ${isDragging ? styles.dragging : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileInputChange}
          className={styles.fileInput}
        />
        <div className={styles.dropZoneText}>
          <div>Drop images here or click to browse</div>
          <div className={styles.hint}>Supports multiple files</div>
        </div>
      </label>
      {status && <div className={styles.status} role="status">{status}</div>}
    </div>
  );
}
