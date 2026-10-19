import { useMemo, useCallback, useState, useRef, useEffect } from 'react';
import { usePresentationStore } from '@/hooks/usePresentationStore';
import {
  presentationStore,
  beginHistoryBatch,
  endHistoryBatch,
  coalesceHistory,
} from '@/store/presentationStore';
import { slideToTiptap } from '@/lib/editor/slideToTiptap';
import { tiptapToSlide } from '@/lib/editor/tiptapToSlide';
import {
  getElementTextAlign,
  getTextAlignState,
  isTextLikeElement,
  textAlignUpdates,
  withElementTextAlign,
  type TextAlignValue,
  type TextLikeElement,
} from '@/lib/editor/textAlign';
import { textContentToLines, linesToTextContent } from '@/lib/editor/legacyTextContent';
import { lineHeightUpdates } from '@/lib/editor/editorCommands';
import type { Editor } from '@tiptap/react';
import { InlineTextEditor, type InlineEditEntry, type InlineTextEditorHandle } from './InlineTextEditor';
import { TextElementToolbar, type TextTypeValue } from './TextElementToolbar';
import { SelectableElement } from './SelectableElement';
import { SelectionRectangle } from './SelectionRectangle';
import { AlignmentGuides } from './AlignmentGuides';
import { AddElementToolbar } from './AddElementToolbar';
import { GridOverlay } from './GridOverlay';
import { ContextMenu } from './ContextMenu';
import { computeSnap, computeResizeSnap, type SnapLine } from '@/lib/editor/snapGuides';
import { clampToSlide, type ResizeDirection } from '@/lib/editor/resizeUtils';
import { ElementRenderer } from '@/components/layouts/ElementRenderer';
import { DEFAULT_STROKE } from '@/components/layouts/ShapeRenderer';
import { ColorSwatchPicker } from './ColorSwatchPicker';
import { useElementSelection } from '@/hooks/useElementSelection';
import { isShapeElement, type SlideElement, type ElementPosition } from '@/types/slide';
import { getAvailableFonts } from '@/lib/fonts/availableFonts';
import { useTheme } from '@/components/ThemeProvider/ThemeProvider';
import { SyntaxHighlighter, CODE_LANGUAGES, codeLanguagePickerValue } from '@/lib/code/languages';
import { oneDarkStyle } from '@/lib/code/oneDarkTheme';
import styles from './SlideEditor.module.css';

// Module-level clipboard — persists across slide navigation, ephemeral (no localStorage)
let clipboard: SlideElement[] | null = null;

const PASTE_OFFSET = 2; // percent
const NUDGE_STEP = 1; // percent
const NUDGE_STEP_LARGE = 5; // percent (with Shift)

const round2 = (n: number) => Math.round(n * 100) / 100;

const STROKE_WIDTHS = [1, 2, 3, 4, 6, 8, 12, 16];

/** Width choices, plus the current width if it isn't one (e.g. from markdown). */
function strokeWidthOptions(current: number): number[] {
  return STROKE_WIDTHS.includes(current) ? STROKE_WIDTHS : [...STROKE_WIDTHS, current].sort((a, b) => a - b);
}

/** Fresh slide from the store (avoids stale closures in long-lived handlers). */
function getFreshSlide(slideIndex: number) {
  return presentationStore.getState().presentation?.slides[slideIndex];
}

/** Index of the slide holding `elementId` (element ids are unique across the deck). */
function findSlideIndexOfElement(elementId: string): number {
  const slides = presentationStore.getState().presentation?.slides ?? [];
  return slides.findIndex((s) => s.elements.some((el) => el.id === elementId));
}

/**
 * Convert a heading/text/list element to another text type, keeping its text
 * and shared properties (position, fragment, font, line height, alignment).
 */
function convertTextElement(oldEl: TextLikeElement, newType: TextTypeValue, ordered?: boolean): SlideElement | null {
  // Extract paragraphs (inline HTML) from the old element
  const lines =
    oldEl.type === 'list'
      ? oldEl.items
      : oldEl.type === 'text'
        ? textContentToLines(oldEl.content)
        : [oldEl.content];

  // Properties shared by heading/text/list survive a type change
  const common = {
    id: oldEl.id,
    position: oldEl.position,
    ...(oldEl.fragment !== undefined && { fragment: oldEl.fragment }),
    ...(oldEl.lineHeight !== undefined && { lineHeight: oldEl.lineHeight }),
    ...(oldEl.fontFamily !== undefined && { fontFamily: oldEl.fontFamily }),
    ...(oldEl.verticalAlign !== undefined && { verticalAlign: oldEl.verticalAlign }),
  };

  let newElement: SlideElement;
  if (newType === 'text') {
    // Text content is rich HTML: one <p> per paragraph (a bare "\n" would be
    // a markdown soft break and merge the lines)
    newElement = {
      ...common,
      type: 'text',
      content: oldEl.type === 'text' ? oldEl.content : linesToTextContent(lines),
    };
  } else if (newType.startsWith('heading-')) {
    const level = parseInt(newType.split('-')[1], 10) as 1 | 2 | 3 | 4 | 5 | 6;
    const content = oldEl.type === 'heading' ? oldEl.content : lines.filter(Boolean).join(' ');
    newElement = { ...common, type: 'heading', content, level };
  } else if (newType === 'list') {
    const items = lines.map((s) => s.trim()).filter(Boolean);
    newElement = {
      ...common,
      type: 'list',
      items: items.length > 0 ? items : [''],
      ordered: ordered ?? (oldEl.type === 'list' ? oldEl.ordered : false),
      ...(oldEl.type === 'list' && oldEl.start !== undefined && { start: oldEl.start }),
      ...(oldEl.type === 'list' && oldEl.fragmentPerItem && { fragmentPerItem: true }),
    };
  } else {
    return null;
  }
  return withElementTextAlign(newElement, getElementTextAlign(oldEl));
}

