import type { Slide as SlideType } from '@/types/slide';
import { UniversalSlide } from '@/components/layouts/UniversalSlide';
import { useTheme } from '@/components/ThemeProvider/ThemeProvider';
import styles from './Slide.module.css';

interface SlideProps {
  slide: SlideType;
  visibleFragment?: number;
  fontHeading?: string;
  fontBody?: string;
}

export function Slide({ slide, visibleFragment, fontHeading, fontBody }: SlideProps) {
  const { theme } = useTheme();

  // Apply presentation-level font overrides as scoped CSS custom properties
  const style: React.CSSProperties = {};
  if (fontHeading) {
    (style as any)['--font-heading'] = `'${fontHeading}', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
  }
  if (fontBody) {
    (style as any)['--font-body'] = `'${fontBody}', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
  }

  return (
    <div className={styles.slide} style={style} data-theme={theme} data-slide-container>
      <UniversalSlide slide={slide} visibleFragment={visibleFragment} />
    </div>
  );
}
