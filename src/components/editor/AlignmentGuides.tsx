import type { SnapLine } from '@/lib/editor/snapGuides';
import styles from './AlignmentGuides.module.css';

interface AlignmentGuidesProps {
  guides: SnapLine[];
}

export function AlignmentGuides({ guides }: AlignmentGuidesProps) {
  if (guides.length === 0) return null;

  return (
    <div className={styles.guideContainer}>
      {guides.map((guide, i) =>
        guide.axis === 'x' ? (
          <div
            key={`x-${i}`}
            className={`${styles.guideLine} ${styles.vertical}`}
            style={{ left: `${guide.position}%` }}
          />
        ) : (
          <div
            key={`y-${i}`}
            className={`${styles.guideLine} ${styles.horizontal}`}
            style={{ top: `${guide.position}%` }}
          />
        )
      )}
    </div>
  );
}
