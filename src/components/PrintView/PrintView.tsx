import { usePresentationStore } from '@/hooks/usePresentationStore';
import { Slide } from '@/components/Slide/Slide';
import type { AspectRatio } from '@/types/presentation';
import styles from './PrintView.module.css';

const RATIO_CSS: Record<AspectRatio, string> = {
  '16:9': '16 / 9',
  '4:3': '4 / 3',
  '16:10': '16 / 10',
};

interface PrintViewProps {
  aspectRatio?: AspectRatio;
}

/**
 * PrintView renders all slides in a vertical print-optimized layout.
 *
 * Hidden on screen via CSS, visible only in @media print.
 * Each slide gets page-break-after to ensure one slide per printed page.
 * Slides keep the presentation's aspect ratio, centered on the page.
 */
export function PrintView({ aspectRatio }: PrintViewProps) {
  const { presentation } = usePresentationStore();

  if (!presentation) return null;

  const ratio = aspectRatio ?? presentation.aspectRatio ?? '16:9';
  const [rw, rh] = ratio.split(':').map(Number);
  const frameStyle = {
    '--print-aspect': RATIO_CSS[ratio],
    '--print-ratio': String(rw / rh),
  } as React.CSSProperties;

  return (
    <div className={styles.container} data-print-view>
      {presentation.slides.map((slide, index) => (
        <div
          key={slide.id || index}
          className={styles.printSlide}
          data-slide-index={index}
        >
          <div className={styles.slideFrame} style={frameStyle}>
            <Slide slide={slide} fontHeading={presentation.fontHeading} fontBody={presentation.fontBody} />
          </div>
        </div>
      ))}
    </div>
  );
}
