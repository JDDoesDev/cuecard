/**
 * 16px stroke icons for the text editing toolbars. Decorative: buttons carry
 * their accessible name via aria-label.
 */

const base = {
  width: 16,
  height: 16,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
};

function lines(rows: Array<[number, number]>) {
  return rows.map(([x1, x2], i) => <line key={i} x1={x1} y1={3 + i * 3.3} x2={x2} y2={3 + i * 3.3} />);
}

export const AlignLeftIcon = () => <svg {...base}>{lines([[2, 14], [2, 10], [2, 14], [2, 9]])}</svg>;
export const AlignCenterIcon = () => <svg {...base}>{lines([[2, 14], [4, 12], [2, 14], [4.5, 11.5]])}</svg>;
export const AlignRightIcon = () => <svg {...base}>{lines([[2, 14], [6, 14], [2, 14], [7, 14]])}</svg>;
export const AlignJustifyIcon = () => <svg {...base}>{lines([[2, 14], [2, 14], [2, 14], [2, 14]])}</svg>;

export const BulletListIcon = () => (
  <svg {...base}>
    <circle cx="3" cy="4" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="3" cy="8" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="3" cy="12" r="0.9" fill="currentColor" stroke="none" />
    <line x1="6" y1="4" x2="14" y2="4" />
    <line x1="6" y1="8" x2="14" y2="8" />
    <line x1="6" y1="12" x2="14" y2="12" />
  </svg>
);

export const NumberedListIcon = () => (
  <svg {...base}>
    <path d="M2.2 2.8 3.2 2.2v3.6" strokeWidth={1.1} />
    <path d="M2.2 9.6c.2-.6.6-.9 1.1-.9.6 0 1 .4 1 .9 0 .8-2.1 1.6-2.1 2.4h2.2" strokeWidth={1.1} />
    <line x1="6.5" y1="4" x2="14" y2="4" />
    <line x1="6.5" y1="10.5" x2="14" y2="10.5" />
  </svg>
);

export const IndentIcon = () => (
  <svg {...base}>
    <line x1="7" y1="3" x2="14" y2="3" />
    <line x1="7" y1="8" x2="14" y2="8" />
    <line x1="2" y1="13" x2="14" y2="13" />
    <path d="M2 5.5 4.5 8 2 10.5" />
  </svg>
);

export const OutdentIcon = () => (
  <svg {...base}>
    <line x1="7" y1="3" x2="14" y2="3" />
    <line x1="7" y1="8" x2="14" y2="8" />
    <line x1="2" y1="13" x2="14" y2="13" />
    <path d="M4.5 5.5 2 8l2.5 2.5" />
  </svg>
);

export const LinkIcon = () => (
  <svg {...base}>
    <path d="M6.8 9.2a2.6 2.6 0 0 0 3.7 0l2.2-2.2a2.6 2.6 0 0 0-3.7-3.7l-.8.8" />
    <path d="M9.2 6.8a2.6 2.6 0 0 0-3.7 0L3.3 9a2.6 2.6 0 0 0 3.7 3.7l.8-.8" />
  </svg>
);

export const CodeIcon = () => (
  <svg {...base}>
    <path d="M5.5 4.5 2 8l3.5 3.5" />
    <path d="M10.5 4.5 14 8l-3.5 3.5" />
  </svg>
);

export const ClearFormatIcon = () => (
  <svg {...base}>
    <path d="M3 3.5h8M7 3.5 5 12.5" />
    <path d="m10 9.5 4 4M14 9.5l-4 4" />
  </svg>
);

export const TableIcon = () => (
  <svg {...base}>
    <rect x="2" y="3" width="12" height="10" rx="1" />
    <line x1="2" y1="6.5" x2="14" y2="6.5" />
    <line x1="2" y1="10" x2="14" y2="10" />
    <line x1="6" y1="3" x2="6" y2="13" />
    <line x1="10" y1="3" x2="10" y2="13" />
  </svg>
);

export const RowAddIcon = () => (
  <svg {...base}>
    <rect x="2" y="2.5" width="12" height="5" rx="1" />
    <path d="M8 10v4M6 12h4" />
  </svg>
);

export const ColumnAddIcon = () => (
  <svg {...base}>
    <rect x="2.5" y="2" width="5" height="12" rx="1" />
    <path d="M10 8h4M12 6v4" />
  </svg>
);

export const RowDeleteIcon = () => (
  <svg {...base}>
    <rect x="2" y="2.5" width="12" height="5" rx="1" />
    <path d="m6.5 10.5 3 3M9.5 10.5l-3 3" />
  </svg>
);

export const ColumnDeleteIcon = () => (
  <svg {...base}>
    <rect x="2.5" y="2" width="5" height="12" rx="1" />
    <path d="m10.5 6.5 3 3M13.5 6.5l-3 3" />
  </svg>
);

export const HeaderRowIcon = () => (
  <svg {...base}>
    <rect x="2" y="3" width="12" height="10" rx="1" />
    <rect x="2" y="3" width="12" height="3.5" rx="1" fill="currentColor" stroke="none" opacity="0.55" />
    <line x1="2" y1="10" x2="14" y2="10" />
  </svg>
);

export const TableDeleteIcon = () => (
  <svg {...base}>
    <rect x="2" y="3" width="9" height="8" rx="1" />
    <line x1="2" y1="7" x2="11" y2="7" />
    <path d="m11 11 3 3M14 11l-3 3" />
  </svg>
);
