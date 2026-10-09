import type { RectangleElement, CircleElement, LineElement } from '@/types/slide';

interface ShapeRendererProps {
  element: RectangleElement | CircleElement | LineElement;
}

export function ShapeRenderer({ element }: ShapeRendererProps) {
  const fill = 'fill' in element ? element.fill ?? 'transparent' : 'transparent';
  const stroke = element.stroke ?? '#333';
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
      return (
        <svg style={svgStyle} xmlns="http://www.w3.org/2000/svg">
          <line
            x1="0"
            y1="0"
            x2="100%"
            y2="100%"
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
        </svg>
      );
  }
}
