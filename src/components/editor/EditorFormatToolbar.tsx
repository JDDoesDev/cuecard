import { useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import type { Editor } from '@tiptap/react';
import {
  getActiveFormats,
  getAvailableFonts,
  toggleBold,
  toggleItalic,
  toggleUnderline,
  toggleStrike,
  toggleCode,
  toggleSubscript,
  toggleSuperscript,
  setTextColor,
  setHighlight,
  setFontSize,
  setFontFamily,
  setLink,
  unsetLink,
  clearFormatting,
} from '@/lib/editor/editorCommands';
import { fontFamilyCss } from '@/lib/editor/fontFamily';
import { LinkIcon, CodeIcon, ClearFormatIcon } from './toolbarIcons';
import styles from './EditorFormatToolbar.module.css';

interface EditorFormatToolbarProps {
  /** Null until the in-place editor has mounted (controls render disabled). */
  editor: Editor | null;
  /** Slot: extra inline-format controls (engine features), rendered before "Clear formatting". */
  extras?: ReactNode;
  /** Slot: open an external link dialog instead of the built-in URL popover. */
  onRequestLink?: (editor: Editor) => void;
}

const FONT_SIZES = [
  '12px', '14px', '16px', '18px', '20px', '24px', '28px',
  '32px', '36px', '40px', '48px', '56px', '64px', '72px',
];

const COLORS = [
  '#000000', '#434343', '#666666', '#999999', '#cccccc', '#ffffff',
  '#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#1abc9c', '#3498db',
  '#9b59b6', '#e91e63', '#795548', '#607d8b',
];

const HIGHLIGHT_COLORS = [
  'rgba(231, 76, 60, 0.6)', 'rgba(230, 126, 34, 0.6)', 'rgba(241, 196, 15, 0.6)',
  'rgba(46, 204, 113, 0.6)', 'rgba(26, 188, 156, 0.6)', 'rgba(52, 152, 219, 0.6)',
  'rgba(155, 89, 182, 0.6)', 'rgba(233, 30, 99, 0.6)', 'rgba(121, 85, 72, 0.6)',
  'rgba(96, 125, 140, 0.6)',
];

const NONE_SWATCH = 'linear-gradient(135deg, #fff 45%, #e74c3c 50%, #fff 55%)';

type Popover = 'font' | 'size' | 'color' | 'highlight' | 'link' | null;

/** Re-render on every editor transaction (the editor is created with shouldRerenderOnTransaction: false). */
export function useEditorTransactions(editor: Editor | null) {
  const [, forceRender] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!editor) return;
    editor.on('transaction', forceRender);
    editor.on('selectionUpdate', forceRender);
    return () => {
      editor.off('transaction', forceRender);
      editor.off('selectionUpdate', forceRender);
    };
  }, [editor]);
}

/** Fixed position below an anchor button (the bar scrolls horizontally, so popovers can't be absolute). */
function popoverPosition(anchor: DOMRect, width: number, align: 'start' | 'center'): React.CSSProperties {
  const ideal = align === 'center' ? anchor.left + anchor.width / 2 - width / 2 : anchor.left;
  return { top: anchor.bottom + 6, left: Math.max(8, Math.min(ideal, window.innerWidth - width - 8)) };
}

/**
 * Inline formatting controls (font, size, marks, link, colors) for the text
 * element toolbar while a text element is edited in place. They apply to the
 * selection, or to what is typed next at the caret.
 */
