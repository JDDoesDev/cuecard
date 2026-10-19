import type { RectangleElement, CircleElement, LineElement } from '@/types/slide';
import { LINE_SVG_STYLE, lineSvgCoords } from '@/lib/editor/lineGeometry';

/** Stroke color of shapes that don't set one. */
export const DEFAULT_STROKE = '#333';

interface ShapeRendererProps {
  element: RectangleElement | CircleElement | LineElement;
}

export function ShapeRenderer({ element }: ShapeRendererProps) {
  const fill = 'fill' in element ? element.fill ?? 'transparent' : 'transparent';
  const stroke = element.stroke ?? DEFAULT_STROKE;
  const strokeWidth = element.strokeWidth ?? 2;

  const svgStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
  };

  switch (element.type) {
    case 'rectangle': {
      const cornerRadius = element.cornerRadius ?? 0;
      return (
        <svg style={svgStyle} xmlns="http://www.w3.org/2000/svg">
          <rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
            rx={cornerRadius}
          />
        </svg>
      );
    }

    case 'circle':
      return (
        <svg style={svgStyle} xmlns="http://www.w3.org/2000/svg">
          <ellipse
            cx="50%"
            cy="50%"
            rx="50%"
            ry="50%"
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
        </svg>
      );

    case 'line':
      // Horizontal/vertical lines have a zero-size box
      return (
        <svg style={LINE_SVG_STYLE} xmlns="http://www.w3.org/2000/svg">
          <line
            {...lineSvgCoords(element)}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
        </svg>
      );
  }
}