/**
 * Clamp a move delta so part of the bounding box of `positions` stays on the
 * slide (it may hang off the edges). Keeps the relative spacing of a
 * multi-selection intact.
 */
function clampGroupDelta(positions: ElementPosition[], dx: number, dy: number) {
  if (positions.length === 0) return { dx: 0, dy: 0 };
  const minX = Math.min(...positions.map((p) => p.x));
  const minY = Math.min(...positions.map((p) => p.y));
  const maxX = Math.max(...positions.map((p) => p.x + p.width));
  const maxY = Math.max(...positions.map((p) => p.y + p.height));
  return {
    dx: clampToSlide(minX + dx, maxX - minX) - minX,
    dy: clampToSlide(minY + dy, maxY - minY) - minY,
  };
}

/**
 * Offset a pasted copy's x or y. Copies of elements that sit on the slide stay
 * on it; copies of elements hanging off an edge keep their overhang.
 */
function pasteOffset(start: number, size: number): number {
  const moved = start + PASTE_OFFSET;
  if (start >= 0 && start + size <= 100) return Math.max(0, Math.min(moved, 100 - size));
  return clampToSlide(moved, size);
}

/** Clone elements with new ids, offset so the copy is visible. */
function cloneElementsWithOffset(elements: SlideElement[]): SlideElement[] {
  return elements.map((el) => {
    const copy = structuredClone(el);
    copy.id = crypto.randomUUID();
    copy.position = {
      ...copy.position,
      x: pasteOffset(copy.position.x, copy.position.width),
      y: pasteOffset(copy.position.y, copy.position.height),
    };
    return copy;
  });
}

export interface SlideEditorProps {
  slideIndex: number;
  aspectRatio?: '16:9' | '4:3' | '16:10';
  className?: string;
}

/**
 * Universal element-based slide editor.
 *
 * Renders all elements as positioned blocks. Click an element to select it.
 * Supports multi-select, drag, resize, and keyboard shortcuts.
 * Double-click (or Enter) edits heading/text/list elements in place on the
 * canvas (InlineTextEditor); other element types open an edit panel.
 */
