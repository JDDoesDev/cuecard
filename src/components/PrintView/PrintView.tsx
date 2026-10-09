import { usePresentationStore } from '@/hooks/usePresentationStore';
import { Slide } from '@/components/Slide/Slide';
import styles from './PrintView.module.css';

/**
 * PrintView renders all slides in a vertical print-optimized layout.
 *
 * Hidden on screen via CSS, visible only in @media print.
 * Each slide gets page-break-after to ensure one slide per printed page.
 */
export function PrintView() {
  const { presentation } = usePresentationStore();

  if (!presentation) return null;

  return (
    <div className={styles.container} data-print-view>
      {presentation.slides.map((slide, index) => (
        <div
          key={slide.id || index}
          className={styles.printSlide}
          data-slide-index={index}
        >
          <Slide slide={slide} fontHeading={presentation.fontHeading} fontBody={presentation.fontBody} />
        </div>
      ))}
    </div>
  );
}
