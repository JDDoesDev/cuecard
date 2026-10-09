import type { Slide, SlideElement, ListElement } from '@/types/slide';

/**
 * Compute the total number of fragment steps in a slide.
 * Returns 0 if no elements have fragments (everything visible immediately).
 */
export function computeTotalFragments(slide: Slide): number {
  let max = 0;
  for (const element of slide.elements) {
    if (element.fragment != null) {
      if (element.type === 'list' && element.fragmentPerItem && element.items.length > 0) {
        // Last item appears at fragment + items.length - 1
        max = Math.max(max, element.fragment + element.items.length - 1);
      } else {
        max = Math.max(max, element.fragment);
      }
    }
  }
  return max;
}

/**
 * Check whether an element should be visible at a given fragment step.
 * Elements without a fragment value are always visible (step 0).
 */
export function isElementVisible(element: SlideElement, visibleFragment: number): boolean {
  if (element.fragment == null) return true;
  return visibleFragment >= element.fragment;
}

/**
 * For a list with fragmentPerItem, return how many items to show
 * at the given fragment step.
 */
export function getVisibleItemCount(element: ListElement, visibleFragment: number): number {
  if (!element.fragmentPerItem || element.fragment == null) {
    return element.items.length;
  }
  // Each item reveals at fragment, fragment+1, fragment+2, ...
  const count = visibleFragment - element.fragment + 1;
  return Math.max(0, Math.min(count, element.items.length));
}
