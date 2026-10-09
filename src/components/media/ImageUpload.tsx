import { useState } from 'react';
import { compressForSlide } from '@/lib/media/imageCompression';
import { cacheImage } from '@/lib/media/imageCaching';
import styles from './ImageUpload.module.css';

interface ImageUploadProps {
  onImageAdded: (blobUrl: string, originalName: string, cacheKey: string) => void;
}

export function ImageUpload({ onImageAdded }: ImageUploadProps) {
  const [status, setStatus] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);

    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      setStatus(`Compressing ${file.name}... (${i + 1}/${fileArray.length})`);

      try {
        // Compress
        const compressed = await compressForSlide(file);

        // Cache with file name and size as key
        const cacheKey = `image:${file.name}-${file.size}`;
        const blobUrl = await cacheImage(cacheKey, compressed);

        // Notify parent
        onImageAdded(blobUrl, file.name, cacheKey);

        setStatus(`Added ${file.name}`);
      } catch (error) {
        console.error('Failed to process image:', error);
        setStatus(`Error: ${file.name}`);
      }
    }

    setTimeout(() => setStatus(''), 2000);
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
      {status && <div className={styles.status}>{status}</div>}
    </div>
  );
}
