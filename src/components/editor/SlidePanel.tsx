import { useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  DragStartEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { usePresentationStore } from '@/hooks/usePresentationStore';
import type { Slide, LayoutPreset } from '@/types/slide';
import { LAYOUTS } from '@/types/slide';
import { createPresetElements } from '@/lib/presets/layoutPresets';
import { SortableSlideItem } from './SortableSlideItem';
import styles from './SlidePanel.module.css';

interface SlidePanelProps {
  className?: string;
}

export function SlidePanel({ className }: SlidePanelProps) {
  const {
    presentation,
    currentSlideIndex,
    setCurrentSlide,
    reorderSlides,
    addSlide,
    deleteSlide,
    duplicateSlide,
    resetToPreset,
  } = usePresentationStore();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [layoutPickerIndex, setLayoutPickerIndex] = useState<number | null>(null);

  // Configure sensors for drag and drop
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const slides = presentation?.slides ?? [];
  const activeSlide = slides.find((slide) => slide.id === activeId);

  // Slide operation handlers
  const handleDelete = (index: number) => {
    if (slides.length <= 1) return; // Prevent deleting the last slide
    deleteSlide(index);
  };

  const handleDuplicate = (index: number) => {
    duplicateSlide(index);
    // Set current to the duplicated slide (index + 1)
    setCurrentSlide(index + 1);
  };

  const handleAddAfter = (index: number, layout: LayoutPreset = 'title') => {
    const newSlide: Slide = {
      id: crypto.randomUUID(),
      layout,
      transition: 'none',
      elements: createPresetElements(layout),
    };
    addSlide(newSlide, index);
    setCurrentSlide(index + 1);
    setLayoutPickerIndex(null);
  };

  const handleShowLayoutPicker = (index: number) => {
    setLayoutPickerIndex(layoutPickerIndex === index ? null : index);
  };

  const handleChangeLayout = (index: number, layout: LayoutPreset) => {
    resetToPreset(index, layout);
  };

  // Drag and drop handlers
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = slides.findIndex((slide) => slide.id === active.id);
      const newIndex = slides.findIndex((slide) => slide.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        reorderSlides(oldIndex, newIndex);
      }
    }

    setActiveId(null);
  };

  const handleDragCancel = () => {
    setActiveId(null);
  };

  if (!presentation) {
    return null;
  }

  return (
    <div className={`${styles.panel} ${className ?? ''}`}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
        accessibility={{
          screenReaderInstructions: {
            draggable:
              'Press space or enter to pick up. Arrow keys to move. Space or enter to drop. Escape to cancel.',
          },
        }}
      >
        <SortableContext
          items={slides.map((s) => s.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className={styles.slideList}>
            {slides.map((slide, index) => (
              <div key={slide.id} className={styles.slideItemWrapper}>
                <SortableSlideItem
                  slide={slide}
                  index={index}
                  isActive={index === currentSlideIndex}
                  fontHeading={presentation?.fontHeading}
                  fontBody={presentation?.fontBody}
                  onSelect={setCurrentSlide}
                  onDelete={handleDelete}
                  onDuplicate={handleDuplicate}
                  onAddAfter={handleShowLayoutPicker}
                  onChangeLayout={handleChangeLayout}
                />
                {layoutPickerIndex === index && (
                  <div className={styles.layoutPicker}>
                    {LAYOUTS.map((layout) => (
                      <button
                        key={layout}
                        className={styles.layoutOption}
                        onClick={() => handleAddAfter(index, layout)}
                      >
                        {layout}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </SortableContext>
        <DragOverlay>
          {activeId && activeSlide ? (
            <div className={styles.dragOverlay}>
              <div className={styles.overlayBadge}>{activeSlide.layout}</div>
              <div className={styles.overlayNumber}>
                {slides.findIndex((s) => s.id === activeId) + 1}
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
