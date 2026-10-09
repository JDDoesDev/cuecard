import { useState } from 'react';
import { usePresentationStore } from '@/hooks/usePresentationStore';
import type { SlideElement } from '@/types/slide';
import { ImageUpload } from '@/components/media/ImageUpload';
import { URLImageInput } from '@/components/media/URLImageInput';
import { extractYouTubeId } from '@/components/media/YouTubeEmbed';
import styles from './AddElementToolbar.module.css';

interface AddElementToolbarProps {
  slideIndex: number;
  showGrid: boolean;
  onGridToggle: () => void;
}

/**
 * Toolbar for adding new elements to the current slide.
 * Provides buttons for 7 element types: text, image, video, code, rectangle, circle, line.
 * Also includes grid toggle control.
 */
export function AddElementToolbar({ slideIndex, showGrid, onGridToggle }: AddElementToolbarProps) {
  const store = usePresentationStore();
  const [imagePopoverOpen, setImagePopoverOpen] = useState(false);
  const [imageTab, setImageTab] = useState<'upload' | 'url'>('upload');
  const [videoPopoverOpen, setVideoPopoverOpen] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');

  const addElement = (element: SlideElement) => {
    store.addElement(slideIndex, element);
  };

  // Element creation functions with sensible defaults
  const addText = () => {
    addElement({
      id: crypto.randomUUID(),
      type: 'text',
      position: { x: 25, y: 25, width: 50, height: 15 },
      content: 'New text',
    });
  };

  // `url` keeps the original filename / remote URL (used for markdown export
  // and relinking); the blob itself lives in IndexedDB under `cacheKey` and
  // `cachedUrl` is regenerated each session by App's image-restore effect.
  const handleImageAdded = (blobUrl: string, originalName: string, cacheKey?: string) => {
    addElement({
      id: crypto.randomUUID(),
      type: 'image',
      position: { x: 25, y: 15, width: 50, height: 60 },
      url: originalName,
      ...(blobUrl ? { cachedUrl: blobUrl } : {}),
      ...(cacheKey ? { cacheKey } : {}),
    });
    setImagePopoverOpen(false);
  };

  const handleVideoSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedUrl = videoUrl.trim();
    if (!trimmedUrl) return;

    const videoId = extractYouTubeId(trimmedUrl);
    if (!videoId) {
      alert('Invalid YouTube URL');
      return;
    }

    addElement({
      id: crypto.randomUUID(),
      type: 'video',
      position: { x: 15, y: 10, width: 70, height: 70 },
      url: trimmedUrl,
    });

    setVideoUrl('');
    setVideoPopoverOpen(false);
  };

  const addCode = () => {
    addElement({
      id: crypto.randomUUID(),
      type: 'code',
      position: { x: 10, y: 15, width: 80, height: 60 },
      code: '',
      language: 'typescript',
    });
  };

  const addRectangle = () => {
    addElement({
      id: crypto.randomUUID(),
      type: 'rectangle',
      position: { x: 30, y: 30, width: 40, height: 30 },
      fill: 'transparent',
      stroke: '#333',
      strokeWidth: 2,
    });
  };

  const addCircle = () => {
    addElement({
      id: crypto.randomUUID(),
      type: 'circle',
      position: { x: 30, y: 25, width: 40, height: 40 },
      fill: 'transparent',
      stroke: '#333',
      strokeWidth: 2,
    });
  };

  const addLine = () => {
    addElement({
      id: crypto.randomUUID(),
      type: 'line',
      position: { x: 20, y: 48, width: 60, height: 4 },
      stroke: '#333',
      strokeWidth: 2,
    });
  };

  const addHtml = () => {
    addElement({
      id: crypto.randomUUID(),
      type: 'html',
      position: { x: 20, y: 20, width: 60, height: 40 },
      htmlContent: '<div>Custom HTML</div>',
    });
  };

  return (
    <div className={styles.toolbar}>
      <div className={styles.section}>
        <span className={styles.label}>Add:</span>
        <button
          className={styles.button}
          onClick={addText}
          title="Add Text"
          aria-label="Add Text"
        >
          T
        </button>
        <div className={styles.popoverContainer}>
          <button
            className={styles.button}
            onClick={() => setImagePopoverOpen(!imagePopoverOpen)}
            title="Add Image"
            aria-label="Add Image"
            data-active={imagePopoverOpen}
          >
            Img
          </button>
          {imagePopoverOpen && (
            <div className={styles.popover}>
              <div className={styles.popoverTabs}>
                <button
                  className={imageTab === 'upload' ? styles.activeTab : ''}
                  onClick={() => setImageTab('upload')}
                >
                  Upload
                </button>
                <button
                  className={imageTab === 'url' ? styles.activeTab : ''}
                  onClick={() => setImageTab('url')}
                >
                  URL
                </button>
              </div>
              <div className={styles.popoverContent}>
                {imageTab === 'upload' ? (
                  <ImageUpload onImageAdded={handleImageAdded} />
                ) : (
                  <URLImageInput onImageAdded={handleImageAdded} />
                )}
              </div>
            </div>
          )}
        </div>
        <div className={styles.popoverContainer}>
          <button
            className={styles.button}
            onClick={() => setVideoPopoverOpen(!videoPopoverOpen)}
            title="Add Video"
            aria-label="Add Video"
            data-active={videoPopoverOpen}
          >
            Vid
          </button>
          {videoPopoverOpen && (
            <div className={styles.popover}>
              <div className={styles.popoverContent}>
                <form onSubmit={handleVideoSubmit} className={styles.videoForm}>
                  <input
                    type="text"
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    placeholder="YouTube URL"
                    className={styles.videoInput}
                  />
                  <button type="submit" className={styles.videoButton}>
                    Add
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
        <button
          className={styles.button}
          onClick={addCode}
          title="Add Code Block"
          aria-label="Add Code Block"
        >
          &lt;/&gt;
        </button>
        <button
          className={styles.button}
          onClick={addHtml}
          title="Add HTML Element"
          aria-label="Add HTML Element"
        >
          HTML
        </button>
      </div>

      <div className={styles.separator} />

      <div className={styles.section}>
        <button
          className={styles.button}
          onClick={addRectangle}
          title="Add Rectangle"
          aria-label="Add Rectangle"
        >
          ▢
        </button>
        <button
          className={styles.button}
          onClick={addCircle}
          title="Add Circle"
          aria-label="Add Circle"
        >
          ○
        </button>
        <button
          className={styles.button}
          onClick={addLine}
          title="Add Line"
          aria-label="Add Line"
        >
          ╱
        </button>
      </div>

      <div className={styles.separator} />

      <div className={styles.section}>
        <button
          className={styles.button}
          data-active={showGrid}
          onClick={onGridToggle}
          title="Toggle Grid"
          aria-label="Toggle Grid"
        >
          Grid
        </button>
      </div>
    </div>
  );
}
