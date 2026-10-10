import { describe, it, expect } from 'vitest';
import { CODE_LANGUAGES, resolveCodeLanguage, codeLanguagePickerValue } from '../languages';

describe('resolveCodeLanguage', () => {
  it('maps canonical names, aliases and mixed case to a registered id', () => {
    expect(resolveCodeLanguage('php')).toBe('php');
    expect(resolveCodeLanguage('PHP')).toBe('php');
    expect(resolveCodeLanguage('js')).toBe('javascript');
    expect(resolveCodeLanguage('tsx')).toBe('typescript');
    expect(resolveCodeLanguage('c++')).toBe('cpp');
    expect(resolveCodeLanguage('C#')).toBe('csharp');
    expect(resolveCodeLanguage('xml')).toBe('html');
    expect(resolveCodeLanguage(' yml ')).toBe('yaml');
  });

  it('falls back to text for missing or unknown languages', () => {
    expect(resolveCodeLanguage(undefined)).toBe('text');
    expect(resolveCodeLanguage('')).toBe('text');
    expect(resolveCodeLanguage('cobol-2077')).toBe('text');
  });

  it('has no alias claimed by two languages', () => {
    const names = CODE_LANGUAGES.flatMap((l) => [l.id, ...l.aliases]);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('codeLanguagePickerValue', () => {
  it('shows the resolved language, plain text, or the raw unknown name', () => {
    expect(codeLanguagePickerValue('js')).toBe('javascript');
    expect(codeLanguagePickerValue('plaintext')).toBe('text');
    expect(codeLanguagePickerValue('cobol-2077')).toBe('cobol-2077');
  });
});
