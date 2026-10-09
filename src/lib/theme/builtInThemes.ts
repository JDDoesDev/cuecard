// ============================================================================
// Built-in Theme Registry
// ============================================================================

export interface BuiltInTheme {
  id: string;
  name: string;
  description: string;
  previewColors: {
    bg: string;
    text: string;
    accent: string;
  };
}

export const BUILT_IN_THEMES: BuiltInTheme[] = [
  {
    id: 'default',
    name: 'Default',
    description: 'Light professional theme with blue accents',
    previewColors: {
      bg: '#ffffff',
      text: '#1a1a2e',
      accent: '#0066cc',
    },
  },
  {
    id: 'dark',
    name: 'Dark',
    description: 'Dark theme with blue accents',
    previewColors: {
      bg: '#1a1a2e',
      text: '#f8f9fa',
      accent: '#4d9fff',
    },
  },
  {
    id: 'light',
    name: 'Light',
    description: 'Warm light theme with Playfair Display',
    previewColors: {
      bg: '#fffef9',
      text: '#2c2416',
      accent: '#d4751e',
    },
  },
  {
    id: 'corporate',
    name: 'Corporate',
    description: 'Professional blue and navy theme',
    previewColors: {
      bg: '#0a1929',
      text: '#ffffff',
      accent: '#c7a84e',
    },
  },
  {
    id: 'nature',
    name: 'Nature',
    description: 'Green and earth tones',
    previewColors: {
      bg: '#faf6f0',
      text: '#1b3a2d',
      accent: '#2d6a4f',
    },
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Ultra-clean black and white',
    previewColors: {
      bg: '#ffffff',
      text: '#111111',
      accent: '#333333',
    },
  },
  {
    id: 'aurora',
    name: 'Aurora',
    description: 'Northern lights gradient on deep navy',
    previewColors: {
      bg: '#0b0e1a',
      text: '#e8edf4',
      accent: '#4ade80',
    },
  },
  {
    id: 'sunset',
    name: 'Sunset',
    description: 'Warm peach-to-rose gradient',
    previewColors: {
      bg: '#fef7ed',
      text: '#2d1810',
      accent: '#c2410c',
    },
  },
  {
    id: 'midnight',
    name: 'Midnight',
    description: 'Electric cyan on pitch-dark depths',
    previewColors: {
      bg: '#07080f',
      text: '#f0f4fc',
      accent: '#06b6d4',
    },
  },
  {
    id: 'ember',
    name: 'Ember',
    description: 'Molten amber glow on dark charcoal',
    previewColors: {
      bg: '#1a1210',
      text: '#f5ede4',
      accent: '#f59e0b',
    },
  },
  {
    id: 'ocean',
    name: 'Ocean',
    description: 'Deep teal-to-sapphire gradient',
    previewColors: {
      bg: '#041c2c',
      text: '#e6f2f8',
      accent: '#2dd4bf',
    },
  },
  {
    id: 'split-teal',
    name: 'Split Teal',
    description: 'Teal and navy color block split',
    previewColors: {
      bg: '#0c1929',
      text: '#eaf4f4',
      accent: '#e9c46a',
    },
  },
  {
    id: 'split-rose',
    name: 'Split Rose',
    description: 'Dusty rose and cream color block',
    previewColors: {
      bg: '#fdf8f4',
      text: '#2e1a1a',
      accent: '#9f1239',
    },
  },
  {
    id: 'split-charcoal',
    name: 'Split Charcoal',
    description: 'Black and charcoal color block',
    previewColors: {
      bg: '#1c1c1e',
      text: '#ffffff',
      accent: '#ef4444',
    },
  },
  {
    id: 'split-sage',
    name: 'Split Sage',
    description: 'Sage green and cream color block',
    previewColors: {
      bg: '#f8f6f0',
      text: '#1e2a1a',
      accent: '#8b5e3c',
    },
  },
  {
    id: 'neon-vice',
    name: 'Neon Vice',
    description: '80s Miami neon pink on dark magenta',
    previewColors: {
      bg: '#0c0610',
      text: '#fce4f0',
      accent: '#ff2d8a',
    },
  },
  {
    id: 'synthwave',
    name: 'Synthwave',
    description: 'Retro purple with electric cyan glow',
    previewColors: {
      bg: '#0a0818',
      text: '#e8e0ff',
      accent: '#00e5ff',
    },
  },
  {
    id: 'cyber-grid',
    name: 'Cyber Grid',
    description: 'Tron-style dark blue with neon green',
    previewColors: {
      bg: '#04060c',
      text: '#e0f0ff',
      accent: '#39ff14',
    },
  },
];
