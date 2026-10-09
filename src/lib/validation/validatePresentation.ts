import { ZodError } from 'zod';
import { Presentation, PresentationSchema } from '@/types/presentation';
import { Slide, SlideSchema } from '@/types/slide';

// ============================================================================
// Presentation Validation
// ============================================================================

export function validatePresentation(data: unknown): Presentation {
  return PresentationSchema.parse(data);
}

export function safeValidatePresentation(
  data: unknown
):
  | { success: true; data: Presentation }
  | { success: false; error: ZodError } {
  const result = PresentationSchema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  } else {
    return { success: false, error: result.error };
  }
}

// ============================================================================
// Slide Validation
// ============================================================================

export function validateSlide(data: unknown): Slide {
  return SlideSchema.parse(data);
}

export function safeValidateSlide(
  data: unknown
): { success: true; data: Slide } | { success: false; error: ZodError } {
  const result = SlideSchema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  } else {
    return { success: false, error: result.error };
  }
}
