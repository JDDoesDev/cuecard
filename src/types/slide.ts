import { z } from 'zod';

// ============================================================================
// Element Position (all values 0-100 representing percentages)
// ============================================================================

export interface ElementPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const ElementPositionSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

// ============================================================================
// SlideElement Types (discriminated union by `type`)
// ============================================================================

export interface HeadingElement {
  id: string;
  type: 'heading';
  position: ElementPosition;
  content: string;
  level: 1 | 2 | 3 | 4 | 5 | 6;
  fragment?: number;
  lineHeight?: number;
  fontFamily?: string;
  verticalAlign?: 'top' | 'middle' | 'bottom';
}

export interface TextElement {
  id: string;
  type: 'text';
  position: ElementPosition;
  content: string;
  fragment?: number;
  lineHeight?: number;
  fontFamily?: string;
  verticalAlign?: 'top' | 'middle' | 'bottom';
}

export interface ListElement {
  id: string;
  type: 'list';
  position: ElementPosition;
  items: string[];
  ordered: boolean;
  fragment?: number;
  fragmentPerItem?: boolean;
  lineHeight?: number;
  fontFamily?: string;
  verticalAlign?: 'top' | 'middle' | 'bottom';
}

export interface CodeElement {
  id: string;
  type: 'code';
  position: ElementPosition;
  code: string;
  language: string;
  highlightLines?: number[];
  fragment?: number;
}

export interface ImageElement {
  id: string;
  type: 'image';
  position: ElementPosition;
  url: string;
  alt?: string;
  objectFit?: 'cover' | 'contain';
  cacheKey?: string;
  cachedUrl?: string;
  fragment?: number;
}

export interface VideoElement {
  id: string;
  type: 'video';
  position: ElementPosition;
  url: string;
  fragment?: number;
}

export interface RectangleElement {
  id: string;
  type: 'rectangle';
  position: ElementPosition;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  cornerRadius?: number;
  fragment?: number;
}

export interface CircleElement {
  id: string;
  type: 'circle';
  position: ElementPosition;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  fragment?: number;
}

export interface LineElement {
  id: string;
  type: 'line';
  position: ElementPosition;
  stroke?: string;
  strokeWidth?: number;
  fragment?: number;
}

export interface HtmlElement {
  id: string;
  type: 'html';
  position: ElementPosition;
  htmlContent: string;
  fragment?: number;
}

export type SlideElement =
  | HeadingElement
  | TextElement
  | ListElement
  | CodeElement
  | ImageElement
  | VideoElement
  | RectangleElement
  | CircleElement
  | LineElement
  | HtmlElement;

// ============================================================================
// SlideElement Zod Schemas
// ============================================================================

const VerticalAlignSchema = z.enum(['top', 'middle', 'bottom']).optional();

export const HeadingElementSchema = z.object({
  id: z.string(),
  type: z.literal('heading'),
  position: ElementPositionSchema,
  content: z.string(),
  level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)]),
  fragment: z.number().optional(),
  lineHeight: z.number().optional(),
  fontFamily: z.string().optional(),
  verticalAlign: VerticalAlignSchema,
});

export const TextElementSchema = z.object({
  id: z.string(),
  type: z.literal('text'),
  position: ElementPositionSchema,
  content: z.string(),
  fragment: z.number().optional(),
  lineHeight: z.number().optional(),
  fontFamily: z.string().optional(),
  verticalAlign: VerticalAlignSchema,
});

export const ListElementSchema = z.object({
  id: z.string(),
  type: z.literal('list'),
  position: ElementPositionSchema,
  items: z.array(z.string()),
  ordered: z.boolean(),
  fragment: z.number().optional(),
  fragmentPerItem: z.boolean().optional(),
  lineHeight: z.number().optional(),
  fontFamily: z.string().optional(),
  verticalAlign: VerticalAlignSchema,
});

export const CodeElementSchema = z.object({
  id: z.string(),
  type: z.literal('code'),
  position: ElementPositionSchema,
  code: z.string(),
  language: z.string(),
  highlightLines: z.array(z.number()).optional(),
  fragment: z.number().optional(),
});

export const ImageElementSchema = z.object({
  id: z.string(),
  type: z.literal('image'),
  position: ElementPositionSchema,
  url: z.string(),
  alt: z.string().optional(),
  objectFit: z.enum(['cover', 'contain']).optional(),
  cachedUrl: z.string().optional(),
  fragment: z.number().optional(),
});

export const VideoElementSchema = z.object({
  id: z.string(),
  type: z.literal('video'),
  position: ElementPositionSchema,
  url: z.string(),
  fragment: z.number().optional(),
});

export const RectangleElementSchema = z.object({
  id: z.string(),
  type: z.literal('rectangle'),
  position: ElementPositionSchema,
  fill: z.string().optional(),
  stroke: z.string().optional(),
  strokeWidth: z.number().optional(),
  cornerRadius: z.number().optional(),
  fragment: z.number().optional(),
});

