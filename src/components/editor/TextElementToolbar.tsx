import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Editor } from '@tiptap/react';
import {
  getActiveFormats,
  setTextAlign,
  setLineHeight,
  toggleBulletList,
  toggleOrderedList,
  indent,
  outdent,
  insertTable,
  canInsertTable,
  addRowAfter,
  addColumnAfter,
  deleteRow,
  deleteColumn,
  deleteTable,
  toggleHeaderRow,
  type ActiveFormats,
} from '@/lib/editor/editorCommands';
import type { TextAlignValue, TextLikeElement } from '@/lib/editor/textAlign';
import { canOutdentListItem } from './inlineSurfaceExtension';
import { EditorFormatToolbar, useEditorTransactions } from './EditorFormatToolbar';
import {
  AlignLeftIcon,
  AlignCenterIcon,
  AlignRightIcon,
  AlignJustifyIcon,
  BulletListIcon,
  NumberedListIcon,
  IndentIcon,
  OutdentIcon,
  TableIcon,
  RowAddIcon,
  ColumnAddIcon,
  RowDeleteIcon,
  ColumnDeleteIcon,
  HeaderRowIcon,
  TableDeleteIcon,
} from './toolbarIcons';
import barStyles from './AddElementToolbar.module.css';
import styles from './TextElementToolbar.module.css';

/** Value of the element type select: 'text' | 'heading-1'…'heading-6' | 'list'. */
export type TextTypeValue = 'text' | 'list' | `heading-${1 | 2 | 3 | 4 | 5 | 6}`;

export function textTypeValue(el: TextLikeElement): TextTypeValue {
  return el.type === 'heading' ? `heading-${el.level}` : el.type;
}

export interface TextElementToolbarProps {
  /** Null until the in-place editor has mounted (controls render disabled). */
  editor: Editor | null;
  element: TextLikeElement;
  onTypeChange: (type: TextTypeValue) => void;
  /**
   * Bullet/numbered buttons on a heading or list element work on the whole
   * element: switch the list style, turn a heading into a list, or (active
   * style again) a list back into text. In a text element they toggle a list
   * inside the text instead.
   */
  onListStyle: (style: 'bullet' | 'ordered') => void;
  /** Element-level line height (heading/list elements; text sets it per paragraph). */
  onElementLineHeight: (value: number | undefined) => void;
  onDone: () => void;
  /**
   * Slot for further element-level tools, rendered before "Done". The bar
   * scrolls horizontally on narrow windows, so popovers in the slot should use
   * `position: fixed` (see the table picker below).
   */
  children?: ReactNode;
}

const ALIGNS: Array<{ value: TextAlignValue; label: string; shortcut: string; Icon: () => ReactNode }> = [
  { value: 'left', label: 'Align left', shortcut: 'Ctrl+Shift+L', Icon: AlignLeftIcon },
  { value: 'center', label: 'Align center', shortcut: 'Ctrl+Shift+E', Icon: AlignCenterIcon },
  { value: 'right', label: 'Align right', shortcut: 'Ctrl+Shift+R', Icon: AlignRightIcon },
  { value: 'justify', label: 'Justify', shortcut: 'Ctrl+Shift+J', Icon: AlignJustifyIcon },
];

const LINE_HEIGHTS = ['1', '1.15', '1.2', '1.5', '1.8', '2', '2.5', '3'];

const PICKER_SIZE = 6;

