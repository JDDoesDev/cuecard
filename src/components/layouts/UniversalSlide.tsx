import type { Slide } from '@/types/slide';
import { isElementVisible } from '@/lib/fragments';
import { ElementRenderer } from './ElementRenderer';
import styles from './UniversalSlide.module.css';

interface UniversalSlideProps {
  slide: Slide;
  visibleFragment?: number;
}

export function UniversalSlide({ slide, visibleFragment }: UniversalSlideProps) {
  if (!slide.elements || slide.elements.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>Empty Slide</div>
      </div>
    );
  }

  const frag = visibleFragment ?? Infinity;

  return (
    <div className={styles.container}>
      {slide.elements.map((element, idx) => {
        const visible = isElementVisible(element, frag);
        const isTextType = element.type === 'heading' || element.type === 'text' || element.type === 'list';
        const vAlign = isTextType ? (element as any).verticalAlign : undefined;
        return (
          <div
            key={element.id}
            className={`${styles.element} ${styles.fragmentReveal} ${visible ? '' : styles.hidden}`}
            data-element-type={element.type}
            data-element-id={element.id}
            data-hidden={visible ? undefined : ''}
            style={{
              left: `${element.position.x}%`,
              top: `${element.position.y}%`,
              width: `${element.position.width}%`,
              ...(isTextType
                ? { minHeight: `${element.position.height}%` }
                : { height: `${element.position.height}%` }),
              zIndex: idx,
              ...(vAlign && {
                display: 'flex',
                alignItems: vAlign === 'middle' ? 'center' : vAlign === 'bottom' ? 'flex-end' : undefined,
              }),
            }}
          >
            <ElementRenderer element={element} visibleFragment={frag} />
          </div>
        );
      })}
    </div>
  );
}
