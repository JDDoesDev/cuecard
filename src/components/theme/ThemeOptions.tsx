import { BUILT_IN_THEMES } from '@/lib/theme/builtInThemes';
import { customThemeId } from '@/lib/theme/themeManager';
import { useTheme } from '@/components/ThemeProvider/ThemeProvider';

/** <option>s for every built-in and custom theme, for theme <select>s. */
export function ThemeOptions() {
  const { customThemes } = useTheme();
  const custom = Object.values(customThemes);
  return (
    <>
      {BUILT_IN_THEMES.map((t) => (
        <option key={t.id} value={t.id}>{t.name}</option>
      ))}
      {custom.length > 0 && (
        <optgroup label="Custom">
          {custom.map((t) => (
            <option key={t.name} value={customThemeId(t.name)}>{t.name}</option>
          ))}
        </optgroup>
      )}
    </>
  );
}
