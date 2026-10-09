import { Extension } from '@tiptap/core';
import '@tiptap/extension-text-style';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    fontSize: {
      setFontSize: (size: string) => ReturnType;
      unsetFontSize: () => ReturnType;
    };
  }
}

/**
 * Slide type scales with the slide container width (see `[data-slide-container]`
 * in global.css): 1000px container width ≈ the nominal px value. Font sizes are
 * stored as px (what the user picked) but rendered in cqw so they stay
 * proportional on any screen. 24px → 2.4cqw.
 */
const REFERENCE_WIDTH_PX = 1000;

export function pxToCqw(size: string): string {
  const match = /^([\d.]+)px$/.exec(size.trim());
  if (!match) return size;
  const cqw = (parseFloat(match[1]) / REFERENCE_WIDTH_PX) * 100;
  return `${parseFloat(cqw.toFixed(3))}cqw`;
}

/**
 * Rewrite legacy inline `font-size: Npx` declarations in stored rich-text HTML
 * to cqw so pre-existing content scales with the slide like newly edited content.
 */
export function scaleInlineFontSizes(html: string): string {
  return html.replace(
    /font-size:\s*([\d.]+px)/gi,
    (_m, px: string) => `font-size: ${pxToCqw(px)}`
  );
}

export function cqwToPx(size: string): string {
  const match = /^([\d.]+)cqw$/.exec(size.trim());
  if (!match) return size;
  const px = (parseFloat(match[1]) / 100) * REFERENCE_WIDTH_PX;
  return `${Math.round(px)}px`;
}

export const FontSize = Extension.create({
  name: 'fontSize',

  addOptions() {
    return {
      types: ['textStyle'],
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            // Normalize to px so the toolbar shows a familiar value whether the
            // stored HTML was written as px (legacy) or cqw
            parseHTML: (element: HTMLElement) => {
              const raw = element.style.fontSize?.replace(/['"]+/g, '');
              return raw ? cqwToPx(raw) : null;
            },
            renderHTML: (attributes: Record<string, unknown>) => {
              if (!attributes.fontSize) return {};
              return { style: `font-size: ${pxToCqw(String(attributes.fontSize))}` };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setFontSize:
        (fontSize: string) =>
        ({ chain }) => {
          return chain().setMark('textStyle', { fontSize }).run();
        },
      unsetFontSize:
        () =>
        ({ chain }) => {
          return chain()
            .setMark('textStyle', { fontSize: null })
            .removeEmptyTextStyle()
            .run();
        },
    };
  },
});
