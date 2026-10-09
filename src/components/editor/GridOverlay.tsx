import styles from './GridOverlay.module.css';

interface GridOverlayProps {
  visible: boolean;
  gridSize?: number;
}

/**
 * Renders a percentage-based grid overlay for alignment.
 * Grid lines are drawn every `gridSize` percent (default 10%).
 */
export function GridOverlay({ visible, gridSize = 10 }: GridOverlayProps) {
  if (!visible) return null;

  // Generate vertical and horizontal grid lines
  const verticalLines: number[] = [];
  const horizontalLines: number[] = [];

  for (let i = 0; i <= 100; i += gridSize) {
    verticalLines.push(i);
    horizontalLines.push(i);
  }

  return (
    <svg className={styles.gridOverlay}>
      {/* Vertical lines */}
      {verticalLines.map((x) => (
        <line
          key={`v-${x}`}
          x1={`${x}%`}
          y1="0%"
          x2={`${x}%`}
          y2="100%"
          stroke="rgba(128, 128, 128, 0.15)"
          strokeWidth="1"
        />
      ))}

      {/* Horizontal lines */}
      {horizontalLines.map((y) => (
        <line
          key={`h-${y}`}
          x1="0%"
          y1={`${y}%`}
          x2="100%"
          y2={`${y}%`}
          stroke="rgba(128, 128, 128, 0.15)"
          strokeWidth="1"
        />
      ))}
    </svg>
  );
}
