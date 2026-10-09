import { useState } from 'react';
import { getComputedThemeVariables } from '../../lib/theme/themeManager';
import { exportTheme, importTheme, saveCustomTheme, type CustomTheme } from '../../lib/theme/customThemeStorage';
import styles from './ThemeImportExport.module.css';

// ============================================================================
// ThemeImportExport Component
// ============================================================================

interface ThemeImportExportProps {
  currentTheme?: string;
  onThemeImported?: () => void;
}

export function ThemeImportExport({ currentTheme = 'default', onThemeImported }: ThemeImportExportProps) {
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleExport = () => {
    const currentVars = getComputedThemeVariables();

    const theme: CustomTheme = {
      name: `${currentTheme}-export`,
      version: 1,
      base: currentTheme,
      overrides: currentVars,
    };

    const json = exportTheme(theme);

    // Create a blob and download it
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${currentTheme}-theme.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setSuccess('Theme exported successfully!');
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError('');
    setSuccess('');

    try {
      const text = await file.text();
      const theme = importTheme(text);

      // Save to custom themes
      saveCustomTheme(theme);

      setSuccess(`Theme "${theme.name}" imported successfully!`);
      setTimeout(() => {
        setSuccess('');
        onThemeImported?.();
      }, 2000);

      // Reset file input
      event.target.value = '';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid theme file format');
    }
  };

  return (
    <div className={styles.container}>
      <h4 className={styles.heading}>Import/Export Themes</h4>

      <div className={styles.actions}>
        <button onClick={handleExport} className={styles.exportButton}>
          Export Current Theme
        </button>

        <div className={styles.importSection}>
          <label className={styles.importButton}>
            Import Theme
            <input
              type="file"
              accept=".json"
              onChange={handleImport}
              className={styles.fileInput}
            />
          </label>
        </div>
      </div>

      {error && <div className={styles.error}>{error}</div>}
      {success && <div className={styles.success}>{success}</div>}
    </div>
  );
}
