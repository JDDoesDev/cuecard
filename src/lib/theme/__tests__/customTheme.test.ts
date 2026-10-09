import { describe, it, expect } from 'vitest';
import { importTheme } from '../customThemeStorage';
import { buildCustomThemesCss, customThemeId, isSafeThemeValue, effectiveOverrides } from '../themeManager';

const valid = { name: 'My Theme', version: 1, base: 'ocean', overrides: { '--color-accent': '#ff0000', '--font-heading': "'Inter', sans-serif" } };

describe('importTheme validation', () => {
  it('accepts a valid theme', () => {
    expect(importTheme(JSON.stringify(valid))).toEqual(valid);
  });

  it('rejects unknown variables', () => {
    expect(() => importTheme(JSON.stringify({ ...valid, overrides: { '--evil': 'red' } }))).toThrow();
    expect(() => importTheme(JSON.stringify({ ...valid, overrides: { color: 'red' } }))).toThrow();
  });

  it.each([
    'red; } body { display:none',
    'url(https://evil.example/x.png)',
    'expression(alert(1))',
    'red</style><script>alert(1)</script>',
    'red !important',
    '@import "x"',
  ])('rejects unsafe value %s', (value) => {
    expect(() => importTheme(JSON.stringify({ ...valid, overrides: { '--color-accent': value } }))).toThrow();
  });

  it('falls back to default for unknown base', () => {
    expect(importTheme(JSON.stringify({ ...valid, base: "x'] {}" })).base).toBe('default');
  });

  it('rejects malformed JSON', () => {
    expect(() => importTheme('{')).toThrow();
  });
});

describe('custom theme css', () => {
  it('uses a safe id and combines base values with overrides', () => {
    expect(customThemeId("My 'Theme'!")).toBe('custom-my-theme');
    const css = buildCustomThemesCss([valid as never], (base) => ({ '--color-accent': base === 'ocean' ? '#00ffff' : '#000', '--color-text-primary': '#eee' }));
    expect(css).toContain("[data-theme='custom-my-theme']");
    expect(css).toContain('--color-text-primary: #eee;');
    expect(css.indexOf('#ff0000')).toBeGreaterThan(css.indexOf('#00ffff'));
  });

  it('bg override replaces gradient slide background', () => {
    expect(effectiveOverrides({ '--color-bg-primary': '#123456' })['--slide-bg']).toBe('#123456');
  });

  it('isSafeThemeValue accepts gradients and font stacks', () => {
    expect(isSafeThemeValue('linear-gradient(140deg, #041c2c 0%, #0d1f3c 100%)')).toBe(true);
    expect(isSafeThemeValue("'Poppins', -apple-system, sans-serif")).toBe(true);
  });
});
