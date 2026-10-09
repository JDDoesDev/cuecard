import { useState, useEffect, useMemo } from 'react';
import { getThemeVariables, applyCustomTheme, clearCustomOverrides, customThemeId } from '../../lib/theme/themeManager';
import { saveCustomTheme, type CustomTheme } from '../../lib/theme/customThemeStorage';
import { getAvailableFonts } from '../../lib/fonts/availableFonts';
import { useTheme } from '../ThemeProvider/ThemeProvider';
import styles from './ThemeCustomizer.module.css';

// ============================================================================
// ThemeCustomizer Component
// ============================================================================

interface ThemeCustomizerProps {
  /** Theme id currently applied to slides (built-in or custom-<slug>). */
  baseTheme?: string;
  onSave?: (theme: CustomTheme) => void;
  onCancel?: () => void;
}

const HEX_RE = /^#[0-9a-f]{6}$/i;

/** <input type="color"> only accepts #rrggbb. */
function toHex(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  const v = value.trim();
  if (HEX_RE.test(v)) return v;
  if (/^#[0-9a-f]{3}$/i.test(v)) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  const rgb = v.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i);
  if (rgb) return `#${[rgb[1], rgb[2], rgb[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`;
  return fallback;
}

export function ThemeCustomizer({ baseTheme = 'default', onSave, onCancel }: ThemeCustomizerProps) {
  const { customThemes } = useTheme();
  const [themeName, setThemeName] = useState('');
  /** Only the values the user changed (applied on top of the base theme). */
  const [changes, setChanges] = useState<Record<string, string>>({});
  const [showNameInput, setShowNameInput] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [fontOptions, setFontOptions] = useState<string[]>(getAvailableFonts);

  // If the active theme is custom, extend its base and start from its overrides
  const activeCustom = useMemo(
    () => Object.values(customThemes).find((t) => customThemeId(t.name) === baseTheme),
    [customThemes, baseTheme],
  );
  const rootBase = activeCustom?.base ?? baseTheme;
  const inheritedOverrides = useMemo(() => activeCustom?.overrides ?? {}, [activeCustom]);

  // Actual values of the selected theme (not the editor chrome's 'default')
  const [themeValues, setThemeValues] = useState<Record<string, string>>({});
  useEffect(() => {
    clearCustomOverrides();
    setThemeValues(getThemeVariables(baseTheme));
    setChanges({});
  }, [baseTheme]);

  // Clear live preview when the customizer closes
  useEffect(() => () => clearCustomOverrides(), []);

  // Refresh loaded Google Fonts list
  useEffect(() => {
    setFontOptions(getAvailableFonts());
  }, []);

  const overrides = { ...themeValues, ...changes };

  const applyChange = (varName: string, value: string) => {
    const next = { ...changes, [varName]: value };
    setChanges(next);
    applyCustomTheme(next, baseTheme);
  };

  const handleColorChange = (varName: string, value: string) => applyChange(varName, value);

  const handleFontChange = (varName: string, value: string) => {
    applyChange(varName, `'${value}', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`);
  };

  const handleSave = () => {
    if (!themeName.trim()) {
      setSaveMessage('Please enter a theme name');
      return;
    }

    const customTheme: CustomTheme = {
      name: themeName.trim(),
      version: 1,
      base: rootBase,
      overrides: { ...inheritedOverrides, ...changes },
    };

    try {
      saveCustomTheme(customTheme);
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : 'Could not save theme');
      return;
    }
    setSaveMessage(`Theme "${customTheme.name}" saved successfully!`);
    setShowNameInput(false);
    setThemeName('');

    setTimeout(() => {
      setSaveMessage('');
      clearCustomOverrides();
      onSave?.(customTheme);
    }, 1500);
  };

  const handleReset = () => {
    clearCustomOverrides();
    setChanges({});
  };

  const handleCancel = () => {
    clearCustomOverrides();
    setChanges({});
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
                value={toHex(overrides['--color-bg-primary'], '#ffffff')}
                onChange={(e) => handleColorChange('--color-bg-primary', e.target.value)}
                className={styles.colorInput}
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Secondary Background</span>
              <input
                type="color"
                value={toHex(overrides['--color-bg-secondary'], '#f8f9fa')}
                onChange={(e) => handleColorChange('--color-bg-secondary', e.target.value)}
                className={styles.colorInput}
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Primary Text</span>
              <input
                type="color"
                value={toHex(overrides['--color-text-primary'], '#1a1a2e')}
                onChange={(e) => handleColorChange('--color-text-primary', e.target.value)}
                className={styles.colorInput}
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Secondary Text</span>
              <input
                type="color"
                value={toHex(overrides['--color-text-secondary'], '#4a4a6a')}
                onChange={(e) => handleColorChange('--color-text-secondary', e.target.value)}
                className={styles.colorInput}
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Accent Color</span>
              <input
                type="color"
                value={toHex(overrides['--color-accent'], '#0066cc')}
                onChange={(e) => handleColorChange('--color-accent', e.target.value)}
                className={styles.colorInput}
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Accent Hover</span>
              <input
                type="color"
                value={toHex(overrides['--color-accent-hover'], '#0052a3')}
                onChange={(e) => handleColorChange('--color-accent-hover', e.target.value)}
                className={styles.colorInput}
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Code Background</span>
              <input
                type="color"
                value={toHex(overrides['--color-code-bg'], '#1e1e2e')}
                onChange={(e) => handleColorChange('--color-code-bg', e.target.value)}
                className={styles.colorInput}
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Border Color</span>
              <input
                type="color"
                value={toHex(overrides['--color-border'], '#dee2e6')}
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
                value={overrides['--font-heading']?.match(/^\s*['"]?([^'",]+)/)?.[1]?.trim() || 'Inter'}
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
                value={overrides['--font-body']?.match(/^\s*['"]?([^'",]+)/)?.[1]?.trim() || 'Roboto'}
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
                value={overrides['--font-code']?.match(/^\s*['"]?([^'",]+)/)?.[1]?.trim() || 'Fira Code'}
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