export function SlideEditor({ slideIndex, aspectRatio = '16:9', className = '' }: SlideEditorProps) {
  const store = usePresentationStore();
  const { theme } = useTheme();
  const selection = useElementSelection(slideIndex);
  const [editingElementId, setEditingElementId] = useState<string | null>(null);
  // In-place text editing: where the caret starts, the live Tiptap instance
  // (for the contextual toolbar) and a handle to flush pending updates
  const [editingEntry, setEditingEntry] = useState<InlineEditEntry>('end');
  const [activeEditor, setActiveEditor] = useState<Editor | null>(null);
  const inlineEditorRef = useRef<InlineTextEditorHandle>(null);
  const [activeGuides, setActiveGuides] = useState<SnapLine[]>([]);
  const [showGrid, setShowGrid] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; elementId: string } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Track the last slide JSON we sent to the store to detect echoes
  const lastSentSlideJsonRef = useRef<string>('');

  // Get current slide from store
  const slide = store.presentation?.slides[slideIndex];

  // Determine if the current slide is an echo of our own edit
  const currentSlideJson = slide ? JSON.stringify(slide) : '';
  const skipContentSync = currentSlideJson === lastSentSlideJsonRef.current;

  if (!skipContentSync) {
    lastSentSlideJsonRef.current = '';
  }

  // Find editing element by ID
  const editingElementIndex = useMemo(() => {
    if (!slide || !editingElementId) return null;
    return slide.elements.findIndex((el) => el.id === editingElementId);
  }, [slide, editingElementId]);

  const editingElement =
    slide && editingElementId ? slide.elements.find((el) => el.id === editingElementId) : undefined;
  /** Heading/text/list elements are edited in place on the canvas. */
  const isInlineEditing = !!editingElement && isTextLikeElement(editingElement);

  // Leave edit mode when the slide changes or the element disappears (undo,
  // deletion, another tab). An in-place editor flushes on unmount.
  useEffect(() => {
    setEditingElementId(null);
  }, [slideIndex]);
  useEffect(() => {
    if (editingElementId && slide && !editingElement) setEditingElementId(null);
  }, [editingElementId, slide, editingElement]);

  // Generate HTML content for the editing element
  const tiptapContent = useMemo<string>(() => {
    if (!slide || editingElementIndex === null) {
      return '<p></p>';
    }

    return slideToTiptap(slide, editingElementIndex);
  }, [slide, slideIndex, editingElementIndex]);

  // Handle in-place editor updates. Reads the deck fresh from the store and
  // locates the element by id: this also runs from an unmount flush, e.g.
  // after the user already switched to another slide.
  const handleEditorUpdate = useCallback((elementId: string, html: string) => {
    const targetSlideIndex = findSlideIndexOfElement(elementId);
    const freshSlide = getFreshSlide(targetSlideIndex);
    if (!freshSlide) return;
    const idx = freshSlide.elements.findIndex((el) => el.id === elementId);

    const updatedSlide = tiptapToSlide(html, freshSlide, idx);
    const updatedJson = JSON.stringify(updatedSlide);
    if (updatedJson === JSON.stringify(freshSlide)) return;
    lastSentSlideJsonRef.current = updatedJson;
    // Typing bursts become a single undo step
    coalesceHistory(
      `rich:${elementId}`,
      () => presentationStore.getState().updateSlide(targetSlideIndex, updatedSlide),
      2000
    );
  }, []);

  /** Push the in-place editor's pending (debounced) text to the store now. */
  const flushEditing = useCallback(() => {
    inlineEditorRef.current?.flush();
  }, []);

  const startEditing = useCallback(
    (id: string, entry: InlineEditEntry = 'end') => {
      selection.select(id, false);
      setEditingEntry(entry);
      setEditingElementId(id);
    },
    [selection]
  );

  /** Leave edit mode: commit pending text, keep the element selected, focus the canvas. */
  const exitEditing = useCallback(() => {
    flushEditing();
    const id = editingElementId;
    setEditingElementId(null);
    if (id && getFreshSlide(slideIndex)?.elements.some((el) => el.id === id)) {
      selection.select(id, false);
    }
    canvasRef.current?.focus({ preventScroll: true });
  }, [flushEditing, editingElementId, slideIndex, selection]);

  // In-place editing ends on a press outside the element and its toolbars
  // (canvas, another element, slide panel, …). Runs in the capture phase so
  // the text is committed before that press starts a drag or a selection.
  useEffect(() => {
    if (!isInlineEditing || !editingElementId) return;
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (!target || !(target instanceof Element)) return;
      if (target.closest(`[data-element-id="${CSS.escape(editingElementId)}"]`)) return;
      if (target.closest('[data-inline-editor-ui]')) return;
      exitEditing();
    };
    // Keyboard users: focus moving elsewhere (Tab to another control) also
    // ends editing. Focus going to the toolbars/popovers or back to the
    // document (window switch) keeps it.
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target;
      if (!(target instanceof Element) || target === document.body) return;
      if (target.closest(`[data-element-id="${CSS.escape(editingElementId)}"]`)) return;
      if (target.closest('[data-inline-editor-ui]')) return;
      exitEditing();
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('focusin', handleFocusIn);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('focusin', handleFocusIn);
    };
  }, [isInlineEditing, editingElementId, exitEditing]);

  /** Change the edited element's type (Text / Heading N / List) as one undo step. */
  const changeTextType = useCallback(
    (elementId: string, newType: TextTypeValue, ordered?: boolean) => {
      flushEditing();
      const freshSlide = getFreshSlide(slideIndex);
      const oldEl = freshSlide?.elements.find((el) => el.id === elementId);
      if (!freshSlide || !oldEl || !isTextLikeElement(oldEl)) return;
      const newElement = convertTextElement(oldEl, newType, ordered);
      if (!newElement) return;
      // The in-place editor is re-created for the new type: caret at the end
      if (newElement.type !== oldEl.type) setEditingEntry('end');
      store.updateSlide(slideIndex, {
        ...freshSlide,
        elements: freshSlide.elements.map((el) => (el.id === elementId ? newElement : el)),
      });
    },
    [flushEditing, slideIndex, store]
  );

  /**
   * Bulleted/numbered buttons work on the whole element: switch the list
   * style, turn a text/heading into a list, or (active style again) a list
   * back into text.
   */
  const setListStyle = useCallback(
    (elementId: string, style: 'bullet' | 'ordered') => {
      flushEditing();
      const el = getFreshSlide(slideIndex)?.elements.find((e) => e.id === elementId);
      if (!el || !isTextLikeElement(el)) return;
      const ordered = style === 'ordered';
      if (el.type !== 'list') {
        changeTextType(elementId, 'list', ordered);
      } else if (!!el.ordered === ordered) {
        changeTextType(elementId, 'text');
      } else {
        store.updateElement(slideIndex, elementId, { ordered, start: undefined } as Partial<SlideElement>);
      }
    },
    [flushEditing, changeTextType, slideIndex, store]
  );

  const handleElementAdded = useCallback(
    (element: SlideElement) => {
      // New text starts in edit mode with its placeholder text selected, so typing replaces it
      if (isTextLikeElement(element)) startEditing(element.id, 'all');
      else selection.select(element.id, false);
    },
    [startEditing, selection]
  );

  /** Update an element from a typing-style input (coalesced into one undo step per burst). */
  const typeUpdate = useCallback(
    (elementId: string, field: string, updates: Partial<SlideElement>) => {
      coalesceHistory(`${field}:${elementId}`, () => store.updateElement(slideIndex, elementId, updates));
    },
    [slideIndex, store]
  );

  // Handle position change from drag
  const handlePositionChange = useCallback(
    (elementId: string, newPosition: ElementPosition, disableSnap: boolean) => {
      const freshSlide = getFreshSlide(slideIndex);
      if (!freshSlide) return;

      // Check if dragging a multi-selected element - move all selected elements
      if (selection.selectedIds.size > 1 && selection.isSelected(elementId)) {
        const draggedElement = freshSlide.elements.find((el) => el.id === elementId);
        if (!draggedElement) return;

        const group = freshSlide.elements.filter((el) => selection.selectedIds.has(el.id));
        // Clamp the delta by the group's bounding box so spacing is preserved
        const { dx, dy } = clampGroupDelta(
          group.map((el) => el.position),
          newPosition.x - draggedElement.position.x,
          newPosition.y - draggedElement.position.y
        );
        if (dx === 0 && dy === 0) return;

        store.updateElements(
          slideIndex,
          group.map((el) => ({
            id: el.id,
            updates: {
              position: { ...el.position, x: round2(el.position.x + dx), y: round2(el.position.y + dy) },
            },
          }))
        );
      } else {
        // Single element drag - apply snapping if not disabled
        let finalPosition = newPosition;

        if (!disableSnap) {
          const siblings = freshSlide.elements
            .filter((el) => el.id !== elementId)
            .map((el) => el.position);

          const { snappedPosition, activeGuides: guides } = computeSnap(
            { x: newPosition.x, y: newPosition.y },
            { width: newPosition.width, height: newPosition.height },
            siblings
          );

          finalPosition = {
            ...newPosition,
            x: snappedPosition.x,
            y: snappedPosition.y,
          };

          setActiveGuides(guides);
        } else {
          setActiveGuides([]);
        }

        store.updateElement(slideIndex, elementId, { position: finalPosition });
      }
    },
    [slideIndex, store, selection]
  );

  // Handle resize (during resize operation). Only the dragged edges snap.
  const handleResize = useCallback(
    (elementId: string, newPosition: ElementPosition, disableSnap: boolean, direction: ResizeDirection) => {
      const freshSlide = getFreshSlide(slideIndex);
      if (!freshSlide) return;

      let finalPosition = newPosition;

      if (!disableSnap) {
        const siblings = freshSlide.elements
          .filter((el) => el.id !== elementId)
          .map((el) => el.position);

        const { snappedRect, activeGuides: guides } = computeResizeSnap(direction, newPosition, siblings);
        finalPosition = {
          x: round2(snappedRect.x),
          y: round2(snappedRect.y),
          width: round2(snappedRect.width),
          height: round2(snappedRect.height),
        };

        setActiveGuides(guides);
      } else {
        setActiveGuides([]);
      }

      store.updateElement(slideIndex, elementId, { position: finalPosition });
    },
    [slideIndex, store]
  );

  // Handle resize end. The (snapped) position was already committed by the
  // last handleResize call, so don't overwrite it with the unsnapped one.
  const handleResizeEnd = useCallback(() => {
    setActiveGuides([]);
    endHistoryBatch();
  }, []);

  // ---------------------------------------------------------------------------
  // Element operations (each is a single undo step)
  // ---------------------------------------------------------------------------

  const copyElements = useCallback(
    (ids: Iterable<string>) => {
      const freshSlide = getFreshSlide(slideIndex);
      if (!freshSlide) return;
      const idSet = new Set(ids);
      const selected = freshSlide.elements.filter((el) => idSet.has(el.id));
      if (selected.length > 0) {
        clipboard = structuredClone(selected);
      }
    },
    [slideIndex]
  );

  const deleteElements = useCallback(
    (ids: Iterable<string>) => {
      const list = [...ids];
      if (list.length === 0) return;
      store.deleteElements(slideIndex, list);
      selection.deselectAll();
    },
    [slideIndex, store, selection]
  );

  const insertCopies = useCallback(
    (source: SlideElement[]) => {
      const copies = cloneElementsWithOffset(source);
      if (copies.length === 0) return;
      store.addElements(slideIndex, copies);
      selection.selectAll(copies.map((el) => el.id));
    },
    [slideIndex, store, selection]
  );

  const pasteClipboard = useCallback(() => {
    if (clipboard) insertCopies(clipboard);
  }, [insertCopies]);

  const duplicateElements = useCallback(
    (ids: Iterable<string>) => {
      const freshSlide = getFreshSlide(slideIndex);
      if (!freshSlide) return;
      const idSet = new Set(ids);
      insertCopies(freshSlide.elements.filter((el) => idSet.has(el.id)));
    },
    [slideIndex, insertCopies]
  );

  const nudgeElements = useCallback(
    (ids: Iterable<string>, dxIn: number, dyIn: number) => {
      const freshSlide = getFreshSlide(slideIndex);
      if (!freshSlide) return;
      const idSet = new Set(ids);
      const group = freshSlide.elements.filter((el) => idSet.has(el.id));
      const { dx, dy } = clampGroupDelta(group.map((el) => el.position), dxIn, dyIn);
      if (dx === 0 && dy === 0) return;
      const key = `nudge:${group.map((el) => el.id).sort().join(',')}`;
      coalesceHistory(key, () =>
        store.updateElements(
          slideIndex,
          group.map((el) => ({
            id: el.id,
            updates: {
              position: { ...el.position, x: round2(el.position.x + dx), y: round2(el.position.y + dy) },
            },
          }))
        )
      );
    },
    [slideIndex, store]
  );

  // Handle context menu: right-clicking an unselected element selects it, so
  // every menu action targets the same set of elements.
  const handleContextMenu = useCallback(
    (elementId: string, x: number, y: number) => {
      if (!selection.isSelected(elementId)) {
        selection.select(elementId, false);
      }
      setContextMenu({ x, y, elementId });
    },
    [selection]
  );

  const contextTargetIds = useCallback((): string[] => {
    if (!contextMenu) return [];
    return selection.isSelected(contextMenu.elementId)
      ? [...selection.selectedIds]
      : [contextMenu.elementId];
  }, [contextMenu, selection]);

  // Context menu actions
  const handleBringForward = useCallback(() => {
    store.reorderElements(slideIndex, contextTargetIds(), 'forward');
  }, [contextTargetIds, slideIndex, store]);

  const handleSendBackward = useCallback(() => {
    store.reorderElements(slideIndex, contextTargetIds(), 'backward');
  }, [contextTargetIds, slideIndex, store]);

  const handleBringToFront = useCallback(() => {
    store.reorderElements(slideIndex, contextTargetIds(), 'front');
  }, [contextTargetIds, slideIndex, store]);

  const handleSendToBack = useCallback(() => {
    store.reorderElements(slideIndex, contextTargetIds(), 'back');
  }, [contextTargetIds, slideIndex, store]);

  const handleCopy = useCallback(() => {
    copyElements(contextTargetIds());
  }, [copyElements, contextTargetIds]);

  const handleDelete = useCallback(() => {
    deleteElements(contextTargetIds());
  }, [deleteElements, contextTargetIds]);

  const handleDuplicate = useCallback(() => {
    duplicateElements(contextTargetIds());
  }, [duplicateElements, contextTargetIds]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // While editing, the editor/panel owns the keyboard; Escape leaves
      // in-place text editing (and keeps the element selected)
      if (editingElementId !== null) {
        if (e.key === 'Escape' && isInlineEditing) {
          e.preventDefault();
          exitEditing();
        }
        return;
      }

      const target = e.target as HTMLElement;
      const isNativeInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable;

      if (isNativeInput) return;

      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const hasSelection = selection.selectedIds.size > 0;

      // Enter: edit the selected text element in place
      if (key === 'Enter' && !mod && selection.selectedIds.size === 1) {
        const onCanvas = target === document.body || canvasRef.current?.contains(target);
        const el = getFreshSlide(slideIndex)?.elements.find((x) => selection.selectedIds.has(x.id));
        if (onCanvas && el && isTextLikeElement(el)) {
          e.preventDefault();
          startEditing(el.id, 'end');
          return;
        }
      }

      // Delete/Backspace: delete selected elements
      if ((key === 'Delete' || key === 'Backspace') && hasSelection) {
        e.preventDefault();
        deleteElements(selection.selectedIds);
        return;
      }

      // Escape: deselect
      if (key === 'Escape' && hasSelection) {
        e.preventDefault();
        selection.deselectAll();
        return;
      }

      // [ / ]: move selected elements backward/forward in z-order
      if (key === '[' && !e.shiftKey && !mod && hasSelection) {
        e.preventDefault();
        store.reorderElements(slideIndex, [...selection.selectedIds], 'backward');
        return;
      }
      if (key === ']' && !e.shiftKey && !mod && hasSelection) {
        e.preventDefault();
        store.reorderElements(slideIndex, [...selection.selectedIds], 'forward');
        return;
      }

      if (mod && !e.altKey) {
        // Cmd/Ctrl+A: select all elements on the slide
        if (key === 'a') {
          e.preventDefault();
          const freshSlide = getFreshSlide(slideIndex);
          if (freshSlide) selection.selectAll(freshSlide.elements.map((el) => el.id));
          return;
        }
        // Cmd/Ctrl+C: copy selected elements
        if (key === 'c' && hasSelection) {
          e.preventDefault();
          copyElements(selection.selectedIds);
          return;
        }
        // Cmd/Ctrl+X: cut selected elements
        if (key === 'x' && hasSelection) {
          e.preventDefault();
          copyElements(selection.selectedIds);
          deleteElements(selection.selectedIds);
          return;
        }
        // Cmd/Ctrl+V: paste from clipboard
        if (key === 'v' && clipboard) {
          e.preventDefault();
          pasteClipboard();
          return;
        }
        // Cmd/Ctrl+D: duplicate selected elements
        if (key === 'd' && hasSelection) {
          e.preventDefault();
          duplicateElements(selection.selectedIds);
          return;
        }
      }

      const arrows: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      };

      // Arrow keys: nudge selected elements (Shift = larger step)
      if (hasSelection && arrows[key] && !mod) {
        e.preventDefault();
        const step = e.shiftKey ? NUDGE_STEP_LARGE : NUDGE_STEP;
        const [ax, ay] = arrows[key];
        nudgeElements(selection.selectedIds, ax * step, ay * step);
        return;
      }

      // Arrow keys: navigate slides when nothing is selected
      if (!hasSelection && store.presentation) {
        const slideCount = store.presentation.slides.length;
        if (key === 'ArrowLeft' && slideIndex > 0) {
          e.preventDefault();
          store.setCurrentSlide(slideIndex - 1);
        }
        if (key === 'ArrowRight' && slideIndex < slideCount - 1) {
          e.preventDefault();
          store.setCurrentSlide(slideIndex + 1);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    slideIndex,
    editingElementId,
    isInlineEditing,
    exitEditing,
    startEditing,
    selection,
    store,
    copyElements,
    deleteElements,
    pasteClipboard,
    duplicateElements,
    nudgeElements,
  ]);

  if (!slide) {
    return (
      <div className={`${styles.editorContainer} ${className}`}>
        <div className={styles.emptyState}>No slide selected</div>
      </div>
    );
  }

  // Non-text elements are edited in a panel that replaces the canvas
  if (editingElement && !isInlineEditing) {
    // Code elements use a textarea + language selector
    if (editingElement.type === 'code') {
      const pickerLanguage = codeLanguagePickerValue(editingElement.language);
      const isUnknownLanguage = pickerLanguage !== 'text' && !CODE_LANGUAGES.some((l) => l.id === pickerLanguage);
      return (
        <div className={`${styles.editorContainer} ${className}`}>
          <div className={styles.editorHeader}>
            <button
              className={styles.backButton}
              onClick={() => setEditingElementId(null)}
            >
              Back to canvas
            </button>
            <span className={styles.elementLabel}>Code</span>
            <select
              className={styles.languageSelect}
              aria-label="Code language"
              value={pickerLanguage}
              onChange={(e) => {
                store.updateElement(slideIndex, editingElement.id, {
                  language: e.target.value,
                } as any);
              }}
            >
              {isUnknownLanguage && (
                <option value={pickerLanguage}>{pickerLanguage} (not highlighted)</option>
              )}
              <option value="text">Plain text</option>
              {CODE_LANGUAGES.map((lang) => (
                <option key={lang.id} value={lang.id}>{lang.label}</option>
              ))}
            </select>
          </div>
          <textarea
            value={editingElement.code}
            onChange={(e) => {
              typeUpdate(editingElement.id, 'code', { code: e.target.value });
            }}
            placeholder="Enter code..."
            className={styles.codeTextarea}
          />
        </div>
      );
    }

    // HTML elements use a live preview + syntax-highlighted editor
    if (editingElement.type === 'html') {
      return (
        <div className={`${styles.editorContainer} ${className}`}>
          <div className={styles.editorHeader}>
            <button
              className={styles.backButton}
              onClick={() => setEditingElementId(null)}
            >
              Back to canvas
            </button>
            <span className={styles.elementLabel}>HTML</span>
          </div>
          <div className={styles.htmlPreview}>
            <div dangerouslySetInnerHTML={{ __html: editingElement.htmlContent }} />
          </div>
          <div className={styles.highlightedEditor}>
            <div className={styles.highlightedStack}>
              <SyntaxHighlighter
                language="html"
                style={oneDarkStyle('html')}
                customStyle={{
                  margin: 0,
                  padding: '16px',
                  background: 'transparent',
                  fontSize: '13px',
                  lineHeight: '1.6',
                  overflow: 'visible',
                }}
              >
                {editingElement.htmlContent || ' '}
              </SyntaxHighlighter>
              <textarea
                value={editingElement.htmlContent}
                onChange={(e) => {
                  typeUpdate(editingElement.id, 'htmlContent', { htmlContent: e.target.value });
                }}
                placeholder="Enter HTML..."
                className={styles.highlightedTextarea}
                spellCheck={false}
              />
            </div>
          </div>
        </div>
      );
    }

    // Image/video elements show URL editor
    if (editingElement.type === 'image' || editingElement.type === 'video') {
      return (
        <div className={`${styles.editorContainer} ${className}`}>
          <div className={styles.editorHeader}>
            <button
              className={styles.backButton}
              onClick={() => setEditingElementId(null)}
            >
              Back to canvas
            </button>
            <span className={styles.elementLabel}>
              {editingElement.type === 'image' ? 'Image' : 'Video'}
            </span>
          </div>
          <div className={styles.mediaInfo}>
            {editingElement.type === 'image' && (
              <div className={styles.mediaPreview}>
                <img src={editingElement.url} alt={editingElement.alt || ''} />
              </div>
            )}
            <div className={styles.mediaUrlDisplay}>
              <label>URL:</label>
              <input
                type="text"
                value={editingElement.url}
                onChange={(e) => {
                  typeUpdate(editingElement.id, 'url', { url: e.target.value });
                }}
                className={styles.urlInput}
              />
            </div>
          </div>
        </div>
      );
    }

    return null;
  }

  // Canvas mode - show all elements with selection system
  return (
    <div className={`${styles.editorContainer} ${className}`}>
      {/* Top bar: add-element tools, or the text element's tools while it is
          edited in place (same slot and height, so the canvas never moves) */}
      {isInlineEditing && editingElement && isTextLikeElement(editingElement) ? (
        <TextElementToolbar
          editor={activeEditor}
          element={editingElement}
          onTypeChange={(type) => changeTextType(editingElement.id, type)}
          onListStyle={(style) => setListStyle(editingElement.id, style)}
          onElementLineHeight={(value) => {
            flushEditing();
            store.updateElement(slideIndex, editingElement.id, lineHeightUpdates(editingElement, value));
          }}
          onDone={exitEditing}
        />
      ) : (
        <AddElementToolbar
          slideIndex={slideIndex}
          showGrid={showGrid}
          onGridToggle={() => setShowGrid(!showGrid)}
          onElementAdded={handleElementAdded}
        />
      )}

      {/* Slide Canvas */}
      <div className={styles.slideCanvasWrapper}>
        <div
          ref={canvasRef}
          className={styles.slideCanvas}
          tabIndex={-1}
          data-slide-container
          data-aspect={aspectRatio}
          data-theme={theme}
          style={{
            outline: 'none',
            ...(store.presentation?.fontHeading ? { '--font-heading': `'${store.presentation.fontHeading}', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif` } as any : {}),
            ...(store.presentation?.fontBody ? { '--font-body': `'${store.presentation.fontBody}', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif` } as any : {}),
          }}
          onClick={(e) => {
            // Clicking the canvas background deselects
            if (e.target === e.currentTarget) {
              selection.deselectAll();
            }
          }}
        >
          {slide.elements.map((element, idx) => (
            <SelectableElement
              key={element.id}
              element={element}
              isSelected={selection.isSelected(element.id)}
              isEditing={isInlineEditing && element.id === editingElementId}
              zIndex={idx}
              onSelect={(id, shiftKey) => {
                selection.select(id, shiftKey);
              }}
              onDoubleClick={(id, point) => {
                // Text: caret where the user double-clicked; code/media/HTML open
                // their panel. Shapes are styled from the controls bar instead.
                if (isTextLikeElement(element)) startEditing(id, point);
                else if (!isShapeElement(element)) setEditingElementId(id);
              }}
              onContextMenu={handleContextMenu}
              onPositionChange={handlePositionChange}
              onResize={handleResize}
              onResizeStart={beginHistoryBatch}
              onLineChange={(id, updates) => store.updateElement(slideIndex, id, updates)}
              onResizeEnd={handleResizeEnd}
              onDragStart={beginHistoryBatch}
              onDragEnd={() => {
                setActiveGuides([]);
                endHistoryBatch();
              }}
            >
              {isInlineEditing && element.id === editingElementId && isTextLikeElement(element) ? (
                <InlineTextEditor
                  key={element.type}
                  ref={inlineEditorRef}
                  element={element}
                  content={tiptapContent}
                  skipContentSync={skipContentSync}
                  onUpdate={handleEditorUpdate}
                  entry={editingEntry}
                  onEditorChange={setActiveEditor}
                />
              ) : (
                <ElementRenderer element={element} />
              )}
            </SelectableElement>
          ))}
          <SelectionRectangle
            onSelectionComplete={(ids, additive) => selection.selectAll(ids, additive)}
            elements={slide.elements}
            containerRef={canvasRef}
          />
          <GridOverlay visible={showGrid} />
          <AlignmentGuides guides={activeGuides} />
        </div>
      </div>

      {/* Controls Bar — slide-level + contextual element controls. Using it
          while text is edited in place ends editing (outside press/focus),
          which commits the text first; the element stays selected. */}
      <div className={styles.fragmentControls}>
        <label className={styles.fragmentLabel}>Transition:</label>
        <select
          value={slide.transition}
          onChange={(e) => {
            store.updateSlide(slideIndex, {
              ...slide,
              transition: e.target.value as 'fade' | 'slide' | 'zoom' | 'none',
            });
          }}
          className={styles.fontSelect}
          title="Slide transition effect"
        >
          <option value="none">None</option>
          <option value="fade">Fade</option>
          <option value="slide">Slide</option>
          <option value="zoom">Zoom</option>
        </select>

        {/* Element-specific controls (when a single element is selected) */}
        {selection.selectedIds.size === 1 && (() => {
          const selectedId = [...selection.selectedIds][0];
          const selectedElement = slide.elements.find((el) => el.id === selectedId);
          if (!selectedElement) return null;
          const hasTextProps = selectedElement.type === 'heading' || selectedElement.type === 'text' || selectedElement.type === 'list';
          return (
            <>
              <span className={styles.controlDivider} />
              {hasTextProps && (
                <>
                  <label className={styles.fragmentLabel}>Font:</label>
                  <select
                    value={selectedElement.fontFamily ?? ''}
                    onChange={(e) => {
                      store.updateElement(slideIndex, selectedId, {
                        fontFamily: e.target.value || undefined,
                      } as any);
                    }}
                    className={styles.fontSelect}
                    title="Font family for this element"
                  >
                    <option value="">Default</option>
                    {getAvailableFonts().map((font) => (
                      <option key={font} value={font}>{font}</option>
                    ))}
                  </select>
                  <span className={styles.controlDivider} />
                  <label className={styles.fragmentLabel}>Line Height:</label>
                  <select
                    value={selectedElement.lineHeight ?? ''}
                    onChange={(e) => {
                      const val = e.target.value ? parseFloat(e.target.value) : undefined;
                      store.updateElement(slideIndex, selectedId, {
                        lineHeight: val,
                      } as any);
                    }}
                    className={styles.fragmentInput}
                    title="Line height multiplier"
                  >
                    <option value="">Default</option>
                    <option value="1">1.0 (Tight)</option>
                    <option value="1.2">1.2</option>
                    <option value="1.4">1.4</option>
                    <option value="1.6">1.6</option>
                    <option value="1.8">1.8</option>
                    <option value="2">2.0</option>
                    <option value="2.5">2.5</option>
                    <option value="3">3.0 (Loose)</option>
                  </select>
                  <label className={styles.fragmentLabel}>Align:</label>
                  <select
                    value={getTextAlignState(selectedElement)}
                    onChange={(e) => {
                      store.updateElement(
                        slideIndex,
                        selectedId,
                        textAlignUpdates(selectedElement, e.target.value as TextAlignValue)
                      );
                    }}
                    className={styles.fragmentInput}
                    title="Horizontal text alignment (whole element)"
                  >
                    {getTextAlignState(selectedElement) === 'mixed' && (
                      <option value="mixed" disabled>Mixed</option>
                    )}
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                    <option value="right">Right</option>
                    <option value="justify">Justify</option>
                  </select>
                  <label className={styles.fragmentLabel}>V-Align:</label>
                  <select
                    value={selectedElement.verticalAlign ?? 'top'}
                    onChange={(e) => {
                      const val = e.target.value as 'top' | 'middle' | 'bottom';
                      store.updateElement(slideIndex, selectedId, {
                        verticalAlign: val === 'top' ? undefined : val,
                      } as any);
                    }}
                    className={styles.fragmentInput}
                    title="Vertical text alignment"
                  >
                    <option value="top">Top</option>
                    <option value="middle">Middle</option>
                    <option value="bottom">Bottom</option>
                  </select>
                  <span className={styles.controlDivider} />
                </>
              )}
              {isShapeElement(selectedElement) && (
                <>
                  {selectedElement.type !== 'line' && (
                    <>
                      <label className={styles.fragmentLabel}>Fill:</label>
                      <ColorSwatchPicker
                        label="Fill color"
                        noneLabel="No fill"
                        value={selectedElement.fill}
                        onChange={(fill) => store.updateElement(slideIndex, selectedId, { fill })}
                      />
                    </>
                  )}
                  <label className={styles.fragmentLabel}>
                    {selectedElement.type === 'line' ? 'Color:' : 'Outline:'}
                  </label>
                  <ColorSwatchPicker
                    label={selectedElement.type === 'line' ? 'Line color' : 'Outline color'}
                    noneLabel={selectedElement.type === 'line' ? 'Default color' : 'No outline'}
                    value={selectedElement.type === 'line' ? selectedElement.stroke : selectedElement.stroke ?? DEFAULT_STROKE}
                    onChange={(color) =>
                      store.updateElement(slideIndex, selectedId, {
                        // Shapes without a stroke get the default one, so "none" is explicit
                        stroke: color ?? (selectedElement.type === 'line' ? undefined : 'none'),
                      })
                    }
                  />
                  <label className={styles.fragmentLabel}>Width:</label>
                  <select
                    value={selectedElement.strokeWidth ?? 2}
                    onChange={(e) => {
                      store.updateElement(slideIndex, selectedId, { strokeWidth: parseFloat(e.target.value) });
                    }}
                    className={styles.fragmentInput}
                    title={selectedElement.type === 'line' ? 'Line width' : 'Outline width'}
                  >
                    {strokeWidthOptions(selectedElement.strokeWidth ?? 2).map((w) => (
                      <option key={w} value={w}>{w}px</option>
                    ))}
                  </select>
                  {selectedElement.type === 'rectangle' && (
                    <>
                      <label className={styles.fragmentLabel}>Corners:</label>
                      <input
                        type="number"
                        min="0"
                        value={selectedElement.cornerRadius ?? 0}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          typeUpdate(selectedId, 'cornerRadius', { cornerRadius: val > 0 ? val : undefined });
                        }}
                        className={styles.fragmentInput}
                        title="Corner radius (px)"
                      />
                    </>
                  )}
                  <span className={styles.controlDivider} />
                </>
              )}
              <label className={styles.fragmentLabel}>Fragment Step:</label>
              <input
                type="number"
                min="0"
                value={selectedElement.fragment ?? 0}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  typeUpdate(selectedId, 'fragment', { fragment: val > 0 ? val : undefined });
                }}
                className={styles.fragmentInput}
                title="0 = visible immediately, 1+ = appears on Nth click"
              />
              {selectedElement.type === 'list' && (
                <label className={styles.fragmentCheckbox}>
                  <input
                    type="checkbox"
                    checked={selectedElement.fragmentPerItem ?? false}
                    onChange={(e) => {
                      store.updateElement(slideIndex, selectedId, {
                        fragmentPerItem: e.target.checked || undefined,
                      } as any);
                    }}
                  />
                  Reveal items one-by-one
                </label>
              )}
            </>
          );
        })()}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onCopy={handleCopy}
          onPaste={pasteClipboard}
          onDuplicate={handleDuplicate}
          onDelete={handleDelete}
          hasClipboard={clipboard !== null}
          onBringForward={handleBringForward}
          onSendBackward={handleSendBackward}
          onBringToFront={handleBringToFront}
          onSendToBack={handleSendToBack}
        />
      )}
    </div>
  );
}