/** Rows × columns grid for inserting a table, positioned `fixed` below its button. */
function TablePicker({ anchor, onPick, onClose }: { anchor: DOMRect; onPick: (rows: number, cols: number) => void; onClose: () => void }) {
  const [hover, setHover] = useState({ rows: 2, cols: 3 });
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const target = e.target as Element;
      if (ref.current?.contains(target) || target.closest?.('[data-table-toggle]')) return;
      onClose();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [onClose]);
  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - 200));
  return (
    <div
      ref={ref}
      className={styles.tablePicker}
      style={{ top: anchor.bottom + 6, left }}
      role="group"
      aria-label="Insert table"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className={styles.tableGrid} style={{ gridTemplateColumns: `repeat(${PICKER_SIZE}, 18px)` }}>
        {Array.from({ length: PICKER_SIZE * PICKER_SIZE }, (_, i) => {
          const rows = Math.floor(i / PICKER_SIZE) + 1;
          const cols = (i % PICKER_SIZE) + 1;
          const on = rows <= hover.rows && cols <= hover.cols;
          return (
            <button
              key={i}
              type="button"
              className={styles.tableCell}
              data-on={on || undefined}
              aria-label={`Insert ${rows} by ${cols} table`}
              title={`${rows} × ${cols}`}
              onMouseEnter={() => setHover({ rows, cols })}
              onFocus={() => setHover({ rows, cols })}
              onClick={() => onPick(rows, cols)}
            />
          );
        })}
      </div>
      <div className={styles.tablePickerLabel} aria-hidden="true">
        {hover.rows} × {hover.cols}
      </div>
    </div>
  );
}

/**
 * Contextual toolbar shown in the canvas' top bar while a heading/text/list
 * element is edited in place. It occupies the AddElementToolbar's slot (same
 * box and height), so entering/exiting edit mode never moves the canvas and
 * the toolbar never covers the text being edited.
 */
