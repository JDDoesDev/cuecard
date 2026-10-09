# CLAUDE.md

## Commands

```bash
pnpm dev          # Start dev server (Vite)
pnpm build        # Production build
pnpm test         # Run tests (vitest run)
pnpm test:watch   # Run tests in watch mode
pnpm typecheck    # TypeScript check (tsc --noEmit)
```

Package manager: **pnpm** (v10.28.0). Do not use npm or yarn.

## Architecture

Presentation editor app: React 19 + Zustand + Vite + TypeScript. Three modes:

- **Edit mode** — WYSIWYG slide editor with Tiptap rich text, drag-and-drop reordering (dnd-kit), element positioning, speaker notes
- **Presenter mode** — fullscreen presentation with speaker notes, timer, next-slide preview; keyboard/click navigation
- **Audience mode** — synced read-only view receiving navigation state via BroadcastChannel + localStorage fallback

### Data Flow

`Markdown → remark parser → inferLayout → Slide[]` (import)
`Slide[] → slideToMarkdown` (export)
`Zustand store` is the single source of truth, with `zundo` for undo/redo.

### Universal Element Model

All slide layouts use `SlideElement[]` with percentage-based positioning (`x`, `y`, `w`, `h` as 0-100). Element types: `heading`, `text`, `list`, `code`, `image`, `video`, `rectangle`, `circle`, `line`, `html`. Layout types (`title`, `title-list`, `two-column`, `code-block`, `full-bleed-media`, `media-anywhere`, `freestyle`) are inferred from content but all render through `UniversalSlide` → `ElementRenderer`.

The `html` element type embeds arbitrary HTML/CSS as a first-class slide element. It stores raw HTML in `htmlContent`, renders via `dangerouslySetInnerHTML`, inherits slide theme styles (font, color), and serializes as a raw mdast `html` node for markdown round-trip. The editor provides a live preview above a syntax-highlighted code editor (SyntaxHighlighter overlay on textarea).

**Important**: `inferLayout.ts` converts mdast AST nodes to elements. The node-to-element mapping is NOT 1:1 — layouts reorder, combine, and filter nodes. Custom properties on mdast nodes (e.g., `_fragment`, `_fragmentPerItem`) pass metadata through this pipeline.

### Fragment/Build Animations

Elements have optional `fragment?: number` for incremental reveal during presentation. Lists support `fragmentPerItem?: boolean`. The `useFragmentNav` hook wraps slide navigation to step through fragments before advancing slides.

### Sync Protocol

`src/types/sync.ts` defines message types. `usePresentationSync` hook handles BroadcastChannel communication with localStorage fallback. Broadcasts include slide index and fragment index.

### Markdown Round-Trip

- **Parser**: `remarkSlidePlugin.ts` parses HTML comment directives (`<!-- position: ... -->`, `<!-- fragment: N -->`, etc.) and attaches metadata to mdast nodes. `inferLayout.ts` converts parsed nodes into `SlideElement[]`.
- **Serializer**: `slideToMarkdown.ts` converts `Slide[]` back to markdown with comment directives.

### Theming

CSS custom properties defined in `src/styles/themes/`. Six built-in themes. Variables scoped via `[data-theme]` attribute on `<html>`. Presentation-level fonts (`fontHeading`/`fontBody`) are scoped to slide containers via inline `--font-heading`/`--font-body` CSS vars — they don't leak to editor UI.

### Slide Content Scaling

Slide containers (both `<Slide>` component and editor canvas `.slideCanvas`) use the `data-slide-container` attribute, which applies `container-type: inline-size` and overrides `--font-size-*` / `--space-*` CSS vars with `cqw` (container query width) units. This ensures text and spacing scale proportionally with the slide container width — the same slide looks identical in edit mode, present mode, presenter view, and thumbnails. The scaling rules are in `src/styles/global.css` under the `[data-slide-container]` selector. Reference: 1000px container width ≈ original rem-based pixel values.

### Font System

- 17 bundled fonts via `@fontsource/*` packages (registered in `src/styles/fonts.ts`)
- Dynamic Google Fonts loading in `src/lib/fonts/fontLoader.ts` — **must use HTTPS** (API returns HTTP URLs, replace before injecting)
- `getAvailableFonts()` in `src/lib/fonts/availableFonts.ts` merges built-in + loaded Google Fonts
- Per-element `fontFamily` uses inline styles; presentation-level fonts use CSS vars

### Storage

- Autosave to localStorage (`src/lib/storage/autosave.ts`)
- IndexedDB via `idb-keyval` for media blobs
- File import/export for markdown files

## Key Files

| Area | Path |
|------|------|
| Types | `src/types/slide.ts`, `src/types/sync.ts`, `src/types/presentation.ts` |
| Store | `src/store/presentationStore.ts` |
| Parser | `src/lib/parser/remarkSlidePlugin.ts`, `src/lib/parser/inferLayout.ts` |
| Serializer | `src/lib/serializer/slideToMarkdown.ts` |
| Slide rendering | `src/components/layouts/UniversalSlide.tsx`, `src/components/layouts/ElementRenderer.tsx` |
| Navigation | `src/hooks/useFragmentNav.ts`, `src/hooks/useKeyboardNav.ts` |
| Editor | `src/components/editor/` (EditorLayout, SlidePanel, SlideEditor, EditorToolbar, etc.) |
| Themes | `src/styles/themes/` (default.css, dark.css, etc.) |

## Testing

Tests live alongside source in `__tests__/` directories. Vitest with jsdom environment. ~188 tests across parser, serializer, store, types, and fragments.

Zustand persist warnings in test output are expected (no localStorage in test env).

## Path Aliases

`@/*` maps to `./src/*` (configured in tsconfig.json and vite.config.ts).
