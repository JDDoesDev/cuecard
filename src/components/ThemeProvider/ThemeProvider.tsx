import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { initializeTheme, clearCustomOverrides, getTheme } from '../../lib/theme/themeManager';

// Import all theme CSS files
import '../../styles/themes/default.css';
import '../../styles/themes/dark.css';
import '../../styles/themes/light.css';
import '../../styles/themes/corporate.css';
import '../../styles/themes/nature.css';
import '../../styles/themes/minimal.css';
import '../../styles/themes/aurora.css';
import '../../styles/themes/sunset.css';
import '../../styles/themes/midnight.css';
import '../../styles/themes/ember.css';
import '../../styles/themes/ocean.css';
import '../../styles/themes/split-teal.css';
import '../../styles/themes/split-rose.css';
import '../../styles/themes/split-charcoal.css';
import '../../styles/themes/split-sage.css';
import '../../styles/themes/neon-vice.css';
import '../../styles/themes/synthwave.css';
import '../../styles/themes/cyber-grid.css';

// ============================================================================
// Types
// ============================================================================

type Theme = 'default' | 'dark' | 'light' | 'corporate' | 'nature' | 'minimal' | 'aurora' | 'sunset' | 'midnight' | 'ember' | 'ocean' | 'split-teal' | 'split-rose' | 'split-charcoal' | 'split-sage' | 'neon-vice' | 'synthwave' | 'cyber-grid' | 'custom';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

// ============================================================================
// Context
// ============================================================================

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

// ============================================================================
// Provider
// ============================================================================

interface ThemeProviderProps {
  children: ReactNode;
  defaultTheme?: Theme;
}

export function ThemeProvider({ children, defaultTheme = 'default' }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(defaultTheme);

  // Initialize: editor UI always gets 'default' on <html>, restore persisted presentation theme
  useEffect(() => {
    const storedTheme = initializeTheme();
    if (storedTheme && storedTheme !== defaultTheme) {
      setThemeState(storedTheme as Theme);
    }
  }, []);

  // Persist theme selection to localStorage (but do NOT set on <html>)
  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem('fldc-preferred-theme', newTheme);
    if (newTheme !== 'custom') {
      clearCustomOverrides();
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