export function TextElementToolbar({
  editor,
  element,
  onTypeChange,
  onListStyle,
  onElementLineHeight,
  onDone,
  children,
}: TextElementToolbarProps) {
  useEditorTransactions(editor);
  const [tableAnchor, setTableAnchor] = useState<DOMRect | null>(null);

  const formats: ActiveFormats | null = editor && !editor.isDestroyed ? getActiveFormats(editor) : null;
  const isText = element.type === 'text';

  const isBullet = isText ? formats?.listType === 'bullet' : element.type === 'list' && !element.ordered;
  const isOrdered = isText ? formats?.listType === 'ordered' : element.type === 'list' && !!element.ordered;
  const canIndentNow = !!formats?.canIndent;
  // Never lift a list element's top-level item out of the list (its text would be lost)
  const canOutdentNow =
    !!editor && !!formats?.canOutdent && (element.type !== 'list' || canOutdentListItem(editor.state, 'list'));

  // Paragraph line height inside text; element line height otherwise
  const lineHeightValue = String((isText ? formats?.lineHeight : null) ?? element.lineHeight ?? '');

  const listToggle = (style: 'bullet' | 'ordered') => {
    if (!editor) return;
    if (isText) {
      if (style === 'bullet') toggleBulletList(editor);
      else toggleOrderedList(editor);
    } else {
      onListStyle(style);
    }
  };

  const iconButton = (
    name: string,
    icon: ReactNode,
    onClick: () => void,
    opts: { pressed?: boolean; disabled?: boolean; shortcut?: string } = {}
  ) => (
    <button
      type="button"
      key={name}
      className={styles.iconButton}
      onClick={onClick}
      aria-label={name}
      title={opts.shortcut ? `${name} (${opts.shortcut})` : name}
      aria-pressed={opts.pressed}
      data-active={opts.pressed || undefined}
      disabled={opts.disabled || !editor}
    >
      {icon}
    </button>
  );

  return (
    <div
      className={`${barStyles.toolbar} ${styles.toolbar}`}
      role="toolbar"
      aria-label="Text element"
      data-inline-editor-ui=""
      // Buttons keep focus in the text; selects and slot inputs take focus normally
      onMouseDown={(e) => {
        if (!(e.target as HTMLElement).closest('input, select, textarea')) e.preventDefault();
      }}
    >
      <div className={barStyles.section}>
        <select
          className={styles.typeSelect}
          value={textTypeValue(element)}
          onChange={(e) => onTypeChange(e.target.value as TextTypeValue)}
          aria-label="Element type"
          title="Element type"
        >
          <option value="text">Text</option>
          <option value="heading-1">Heading 1</option>
          <option value="heading-2">Heading 2</option>
          <option value="heading-3">Heading 3</option>
          <option value="heading-4">Heading 4</option>
          <option value="heading-5">Heading 5</option>
          <option value="heading-6">Heading 6</option>
          <option value="list">List</option>
        </select>
      </div>

      <div className={barStyles.separator} />

      <EditorFormatToolbar editor={editor} />

      <div className={barStyles.separator} />

      <div className={barStyles.section} role="group" aria-label="Alignment">
        {ALIGNS.map(({ value, label, shortcut, Icon }) =>
          iconButton(label, <Icon />, () => editor && setTextAlign(editor, value), {
            pressed: formats ? formats.textAlign === value : false,
            shortcut,
          })
        )}
      </div>

      <div className={barStyles.separator} />

      <div className={barStyles.section} role="group" aria-label="Lists and indentation">
        {iconButton('Bulleted list', <BulletListIcon />, () => listToggle('bullet'), { pressed: isBullet })}
        {iconButton('Numbered list', <NumberedListIcon />, () => listToggle('ordered'), { pressed: isOrdered })}
        {iconButton('Decrease indent', <OutdentIcon />, () => editor && outdent(editor), {
          disabled: !canOutdentNow,
          shortcut: 'Shift+Tab',
        })}
        {iconButton('Increase indent', <IndentIcon />, () => editor && indent(editor), {
          disabled: !canIndentNow,
          shortcut: 'Tab',
        })}
        <select
          className={`${styles.typeSelect} ${styles.lineHeightSelect}`}
          value={LINE_HEIGHTS.includes(lineHeightValue) || lineHeightValue === '' ? lineHeightValue : 'custom'}
          onChange={(e) => {
            const value = e.target.value ? Number(e.target.value) : null;
            if (isText && editor) setLineHeight(editor, value);
            else onElementLineHeight(value ?? undefined);
          }}
          disabled={!editor}
          aria-label="Line spacing"
          title={isText ? 'Line spacing (selected paragraphs)' : 'Line spacing'}
        >
          <option value="">Spacing</option>
          {!LINE_HEIGHTS.includes(lineHeightValue) && lineHeightValue !== '' && (
            <option value="custom" disabled>
              {lineHeightValue}
            </option>
          )}
          {LINE_HEIGHTS.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </div>

      {formats?.tablesAvailable && (
        <>
          <div className={barStyles.separator} />
          <div className={barStyles.section} role="group" aria-label="Table">
            <button
              type="button"
              className={styles.iconButton}
              data-table-toggle=""
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setTableAnchor((cur) => (cur ? null : rect));
              }}
              aria-label="Insert table"
              title="Insert table"
              aria-haspopup="true"
              aria-expanded={!!tableAnchor}
              data-active={tableAnchor ? true : undefined}
              disabled={!editor || !canInsertTable(editor)}
            >
              <TableIcon />
            </button>
            {formats.inTable && (
              <>
                {iconButton('Add row below', <RowAddIcon />, () => editor && addRowAfter(editor))}
                {iconButton('Add column right', <ColumnAddIcon />, () => editor && addColumnAfter(editor))}
                {iconButton('Delete row', <RowDeleteIcon />, () => editor && deleteRow(editor))}
                {iconButton('Delete column', <ColumnDeleteIcon />, () => editor && deleteColumn(editor))}
                {iconButton('Toggle header row', <HeaderRowIcon />, () => editor && toggleHeaderRow(editor))}
                {iconButton('Delete table', <TableDeleteIcon />, () => editor && deleteTable(editor))}
              </>
            )}
          </div>
        </>
      )}

      {children && (
        <>
          <div className={barStyles.separator} />
          <div className={barStyles.section}>{children}</div>
        </>
      )}

      <button
        type="button"
        className={styles.doneButton}
        onClick={onDone}
        aria-label="Done editing"
        title="Done editing (Esc)"
      >
        Done
      </button>

      {tableAnchor && editor && (
        <TablePicker
          anchor={tableAnchor}
          onClose={() => setTableAnchor(null)}
          onPick={(rows, cols) => {
            setTableAnchor(null);
            insertTable(editor, rows, cols, true);
          }}
        />
      )}
    </div>
  );
}
