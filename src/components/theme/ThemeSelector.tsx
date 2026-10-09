import { useState } from 'react';
import { BUILT_IN_THEMES } from '../../lib/theme/builtInThemes';
import { getCustomThemes, deleteCustomTheme, type CustomTheme } from '../../lib/theme/customThemeStorage';
import { setTheme as setThemeManager, getTheme } from '../../lib/theme/themeManager';
import { useTheme } from '../ThemeProvider/ThemeProvider';
import { ThemeCustomizer } from './ThemeCustomizer';
import styles from './ThemeSelector.module.css';

// ============================================================================
// ThemeSelector Component
// ============================================================================

export function ThemeSelector() {
  const { theme, setTheme } = useTheme();
  const [customThemes, setCustomThemes] = useState<Record<string, CustomTheme>>(getCustomThemes());
  const [showCustomizer, setShowCustomizer] = useState(false);

  const handleThemeSelect = (themeId: string) => {
    setThemeManager(themeId);
    setTheme(themeId as any);
  };

  const handleDeleteCustomTheme = (name: string) => {
    deleteCustomTheme(name);
    setCustomThemes(getCustomThemes());

    // If the deleted theme is currently active, switch to default
    if (getTheme() === name) {
      handleThemeSelect('default');
    }
  };

  const handleCustomThemeSaved = () => {
    setCustomThemes(getCustomThemes());
    setShowCustomizer(false);
  };

  return (
    <div className={styles.container}>
      <h3 className={styles.heading}>Theme Selection</h3>

      {/* Built-in Themes */}
      <div className={styles.grid}>
        {BUILT_IN_THEMES.map((builtInTheme) => (
          <button
            key={builtInTheme.id}
            className={`${styles.card} ${theme === builtInTheme.id ? styles.active : ''}`}
            onClick={() => handleThemeSelect(builtInTheme.id)}
          >
            <div className={styles.swatchContainer}>
              <div
                className={styles.swatch}
                style={{ backgroundColor: builtInTheme.previewColors.bg }}
              />
              <div
                className={styles.swatch}
                style={{ backgroundColor: builtInTheme.previewColors.text }}
              />
              <div
                className={styles.swatch}
                style={{ backgroundColor: builtInTheme.previewColors.accent }}
              />
            </div>
            <div className={styles.info}>
              <div className={styles.name}>{builtInTheme.name}</div>
              <div className={styles.description}>{builtInTheme.description}</div>
            </div>
            {theme === builtInTheme.id && (
              <div className={styles.checkmark}>✓</div>
            )}
          </button>
        ))}

        {/* Custom Themes */}
        {Object.entries(customThemes).map(([name, customTheme]) => (
          <button
            key={name}
            className={`${styles.card} ${theme === name ? styles.active : ''}`}
            onClick={() => handleThemeSelect(name)}
          >
            <button
              className={styles.deleteButton}
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteCustomTheme(name);
              }}
              aria-label={`Delete ${name} theme`}
            >
              ×
            </button>
            <div className={styles.swatchContainer}>
              {/* Show first 3 override colors or fallback colors */}
              <div
                className={styles.swatch}
                style={{ backgroundColor: customTheme.overrides['--color-bg-primary'] || '#ffffff' }}
              />
              <div
                className={styles.swatch}
                style={{ backgroundColor: customTheme.overrides['--color-text-primary'] || '#000000' }}
              />
              <div
                className={styles.swatch}
                style={{ backgroundColor: customTheme.overrides['--color-accent'] || '#0066cc' }}
              />
            </div>
            <div className={styles.info}>
              <div className={styles.name}>{customTheme.name}</div>
              <div className={styles.description}>Custom theme (based on {customTheme.base})</div>
            </div>
            {theme === name && (
              <div className={styles.checkmark}>✓</div>
            )}
          </button>
        ))}
      </div>

      {/* Customize Button */}
      <button
        className={styles.customizeButton}
        onClick={() => setShowCustomizer(!showCustomizer)}
      >
        {showCustomizer ? 'Hide Customizer' : 'Customize Theme...'}
      </button>

      {/* Theme Customizer */}
      {showCustomizer && (
        <ThemeCustomizer
          baseTheme={theme}
          onSave={handleCustomThemeSaved}
          onCancel={() => setShowCustomizer(false)}
        />
      )}
    </div>
  );
}
