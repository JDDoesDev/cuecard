import { useEffect, useRef, useState } from 'react';
import { COLORS, NONE_SWATCH } from '@/lib/editor/colorPalette';
import styles from './ColorSwatchPicker.module.css';

interface ColorSwatchPickerProps {
  /** Accessible name, e.g. "Fill color" */
  label: string;
  value: string | undefined;
  onChange: (color: string | undefined) => void;
  /** Label of the swatch that clears the color, e.g. "No fill" */
  noneLabel: string;
}

const GRID_WIDTH = 170;

/**
 * A swatch button that opens the same color grid as the text color picker.
 * The grid is fixed-positioned above the button (it sits in the controls bar
 * under the canvas).
 */
export function ColorSwatchPicker({ label, value, onChange, noneLabel }: ColorSwatchPickerProps) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const isNone = !value || value === 'transparent' || value === 'none';

  useEffect(() => {
    if (!anchor) return;
    const close = () => setAnchor(null);
    const handleMouseDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) close();
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', close);
    // The grid is fixed-positioned: close it rather than leave it behind on scroll
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [anchor]);

  const pick = (color: string | undefined) => {
    onChange(color);
    setAnchor(null);
  };

  return (
    <div ref={wrapRef} className={styles.wrap}>
      <button
        type="button"
        className={styles.button}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setAnchor((cur) => (cur ? null : rect));
        }}
        aria-label={label}
        aria-expanded={!!anchor}
        title={label}
      >
        <span className={styles.current} style={{ background: isNone ? NONE_SWATCH : value }} />
      </button>
      {anchor && (
        <div
          className={styles.grid}
          style={{
            bottom: window.innerHeight - anchor.top + 6,
            left: Math.max(8, Math.min(anchor.left, window.innerWidth - GRID_WIDTH - 8)),
          }}
          role="group"
          aria-label={label}
        >
          <button
            type="button"
            className={`${styles.swatch} ${isNone ? styles.active : ''}`}
            onClick={() => pick(undefined)}
            aria-label={noneLabel}
            title={noneLabel}
            style={{ background: NONE_SWATCH }}
          />
          {COLORS.map((color) => (
            <button
              key={color}
              type="button"
              className={`${styles.swatch} ${value?.toLowerCase() === color ? styles.active : ''}`}
              onClick={() => pick(color)}
              aria-label={`Color ${color}`}
              title={color}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
