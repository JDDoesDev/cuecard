import { useCallback, useRef, useState, useEffect } from 'react';
import type { Editor } from '@tiptap/react';
import styles from './EditorFormatToolbar.module.css';

interface EditorFormatToolbarProps {
  editor: Editor;
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

export function EditorFormatToolbar({ editor }: EditorFormatToolbarProps) {
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showHighlightPicker, setShowHighlightPicker] = useState(false);
  const [showFontSize, setShowFontSize] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);

  // Close popovers on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setShowColorPicker(false);
        setShowHighlightPicker(false);
        setShowFontSize(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const btn = useCallback(
    (
      label: string,
      action: () => void,
      isActive: boolean,
      title: string,
      style?: React.CSSProperties
    ) => (
      <button
        type="button"
        key={title}
        className={`${styles.btn} ${isActive ? styles.active : ''}`}
        onClick={(e) => {
          e.preventDefault();
          action();
        }}
        title={title}
        style={style}
      >
        {label}
      </button>
    ),
    []
  );

  const currentFontSize =
    (editor.getAttributes('textStyle').fontSize as string) || '';

  return (
    <div ref={toolbarRef} className={styles.toolbar}>
      {/* Font Size */}
      <div className={styles.popoverWrap}>
        <button
          type="button"
          className={styles.sizeBtn}
          onClick={() => {
            setShowFontSize(!showFontSize);
            setShowColorPicker(false);
            setShowHighlightPicker(false);
          }}
          title="Font size"
        >
          {currentFontSize || 'Size'}
        </button>
        {showFontSize && (
          <div className={styles.popover}>
            <button
              type="button"
              className={styles.popoverItem}
              onClick={() => {
                editor.chain().focus().unsetFontSize().run();
                setShowFontSize(false);
              }}
            >
              Default
            </button>
            {FONT_SIZES.map((size) => (
              <button
                key={size}
                type="button"
                className={`${styles.popoverItem} ${
                  currentFontSize === size ? styles.active : ''
                }`}
                onClick={() => {
                  editor.chain().focus().setFontSize(size).run();
                  setShowFontSize(false);
                }}
              >
                {size}
              </button>
            ))}
          </div>
        )}
      </div>

      <span className={styles.sep} />

      {/* Basic formatting */}
      {btn('B', () => editor.chain().focus().toggleBold().run(), editor.isActive('bold'), 'Bold (Ctrl+B)', { fontWeight: 700 })}
      {btn('I', () => editor.chain().focus().toggleItalic().run(), editor.isActive('italic'), 'Italic (Ctrl+I)', { fontStyle: 'italic' })}
      {btn('U', () => editor.chain().focus().toggleUnderline().run(), editor.isActive('underline'), 'Underline (Ctrl+U)', { textDecoration: 'underline' })}
      {btn('S', () => editor.chain().focus().toggleStrike().run(), editor.isActive('strike'), 'Strikethrough', { textDecoration: 'line-through' })}

      <span className={styles.sep} />

      {/* Sub/Superscript */}
      {btn(
        'X\u2082',
        () => editor.chain().focus().toggleSubscript().run(),
        editor.isActive('subscript'),
        'Subscript'
      )}
      {btn(
        'X\u00B2',
        () => editor.chain().focus().toggleSuperscript().run(),
        editor.isActive('superscript'),
        'Superscript'
      )}

      <span className={styles.sep} />

      {/* Text Color */}
      <div className={styles.popoverWrap}>
        <button
          type="button"
          className={styles.btn}
          onClick={() => {
            setShowColorPicker(!showColorPicker);
            setShowHighlightPicker(false);
            setShowFontSize(false);
          }}
          title="Text color"
          style={{
            borderBottom: `3px solid ${
              (editor.getAttributes('textStyle').color as string) || 'currentColor'
            }`,
          }}
        >
          A
        </button>
        {showColorPicker && (
          <div className={styles.colorGrid}>
            <button
              type="button"
              className={styles.colorSwatch}
              onClick={() => {
                editor.chain().focus().unsetColor().run();
                setShowColorPicker(false);
              }}
              title="Default"
              style={{ background: 'linear-gradient(135deg, #fff 45%, #f00 50%, #fff 55%)' }}
            />
            {COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className={styles.colorSwatch}
                onClick={() => {
                  editor.chain().focus().setColor(color).run();
                  setShowColorPicker(false);
                }}
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
          className={`${styles.btn} ${editor.isActive('highlight') ? styles.active : ''}`}
          onClick={() => {
            setShowHighlightPicker(!showHighlightPicker);
            setShowColorPicker(false);
            setShowFontSize(false);
          }}
          title="Highlight"
        >
          <span
            style={{
              background: (editor.getAttributes('highlight').color as string) || 'rgba(241, 196, 15, 0.6)',
              padding: '0 3px',
              borderRadius: 2,
            }}
          >
            H
          </span>
        </button>
        {showHighlightPicker && (
          <div className={styles.colorGrid}>
            <button
              type="button"
              className={styles.colorSwatch}
              onClick={() => {
                editor.chain().focus().unsetHighlight().run();
                setShowHighlightPicker(false);
              }}
              title="No highlight"
              style={{ background: 'linear-gradient(135deg, #fff 45%, #f00 50%, #fff 55%)' }}
            />
            {HIGHLIGHT_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className={styles.colorSwatch}
                onClick={() => {
                  editor.chain().focus().setHighlight({ color }).run();
                  setShowHighlightPicker(false);
                }}
                title={color}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        )}
      </div>

      <span className={styles.sep} />

      {/* Alignment */}
      {btn('\u2261', () => editor.chain().focus().setTextAlign('left').run(), editor.isActive({ textAlign: 'left' }), 'Align left')}
      {btn('\u2261', () => editor.chain().focus().setTextAlign('center').run(), editor.isActive({ textAlign: 'center' }), 'Align center', { textAlign: 'center' })}
      {btn('\u2261', () => editor.chain().focus().setTextAlign('right').run(), editor.isActive({ textAlign: 'right' }), 'Align right', { textAlign: 'right' })}

      <span className={styles.sep} />

      {/* Clear formatting */}
      {btn(
        'T\u0338',
        () => editor.chain().focus().unsetAllMarks().clearNodes().run(),
        false,
        'Clear formatting'
      )}
    </div>
  );
}