export const CircleElementSchema = z.object({
  id: z.string(),
  type: z.literal('circle'),
  position: ElementPositionSchema,
  fill: z.string().optional(),
  stroke: z.string().optional(),
  strokeWidth: z.number().optional(),
  fragment: z.number().optional(),
});

export const LineElementSchema = z.object({
  id: z.string(),
  type: z.literal('line'),
  position: ElementPositionSchema,
  stroke: z.string().optional(),
  strokeWidth: z.number().optional(),
  fragment: z.number().optional(),
});

export const HtmlElementSchema = z.object({
  id: z.string(),
  type: z.literal('html'),
  position: ElementPositionSchema,
  htmlContent: z.string(),
  fragment: z.number().optional(),
});

export const SlideElementSchema = z.discriminatedUnion('type', [
  HeadingElementSchema,
  TextElementSchema,
  ListElementSchema,
  CodeElementSchema,
  ImageElementSchema,
  VideoElementSchema,
  RectangleElementSchema,
  CircleElementSchema,
  LineElementSchema,
  HtmlElementSchema,
]);

// ============================================================================
// Layout Presets
// ============================================================================

export type LayoutPreset =
  | 'title'
  | 'two-column'
  | 'code-block'
  | 'full-bleed-media'
  | 'title-list'
  | 'media-anywhere'
  | 'freestyle'
  | 'blank';

export const LayoutPresetSchema = z.enum([
  'title',
  'two-column',
  'code-block',
  'full-bleed-media',
  'title-list',
  'media-anywhere',
  'freestyle',
  'blank',
]);

// ============================================================================
// Unified Slide Type
// ============================================================================

export interface Slide {
  id: string;
  layout: LayoutPreset;
  transition: 'fade' | 'slide' | 'zoom' | 'none';
  elements: SlideElement[];
  notes?: string;
}

export const SlideSchema = z.object({
  id: z.string(),
  layout: LayoutPresetSchema,
  transition: z.enum(['fade', 'slide', 'zoom', 'none']).default('none'),
  elements: z.array(SlideElementSchema),
  notes: z.string().optional(),
});

// ============================================================================
// Constants
// ============================================================================

export const LAYOUTS: readonly LayoutPreset[] = [
  'title',
  'two-column',
  'code-block',
  'full-bleed-media',
  'title-list',
  'media-anywhere',
  'freestyle',
  'blank',
] as const;

// ============================================================================
// Element Type Guards
// ============================================================================

export function isHeadingElement(el: SlideElement): el is HeadingElement {
  return el.type === 'heading';
}

export function isTextElement(el: SlideElement): el is TextElement {
  return el.type === 'text';
}

export function isListElement(el: SlideElement): el is ListElement {
  return el.type === 'list';
}

export function isCodeElement(el: SlideElement): el is CodeElement {
  return el.type === 'code';
}

export function isImageElement(el: SlideElement): el is ImageElement {
  return el.type === 'image';
}

export function isVideoElement(el: SlideElement): el is VideoElement {
  return el.type === 'video';
}

export function isRectangleElement(el: SlideElement): el is RectangleElement {
  return el.type === 'rectangle';
}

export function isCircleElement(el: SlideElement): el is CircleElement {
  return el.type === 'circle';
}

export function isLineElement(el: SlideElement): el is LineElement {
  return el.type === 'line';
}

export function isHtmlElement(el: SlideElement): el is HtmlElement {
  return el.type === 'html';
}

// ============================================================================
// Legacy Types (kept temporarily for migration typing)
// ============================================================================

interface LegacyBaseSlide {
  id: string;
  transition: 'fade' | 'slide' | 'zoom' | 'none';
  notes?: string;
}

export interface LegacyTitleSlide extends LegacyBaseSlide {
  layout: 'title';
  title: string;
  subtitle?: string;
}

export interface LegacyTwoColumnSlide extends LegacyBaseSlide {
  layout: 'two-column';
  title?: string;
  leftContent: string;
  rightContent: string;
}

export interface LegacyCodeBlockSlide extends LegacyBaseSlide {
  layout: 'code-block';
  title?: string;
  code: string;
  language: string;
  caption?: string;
}

export interface LegacyFullBleedMediaSlide extends LegacyBaseSlide {
  layout: 'full-bleed-media';
  mediaUrl: string;
  mediaType: 'image' | 'video';
  caption?: string;
}

export interface LegacyTitleListSlide extends LegacyBaseSlide {
  layout: 'title-list';
  title: string;
  items: string[];
}

export interface LegacyMediaAnywhereSlide extends LegacyBaseSlide {
  layout: 'media-anywhere';
  content: string;
  media: {
    url: string;
    type: 'image' | 'video';
    position: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  };
}

export interface LegacyFreestyleSlide extends LegacyBaseSlide {
  layout: 'freestyle';
  elements: Array<{
    id: string;
    type: 'text';
    content: string;
    position: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  }>;
}

export type LegacySlide =
  | LegacyTitleSlide
  | LegacyTwoColumnSlide
  | LegacyCodeBlockSlide
  | LegacyFullBleedMediaSlide
  | LegacyTitleListSlide
  | LegacyMediaAnywhereSlide
  | LegacyFreestyleSlide;
