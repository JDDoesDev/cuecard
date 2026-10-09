import { useState, useEffect } from 'react';
import { getComputedThemeVariables, applyCustomTheme, clearCustomOverrides } from '../../lib/theme/themeManager';
import { saveCustomTheme, type CustomTheme } from '../../lib/theme/customThemeStorage';
import { getAvailableFonts } from '../../lib/fonts/availableFonts';
import styles from './ThemeCustomizer.module.css';

// ============================================================================
// ThemeCustomizer Component
// ============================================================================

interface ThemeCustomizerProps {
  baseTheme?: string;
  onSave?: (theme: CustomTheme) => void;
  onCancel?: () => void;
}

export function ThemeCustomizer({ baseTheme = 'default', onSave, onCancel }: ThemeCustomizerProps) {
  const [themeName, setThemeName] = useState('');
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [showNameInput, setShowNameInput] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [fontOptions, setFontOptions] = useState<string[]>(getAvailableFonts);

  // Initialize overrides from current theme
  useEffect(() => {
    const currentVars = getComputedThemeVariables();
    setOverrides(currentVars);
  }, []);

  // Refresh loaded Google Fonts list
  useEffect(() => {
    setFontOptions(getAvailableFonts());
  }, []);

  const handleColorChange = (varName: string, value: string) => {
    const newOverrides = { ...overrides, [varName]: value };
    setOverrides(newOverrides);
    applyCustomTheme(newOverrides);
  };

  const handleFontChange = (varName: string, value: string) => {
    const newOverrides = { ...overrides, [varName]: `'${value}', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif` };
    setOverrides(newOverrides);
    applyCustomTheme(newOverrides);
  };

  const handleSave = () => {
    if (!themeName.trim()) {
      setSaveMessage('Please enter a theme name');
      return;
    }

    const customTheme: CustomTheme = {
      name: themeName.trim(),
      version: 1,
      base: baseTheme,
      overrides,
    };

    saveCustomTheme(customTheme);
    setSaveMessage(`Theme "${themeName}" saved successfully!`);
    setShowNameInput(false);
    setThemeName('');

    setTimeout(() => {
      setSaveMessage('');
      onSave?.(customTheme);
    }, 1500);
  };

  const handleReset = () => {
    clearCustomOverrides();
    const currentVars = getComputedThemeVariables();
    setOverrides(currentVars);
  };

  const handleCancel = () => {
    clearCustomOverrides();
    const currentVars = getComputedThemeVariables();
    setOverrides(currentVars);
    onCancel?.();
  };

  return (
    <div className={styles.container}>
      <h4 className={styles.heading}>Theme Customizer</h4>
      <p className={styles.description}>
        Customize colors and fonts. Changes are previewed live on your slides.
      </p>

      <div className={styles.sections}>
        {/* Colors Section */}
        <div className={styles.section}>
          <h5 className={styles.sectionTitle}>Colors</h5>
          <div className={styles.grid}>
            <label className={styles.field}>
              <span className={styles.label}>Primary Background</span>
              <input
                type="color"
                value={overrides['--color-bg-primary'] || '#ffffff'}
                onChange={(e) => handleColorChange('--color-bg-primary', e.target.value)}
                className={styles.colorInput}
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Secondary Background</span>
              <input
                type="color"
                value={overrides['--color-bg-secondary'] || '#f8f9fa'}
                onChange={(e) => handleColorChange('--color-bg-secondary', e.target.value)}
                className={styles.colorInput}
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Primary Text</span>
              <input
                type="color"
                value={overrides['--color-text-primary'] || '#1a1a2e'}
                onChange={(e) => handleColorChange('--color-text-primary', e.target.value)}
                className={styles.colorInput}
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Secondary Text</span>
              <input
                type="color"
                value={overrides['--color-text-secondary'] || '#4a4a6a'}
                onChange={(e) => handleColorChange('--color-text-secondary', e.target.value)}
                className={styles.colorInput}
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Accent Color</span>
              <input
                type="color"
                value={overrides['--color-accent'] || '#0066cc'}
                onChange={(e) => handleColorChange('--color-accent', e.target.value)}
                className={styles.colorInput}
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Accent Hover</span>
              <input
                type="color"
                value={overrides['--color-accent-hover'] || '#0052a3'}
                onChange={(e) => handleColorChange('--color-accent-hover', e.target.value)}
                className={styles.colorInput}
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Code Background</span>
              <input
                type="color"
                value={overrides['--color-code-bg'] || '#1e1e2e'}
                onChange={(e) => handleColorChange('--color-code-bg', e.target.value)}
                className={styles.colorInput}
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Border Color</span>
              <input
                type="color"
                value={overrides['--color-border'] || '#dee2e6'}
                onChange={(e) => handleColorChange('--color-border', e.target.value)}
                className={styles.colorInput}
              />
            </label>
          </div>
        </div>

        {/* Fonts Section */}
        <div className={styles.section}>
          <h5 className={styles.sectionTitle}>Typography</h5>
          <div className={styles.grid}>
            <label className={styles.field}>
              <span className={styles.label}>Heading Font</span>
              <select
                value={overrides['--font-heading']?.match(/'([^']+)'/)?.[1] || 'Inter'}
                onChange={(e) => handleFontChange('--font-heading', e.target.value)}
                className={styles.selectInput}
              >
                {fontOptions.map((font) => (
                  <option key={font} value={font}>
                    {font}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Body Font</span>
              <select
                value={overrides['--font-body']?.match(/'([^']+)'/)?.[1] || 'Roboto'}
                onChange={(e) => handleFontChange('--font-body', e.target.value)}
                className={styles.selectInput}
              >
                {fontOptions.map((font) => (
                  <option key={font} value={font}>
                    {font}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Code Font</span>
              <select
                value={overrides['--font-code']?.match(/'([^']+)'/)?.[1] || 'Fira Code'}
                onChange={(e) => handleFontChange('--font-code', e.target.value)}
                className={styles.selectInput}
              >
                {fontOptions.filter((f) => f.includes('Code') || f.includes('Mono')).map((font) => (
                  <option key={font} value={font}>
                    {font}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </div>

      {/* Save Theme Section */}
      {showNameInput ? (
        <div className={styles.saveSection}>
          <input
            type="text"
            placeholder="Enter theme name..."
            value={themeName}
            onChange={(e) => setThemeName(e.target.value)}
            className={styles.nameInput}
            autoFocus
          />
          <button onClick={handleSave} className={styles.saveButton}>
            Save
          </button>
        </div>
      ) : (
        <button onClick={() => setShowNameInput(true)} className={styles.saveAsButton}>
          Save as Custom Theme
        </button>
      )}

      {saveMessage && <div className={styles.message}>{saveMessage}</div>}

      {/* Action Buttons */}
      <div className={styles.actions}>
        <button onClick={handleReset} className={styles.resetButton}>
          Reset to Base Theme
        </button>
        <button onClick={handleCancel} className={styles.cancelButton}>
          Cancel
        </button>
      </div>
    </div>
  );
}
