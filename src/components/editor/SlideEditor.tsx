import { useMemo, useCallback, useState, useRef, useEffect } from 'react';
import { usePresentationStore } from '@/hooks/usePresentationStore';
import { fldcToTiptap } from '@/lib/editor/fldcToTiptap';
import { tiptapToFldc } from '@/lib/editor/tiptapToFldc';
import { TiptapEditor } from './TiptapEditor';
import { SelectableElement } from './SelectableElement';
import { SelectionRectangle } from './SelectionRectangle';
import { AlignmentGuides } from './AlignmentGuides';
import { AddElementToolbar } from './AddElementToolbar';
import { GridOverlay } from './GridOverlay';
import { ContextMenu } from './ContextMenu';
import { computeSnap, type SnapLine } from '@/lib/editor/snapGuides';
import { ElementRenderer } from '@/components/layouts/ElementRenderer';
import { useElementSelection } from '@/hooks/useElementSelection';
import type { SlideElement } from '@/types/slide';
import { getAvailableFonts } from '@/lib/fonts/availableFonts';
import { useTheme } from '@/components/ThemeProvider/ThemeProvider';
import SyntaxHighlighter from 'react-syntax-highlighter/dist/esm/light';
import { vs2015 } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import styles from './SlideEditor.module.css';

// Module-level clipboard — persists across slide navigation, ephemeral (no localStorage)
let clipboard: SlideElement[] | null = null;

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
 * Double-click enters inline edit mode with TiptapEditor for text elements.
 */
