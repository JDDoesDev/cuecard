import { useEffect, useState } from 'react';
import { listProjectAssets, type ProjectAsset } from '@/lib/media/projectAssets';
import styles from './ProjectAssetPicker.module.css';

interface ProjectAssetPickerProps {
  onImageAdded: (blobUrl: string, url: string) => void;
}

/** Pick an image already in the project's public/assets folder. */
export function ProjectAssetPicker({ onImageAdded }: ProjectAssetPickerProps) {
  const [assets, setAssets] = useState<ProjectAsset[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    listProjectAssets().then((files) => {
      if (!cancelled) setAssets(files);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!assets) return <div className={styles.hint}>Loading…</div>;
  if (assets.length === 0) {
    return (
      <div className={styles.hint}>
        No images yet. Put image files in <code>public/assets</code>, or upload one.
      </div>
    );
  }

  return (
    <ul className={styles.grid}>
      {assets.map((asset) => (
        <li key={asset.url}>
          <button
            type="button"
            className={styles.item}
            title={asset.name}
            aria-label={`Add ${asset.name}`}
            onClick={() => onImageAdded('', asset.url)}
          >
            <img src={asset.url} alt="" loading="lazy" />
            <span>{asset.name}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