export function EditorFormatToolbar({ editor: maybeEditor, extras, onRequestLink }: EditorFormatToolbarProps) {
  const [open, setOpen] = useState<Popover>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [linkDraft, setLinkDraft] = useState('');
  const [linkError, setLinkError] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);
  useEditorTransactions(maybeEditor);

  // Close popovers on outside click, and when the bar scrolls or the window resizes
  // (fixed popovers would drift away from their button)
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) setOpen(null);
    };
    // scroll doesn't bubble: this fires for the bar itself, not a scrolling popover list
    const close = () => setOpen(null);
    const bar = toolbarRef.current?.closest('[role="toolbar"]');
    document.addEventListener('mousedown', handleClickOutside);
    bar?.addEventListener('scroll', close);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      bar?.removeEventListener('scroll', close);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  const toggle = (popover: Exclude<Popover, null>, e: React.MouseEvent<HTMLElement>) => {
    setAnchor(e.currentTarget.getBoundingClientRect());
    setOpen((cur) => (cur === popover ? null : popover));
  };

  if (!maybeEditor || maybeEditor.isDestroyed) {
    return <div className={styles.toolbar} role="group" aria-label="Text formatting" aria-disabled="true" />;
  }
  const editor = maybeEditor;

  const btn = (
    label: ReactNode,
    action: () => void,
    isActive: boolean | undefined,
    name: string,
    shortcut?: string,
    style?: React.CSSProperties
  ) => (
    <button
      type="button"
      key={name}
      className={`${styles.btn} ${isActive ? styles.active : ''}`}
      onClick={action}
      aria-label={name}
      aria-pressed={isActive}
      title={shortcut ? `${name} (${shortcut})` : name}
      style={style}
    >
      {label}
    </button>
  );

  const formats = getActiveFormats(editor);
  const currentFontSize = formats.fontSize ?? '';
  const currentColor = formats.color ?? '';
  const currentHighlight = formats.highlight ?? '';
  const currentFont = formats.fontFamily;
  const hasLink = !!formats.link;

  const openLink = (e: React.MouseEvent<HTMLElement>) => {
    if (onRequestLink) {
      setOpen(null);
      onRequestLink(editor);
      return;
    }
    setLinkDraft(formats.link?.href ?? '');
    setLinkError(false);
    toggle('link', e);
  };

  const applyLink = () => {
    if (!linkDraft.trim()) {
      unsetLink(editor);
      setOpen(null);
      return;
    }
    // setLink normalizes ("example.com" → https://…) and rejects unsafe URLs
    if (!setLink(editor, linkDraft)) {
      setLinkError(true);
      return;
    }
    setOpen(null);
  };

  return (
    <div
      ref={toolbarRef}
      className={styles.toolbar}
      role="group"
      aria-label="Text formatting"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          e.stopPropagation();
          setOpen(null);
          editor.commands.focus();
        }
      }}
    >
      {/* Font family (per selection) */}
      <div className={styles.popoverWrap}>
        <button
          type="button"
          className={`${styles.sizeBtn} ${styles.fontBtn}`}
          onClick={(e) => toggle('font', e)}
          aria-label="Font"
          aria-haspopup="menu"
          aria-expanded={open === 'font'}
          title={currentFont ? `Font: ${currentFont}` : 'Font'}
          style={currentFont ? { fontFamily: fontFamilyCss(currentFont) } : undefined}
        >
          <span className={styles.fontName}>{currentFont ?? 'Font'}</span>
          <span className={styles.caret} aria-hidden="true">▾</span>
        </button>
        {open === 'font' && (
          <div
            className={`${styles.popover} ${styles.fontPopover}`}
            style={anchor ? popoverPosition(anchor, 180, 'start') : undefined}
            role="menu"
            aria-label="Font"
          >
            <button
              type="button"
              role="menuitem"
              className={`${styles.popoverItem} ${!currentFont ? styles.active : ''}`}
              onClick={() => {
                setFontFamily(editor, null);
                setOpen(null);
              }}
            >
              Default
            </button>
            {getAvailableFonts().map((font) => (
              <button
                key={font}
                type="button"
                role="menuitem"
                className={`${styles.popoverItem} ${currentFont === font ? styles.active : ''}`}
                style={{ fontFamily: fontFamilyCss(font) }}
                onClick={() => {
                  setFontFamily(editor, font);
                  setOpen(null);
                }}
              >
                {font}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Font size */}
      <div className={styles.popoverWrap}>
        <button
          type="button"
          className={styles.sizeBtn}
          onClick={(e) => toggle('size', e)}
          aria-label="Font size"
          aria-haspopup="menu"
          aria-expanded={open === 'size'}
          title="Font size"
        >
          {currentFontSize ? parseInt(currentFontSize, 10) : 'Size'}
          <span className={styles.caret} aria-hidden="true">▾</span>
        </button>
        {open === 'size' && (
          <div
            className={styles.popover}
            style={anchor ? popoverPosition(anchor, 72, 'start') : undefined}
            role="menu"
            aria-label="Font size"
          >
            <button
              type="button"
              role="menuitem"
              className={`${styles.popoverItem} ${!currentFontSize ? styles.active : ''}`}
              onClick={() => {
                setFontSize(editor, null);
                setOpen(null);
              }}
            >
              Default
            </button>
            {FONT_SIZES.map((size) => (
              <button
                key={size}
                type="button"
                role="menuitem"
                className={`${styles.popoverItem} ${currentFontSize === size ? styles.active : ''}`}
                onClick={() => {
                  setFontSize(editor, size);
                  setOpen(null);
                }}
              >
                {parseInt(size, 10)}
              </button>
            ))}
          </div>
        )}
      </div>

      <span className={styles.sep} />

      {btn('B', () => toggleBold(editor), formats.bold, 'Bold', 'Ctrl+B', { fontWeight: 700 })}
      {btn('I', () => toggleItalic(editor), formats.italic, 'Italic', 'Ctrl+I', { fontStyle: 'italic', fontFamily: 'Georgia, serif' })}
      {btn('U', () => toggleUnderline(editor), formats.underline, 'Underline', 'Ctrl+U', { textDecoration: 'underline' })}
      {btn('S', () => toggleStrike(editor), formats.strike, 'Strikethrough', 'Ctrl+Shift+S', { textDecoration: 'line-through' })}
      {btn(<CodeIcon />, () => toggleCode(editor), formats.code, 'Inline code', 'Ctrl+E')}

      {/* Link */}
      <div className={styles.popoverWrap}>
        <button
          type="button"
          className={`${styles.btn} ${hasLink ? styles.active : ''}`}
          onClick={openLink}
          aria-label={hasLink ? 'Edit link' : 'Add link'}
          aria-pressed={hasLink}
          aria-expanded={open === 'link'}
          title={hasLink ? 'Edit link' : 'Add link'}
        >
          <LinkIcon />
        </button>
        {open === 'link' && (
          <form
            className={styles.linkPopover}
            style={anchor ? popoverPosition(anchor, 320, 'start') : undefined}
            onSubmit={(e) => {
              e.preventDefault();
              applyLink();
            }}
          >
            <input
              type="text"
              inputMode="url"
              className={`${styles.linkInput} ${linkError ? styles.invalid : ''}`}
              value={linkDraft}
              onChange={(e) => {
                setLinkDraft(e.target.value);
                setLinkError(false);
              }}
              placeholder="https://example.com"
              aria-label="Link URL"
              aria-invalid={linkError}
              aria-describedby={linkError ? 'inline-link-error' : undefined}
              autoFocus
            />
            <button type="submit" className={styles.linkApply} aria-label="Apply link" title="Apply link">
              Apply
            </button>
            {linkError && (
              <span id="inline-link-error" className={styles.linkError} role="alert">
                Use an http(s) or e-mail link
              </span>
            )}
            {hasLink && (
              <button
                type="button"
                className={styles.linkRemove}
                onClick={() => {
                  unsetLink(editor);
                  setOpen(null);
                }}
                aria-label="Remove link"
                title="Remove link"
              >
                Remove
              </button>
            )}
          </form>
        )}
      </div>

      <span className={styles.sep} />

      {btn('X₂', () => toggleSubscript(editor), formats.subscript, 'Subscript')}
      {btn('X²', () => toggleSuperscript(editor), formats.superscript, 'Superscript')}

      <span className={styles.sep} />

      {/* Text color */}
      <div className={styles.popoverWrap}>
        <button
          type="button"
          className={styles.btn}
          onClick={(e) => toggle('color', e)}
          aria-label="Text color"
          aria-expanded={open === 'color'}
          title="Text color"
        >
          <span className={styles.colorGlyph} style={{ borderBottomColor: currentColor || 'currentColor' }}>
            A
          </span>
        </button>
        {open === 'color' && (
          <div
            className={styles.colorGrid}
            style={anchor ? popoverPosition(anchor, 170, 'center') : undefined}
            role="group"
            aria-label="Text color"
          >
            <button
              type="button"
              className={styles.colorSwatch}
              onClick={() => {
                setTextColor(editor, null);
                setOpen(null);
              }}
              aria-label="Default color"
              title="Default color"
              style={{ background: NONE_SWATCH }}
            />
            {COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className={`${styles.colorSwatch} ${currentColor === color ? styles.swatchActive : ''}`}
                onClick={() => {
                  setTextColor(editor, color);
                  setOpen(null);
                }}
                aria-label={`Color ${color}`}
                title={color}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Highlight */}
      <div className={styles.popoverWrap}>
        <button
          type="button"
          className={`${styles.btn} ${formats.highlight ? styles.active : ''}`}
          onClick={(e) => toggle('highlight', e)}
          aria-label="Highlight"
          aria-expanded={open === 'highlight'}
          title="Highlight"
        >
          <span className={styles.highlightGlyph} style={{ background: currentHighlight || 'rgba(241, 196, 15, 0.6)' }}>
            H
          </span>
        </button>
        {open === 'highlight' && (
          <div
            className={styles.colorGrid}
            style={anchor ? popoverPosition(anchor, 170, 'center') : undefined}
            role="group"
            aria-label="Highlight color"
          >
            <button
              type="button"
              className={styles.colorSwatch}
              onClick={() => {
                setHighlight(editor, null);
                setOpen(null);
              }}
              aria-label="No highlight"
              title="No highlight"
              style={{ background: NONE_SWATCH }}
            />
            {HIGHLIGHT_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className={`${styles.colorSwatch} ${currentHighlight === color ? styles.swatchActive : ''}`}
                onClick={() => {
                  setHighlight(editor, color);
                  setOpen(null);
                }}
                aria-label={`Highlight ${color}`}
                title={color}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        )}
      </div>

      {extras}

      <span className={styles.sep} />

      {btn(<ClearFormatIcon />, () => clearFormatting(editor), undefined, 'Clear formatting')}
    </div>
  );
}