export function SlideEditor({ slideIndex, aspectRatio = '16:9', className = '' }: SlideEditorProps) {
  const store = usePresentationStore();
  const { theme } = useTheme();
  const selection = useElementSelection(slideIndex);
  const [editingElementId, setEditingElementId] = useState<string | null>(null);
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

  // Generate HTML content for the editing element
  const tiptapContent = useMemo<string>(() => {
    if (!slide || editingElementIndex === null) {
      return '<p></p>';
    }

    return fldcToTiptap(slide, editingElementIndex);
  }, [slide, slideIndex, editingElementIndex]);

  // Handle editor updates for the editing element
  const handleEditorUpdate = useCallback(
    (html: string) => {
      if (!slide || editingElementIndex === null) return;

      const updatedSlide = tiptapToFldc(html, slide, editingElementIndex);
      lastSentSlideJsonRef.current = JSON.stringify(updatedSlide);
      store.updateSlide(slideIndex, updatedSlide);
    },
    [slide, slideIndex, store, editingElementIndex]
  );

  // Handle position change from drag or resize
  const handlePositionChange = useCallback(
    (elementId: string, newPosition: any, disableSnap: boolean) => {
      if (!slide) return;

      // Check if dragging a multi-selected element - move all selected elements
      if (selection.selectedIds.size > 1 && selection.isSelected(elementId)) {
        const draggedElement = slide.elements.find((el) => el.id === elementId);
        if (!draggedElement) return;

        // Calculate delta from the dragged element's original position
        const deltaX = newPosition.x - draggedElement.position.x;
        const deltaY = newPosition.y - draggedElement.position.y;

        // Apply delta to all selected elements
        selection.selectedIds.forEach((id) => {
          const element = slide.elements.find((el) => el.id === id);
          if (!element) return;

          const updatedPosition = {
            ...element.position,
            x: element.position.x + deltaX,
            y: element.position.y + deltaY,
          };

          // Constrain to bounds
          updatedPosition.x = Math.max(0, Math.min(100 - updatedPosition.width, updatedPosition.x));
          updatedPosition.y = Math.max(0, Math.min(100 - updatedPosition.height, updatedPosition.y));

          store.updateElement(slideIndex, id, { position: updatedPosition } as any);
        });
      } else {
        // Single element drag - apply snapping if not disabled
        let finalPosition = newPosition;

        if (!disableSnap) {
          const siblings = slide.elements
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

        store.updateElement(slideIndex, elementId, { position: finalPosition } as any);
      }
    },
    [slide, slideIndex, store, selection]
  );

  // Handle resize (during resize operation - for smart guides)
  const handleResize = useCallback(
    (elementId: string, newPosition: any, disableSnap: boolean) => {
      if (!slide) return;

      // Apply snapping if not disabled
      let finalPosition = newPosition;

      if (!disableSnap) {
        const siblings = slide.elements
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

      // Update position during resize
      store.updateElement(slideIndex, elementId, { position: finalPosition } as any);
    },
    [slide, slideIndex, store]
  );

  // Handle resize end
  const handleResizeEnd = useCallback(
    (elementId: string, newPosition: any) => {
      setActiveGuides([]);
      store.updateElement(slideIndex, elementId, { position: newPosition } as any);
    },
    [slideIndex, store]
  );

  // Handle context menu
  const handleContextMenu = useCallback((elementId: string, x: number, y: number) => {
    setContextMenu({ x, y, elementId });
  }, []);

  // Context menu actions
  const handleBringForward = useCallback(() => {
    if (contextMenu) {
      store.reorderElement(slideIndex, contextMenu.elementId, 'forward');
    }
  }, [contextMenu, slideIndex, store]);

  const handleSendBackward = useCallback(() => {
    if (contextMenu) {
      store.reorderElement(slideIndex, contextMenu.elementId, 'backward');
    }
  }, [contextMenu, slideIndex, store]);

  const handleBringToFront = useCallback(() => {
    if (contextMenu) {
      store.reorderElement(slideIndex, contextMenu.elementId, 'front');
    }
  }, [contextMenu, slideIndex, store]);

  const handleSendToBack = useCallback(() => {
    if (contextMenu) {
      store.reorderElement(slideIndex, contextMenu.elementId, 'back');
    }
  }, [contextMenu, slideIndex, store]);

  const handleCopy = useCallback(() => {
    if (!slide) return;
    const ids = selection.selectedIds.size > 0
      ? selection.selectedIds
      : contextMenu ? new Set([contextMenu.elementId]) : new Set<string>();
    const selected = slide.elements.filter((el) => ids.has(el.id));
    if (selected.length > 0) {
      clipboard = structuredClone(selected);
    }
  }, [slide, selection, contextMenu]);

  const handlePaste = useCallback(() => {
    if (!clipboard) return;
    const newIds: string[] = [];
    for (const el of clipboard) {
      const newId = crypto.randomUUID();
      newIds.push(newId);
      const newElement = structuredClone(el);
      newElement.id = newId;
      newElement.position = {
        ...newElement.position,
        x: Math.min(newElement.position.x + 2, 100 - newElement.position.width),
        y: Math.min(newElement.position.y + 2, 100 - newElement.position.height),
      };
      store.addElement(slideIndex, newElement);
    }
    selection.selectAll(newIds);
  }, [slideIndex, store, selection]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't fire shortcuts when in edit mode or in a native input
      if (editingElementId !== null) return;

      const target = e.target as HTMLElement;
      const isNativeInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      if (isNativeInput) return;

      // Delete/Backspace: delete selected elements
      if ((e.key === 'Delete' || e.key === 'Backspace') && selection.selectedIds.size > 0) {
        e.preventDefault();
        selection.selectedIds.forEach((id) => {
          store.deleteElement(slideIndex, id);
        });
        selection.deselectAll();
      }

      // [ key: move selected elements backward in z-order
      if (e.key === '[' && !e.shiftKey && selection.selectedIds.size > 0) {
        e.preventDefault();
        selection.selectedIds.forEach((id) => {
          store.reorderElement(slideIndex, id, 'backward');
        });
      }

      // ] key: move selected elements forward in z-order
      if (e.key === ']' && !e.shiftKey && selection.selectedIds.size > 0) {
        e.preventDefault();
        selection.selectedIds.forEach((id) => {
          store.reorderElement(slideIndex, id, 'forward');
        });
      }

      // Cmd/Ctrl+C: copy selected elements
      if ((e.metaKey || e.ctrlKey) && e.key === 'c' && selection.selectedIds.size > 0) {
        e.preventDefault();
        const selected = slide?.elements.filter((el) => selection.isSelected(el.id));
        if (selected && selected.length > 0) {
          clipboard = structuredClone(selected);
        }
      }

      // Cmd/Ctrl+X: cut selected elements
      if ((e.metaKey || e.ctrlKey) && e.key === 'x' && selection.selectedIds.size > 0) {
        e.preventDefault();
        const selected = slide?.elements.filter((el) => selection.isSelected(el.id));
        if (selected && selected.length > 0) {
          clipboard = structuredClone(selected);
          selection.selectedIds.forEach((id) => {
            store.deleteElement(slideIndex, id);
          });
          selection.deselectAll();
        }
      }

      // Cmd/Ctrl+V: paste from clipboard
      if ((e.metaKey || e.ctrlKey) && e.key === 'v' && clipboard) {
        e.preventDefault();
        const newIds: string[] = [];
        for (const el of clipboard) {
          const newId = crypto.randomUUID();
          newIds.push(newId);
          const newElement = structuredClone(el);
          newElement.id = newId;
          newElement.position = {
            ...newElement.position,
            x: Math.min(newElement.position.x + 2, 100 - newElement.position.width),
            y: Math.min(newElement.position.y + 2, 100 - newElement.position.height),
          };
          store.addElement(slideIndex, newElement);
        }
        selection.selectAll(newIds);
      }

      // Arrow keys: navigate slides when nothing is selected
      if (selection.selectedIds.size === 0 && store.presentation) {
        const slideCount = store.presentation.slides.length;
        if (e.key === 'ArrowLeft' && slideIndex > 0) {
          e.preventDefault();
          store.setCurrentSlide(slideIndex - 1);
        }
        if (e.key === 'ArrowRight' && slideIndex < slideCount - 1) {
          e.preventDefault();
          store.setCurrentSlide(slideIndex + 1);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [slideIndex, editingElementId, selection, store]);

  if (!slide) {
    return (
      <div className={`${styles.editorContainer} ${className}`}>
        <div className={styles.emptyState}>No slide selected</div>
      </div>
    );
  }

  // If in editing mode, show inline editor for the element
  if (editingElementId !== null) {
    const editingElement = slide.elements.find((el) => el.id === editingElementId);
    if (!editingElement) {
      setEditingElementId(null);
      return null;
    }

    // Code elements use a textarea + language selector
    if (editingElement.type === 'code') {
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
              value={editingElement.language}
              onChange={(e) => {
                store.updateElement(slideIndex, editingElement.id, {
                  language: e.target.value,
                } as any);
              }}
            >
              <option value="typescript">TypeScript</option>
              <option value="javascript">JavaScript</option>
              <option value="python">Python</option>
              <option value="go">Go</option>
              <option value="rust">Rust</option>
              <option value="css">CSS</option>
              <option value="html">HTML</option>
              <option value="bash">Bash</option>
              <option value="json">JSON</option>
              <option value="sql">SQL</option>
              <option value="php">PHP</option>
              <option value="twig">Twig</option>
            </select>
          </div>
          <textarea
            value={editingElement.code}
            onChange={(e) => {
              store.updateElement(slideIndex, editingElement.id, {
                code: e.target.value,
              } as any);
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
                style={vs2015}
                customStyle={{
                  margin: 0,
                  padding: '16px',
                  background: 'transparent',
                  fontSize: '13px',
                  lineHeight: '1.6',
                  fontFamily: "var(--font-code, 'JetBrains Mono', monospace)",
                  overflow: 'visible',
                }}
              >
                {editingElement.htmlContent || ' '}
              </SyntaxHighlighter>
              <textarea
                value={editingElement.htmlContent}
                onChange={(e) => {
                  store.updateElement(slideIndex, editingElement.id, {
                    htmlContent: e.target.value,
                  } as any);
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
                  store.updateElement(slideIndex, editingElement.id, {
                    url: e.target.value,
                  } as any);
                }}
                className={styles.urlInput}
              />
            </div>
          </div>
        </div>
      );
    }

    // Shape elements show properties panel
    if (editingElement.type === 'rectangle') {
      return (
        <div className={`${styles.editorContainer} ${className}`}>
          <div className={styles.editorHeader}>
            <button
              className={styles.backButton}
              onClick={() => setEditingElementId(null)}
            >
              Back to canvas
            </button>
            <span className={styles.elementLabel}>{editingElement.type} Properties</span>
          </div>
          <div className={styles.propertiesPanel}>
            <div className={styles.propertyGroup}>
              <label>Fill Color</label>
              <input
                type="text"
                value={editingElement.fill || ''}
                onChange={(e) => {
                  store.updateElement(slideIndex, editingElement.id, {
                    fill: e.target.value || undefined,
                  } as any);
                }}
                placeholder="transparent"
                className={styles.propertyInput}
              />
            </div>
            <div className={styles.propertyGroup}>
              <label>Stroke Color</label>
              <input
                type="text"
                value={editingElement.stroke || ''}
                onChange={(e) => {
                  store.updateElement(slideIndex, editingElement.id, {
                    stroke: e.target.value || undefined,
                  } as any);
                }}
                placeholder="#333"
                className={styles.propertyInput}
              />
            </div>
            <div className={styles.propertyGroup}>
              <label>Stroke Width</label>
              <input
                type="number"
                value={editingElement.strokeWidth || ''}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  store.updateElement(slideIndex, editingElement.id, {
                    strokeWidth: isNaN(val) ? undefined : val,
                  } as any);
                }}
                placeholder="2"
                className={styles.propertyInput}
              />
            </div>
            <div className={styles.propertyGroup}>
              <label>Corner Radius</label>
              <input
                type="number"
                value={editingElement.cornerRadius || ''}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  store.updateElement(slideIndex, editingElement.id, {
                    cornerRadius: isNaN(val) ? undefined : val,
                  } as any);
                }}
                placeholder="0"
                className={styles.propertyInput}
              />
            </div>
          </div>
        </div>
      );
    }

    if (editingElement.type === 'circle') {
      return (
        <div className={`${styles.editorContainer} ${className}`}>
          <div className={styles.editorHeader}>
            <button
              className={styles.backButton}
              onClick={() => setEditingElementId(null)}
            >
              Back to canvas
            </button>
            <span className={styles.elementLabel}>{editingElement.type} Properties</span>
          </div>
          <div className={styles.propertiesPanel}>
            <div className={styles.propertyGroup}>
              <label>Fill Color</label>
              <input
                type="text"
                value={editingElement.fill || ''}
                onChange={(e) => {
                  store.updateElement(slideIndex, editingElement.id, {
                    fill: e.target.value || undefined,
                  } as any);
                }}
                placeholder="transparent"
                className={styles.propertyInput}
              />
            </div>
            <div className={styles.propertyGroup}>
              <label>Stroke Color</label>
              <input
                type="text"
                value={editingElement.stroke || ''}
                onChange={(e) => {
                  store.updateElement(slideIndex, editingElement.id, {
                    stroke: e.target.value || undefined,
                  } as any);
                }}
                placeholder="#333"
                className={styles.propertyInput}
              />
            </div>
            <div className={styles.propertyGroup}>
              <label>Stroke Width</label>
              <input
                type="number"
                value={editingElement.strokeWidth || ''}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  store.updateElement(slideIndex, editingElement.id, {
                    strokeWidth: isNaN(val) ? undefined : val,
                  } as any);
                }}
                placeholder="2"
                className={styles.propertyInput}
              />
            </div>
          </div>
        </div>
      );
    }

    if (editingElement.type === 'line') {
      return (
        <div className={`${styles.editorContainer} ${className}`}>
          <div className={styles.editorHeader}>
            <button
              className={styles.backButton}
              onClick={() => setEditingElementId(null)}
            >
              Back to canvas
            </button>
            <span className={styles.elementLabel}>{editingElement.type} Properties</span>
          </div>
          <div className={styles.propertiesPanel}>
            <div className={styles.propertyGroup}>
              <label>Stroke Color</label>
              <input
                type="text"
                value={editingElement.stroke || ''}
                onChange={(e) => {
                  store.updateElement(slideIndex, editingElement.id, {
                    stroke: e.target.value || undefined,
                  } as any);
                }}
                placeholder="#333"
                className={styles.propertyInput}
              />
            </div>
            <div className={styles.propertyGroup}>
              <label>Stroke Width</label>
              <input
                type="number"
                value={editingElement.strokeWidth || ''}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  store.updateElement(slideIndex, editingElement.id, {
                    strokeWidth: isNaN(val) ? undefined : val,
                  } as any);
                }}
                placeholder="2"
                className={styles.propertyInput}
              />
            </div>
          </div>
        </div>
      );
    }

    // Text-based elements (heading, text, list) use TiptapEditor
    const textType = editingElement.type === 'heading'
      ? `heading-${editingElement.level}`
      : editingElement.type;

    const handleTypeChange = (newType: string) => {
      if (!slide) return;
      const oldEl = editingElement;
      let newElement: SlideElement;

      // Extract text content from old element
      const textContent = oldEl.type === 'list'
        ? oldEl.items.join('\n')
        : oldEl.content;

      if (newType === 'text') {
        newElement = {
          id: oldEl.id,
          type: 'text',
          position: oldEl.position,
          content: textContent,
        };
      } else if (newType.startsWith('heading-')) {
        const level = parseInt(newType.split('-')[1], 10) as 1 | 2 | 3 | 4 | 5 | 6;
        newElement = {
          id: oldEl.id,
          type: 'heading',
          position: oldEl.position,
          content: textContent,
          level,
        };
      } else if (newType === 'list') {
        const items = textContent
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean);
        newElement = {
          id: oldEl.id,
          type: 'list',
          position: oldEl.position,
          items: items.length > 0 ? items : [''],
          ordered: false,
        };
      } else {
        return;
      }

      // Replace element in slide
      const updatedElements = slide.elements.map((el) =>
        el.id === oldEl.id ? newElement : el
      );
      store.updateSlide(slideIndex, { ...slide, elements: updatedElements });
    };

    return (
      <div className={`${styles.editorContainer} ${className}`}>
        <div className={styles.editorHeader}>
          <button
            className={styles.backButton}
            onClick={() => setEditingElementId(null)}
          >
            Back to canvas
          </button>
          <select
            className={styles.typeSelect}
            value={textType}
            onChange={(e) => handleTypeChange(e.target.value)}
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
        <TiptapEditor
          content={tiptapContent}
          onUpdate={handleEditorUpdate}
          skipContentSync={skipContentSync}
          placeholder="Start typing..."
          className={styles.editor}
        />
      </div>
    );
  }

  // Canvas mode - show all elements with selection system
  return (
    <div className={`${styles.editorContainer} ${className}`}>
      {/* Add Element Toolbar */}
      <AddElementToolbar
        slideIndex={slideIndex}
        showGrid={showGrid}
        onGridToggle={() => setShowGrid(!showGrid)}
      />

      {/* Slide Canvas */}
      <div className={styles.slideCanvasWrapper}>
        <div
          ref={canvasRef}
          className={styles.slideCanvas}
          data-slide-container
          data-aspect={aspectRatio}
          data-theme={theme}
          style={{
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
              zIndex={idx}
              onSelect={(id, shiftKey) => {
                selection.select(id, shiftKey);
              }}
              onDoubleClick={(id) => {
                setEditingElementId(id);
              }}
              onContextMenu={handleContextMenu}
              onPositionChange={handlePositionChange}
              onResize={handleResize}
              onResizeEnd={handleResizeEnd}
              onDragStart={() => {
                // Could track dragging state here if needed
              }}
              onDragEnd={() => {
                setActiveGuides([]);
              }}
            >
              <ElementRenderer element={element} />
            </SelectableElement>
          ))}
          <SelectionRectangle
            onSelectionComplete={(ids) => selection.selectAll(ids)}
            elements={slide.elements}
            containerRef={canvasRef}
          />
          <GridOverlay visible={showGrid} />
          <AlignmentGuides guides={activeGuides} />
        </div>
      </div>

      {/* Controls Bar — slide-level + contextual element controls */}
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
              <label className={styles.fragmentLabel}>Fragment Step:</label>
              <input
                type="number"
                min="0"
                value={selectedElement.fragment ?? 0}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  store.updateElement(slideIndex, selectedId, {
                    fragment: val > 0 ? val : undefined,
                  } as any);
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
          onPaste={handlePaste}
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
