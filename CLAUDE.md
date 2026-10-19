# CLAUDE.md

## Commands

```bash
pnpm dev          # Start dev server (Vite)
pnpm build        # Production build
pnpm test         # Run tests (vitest run)
pnpm test:watch   # Run tests in watch mode
pnpm typecheck    # TypeScript check (tsc --noEmit)
pnpm test:e2e     # Playwright browser tests (starts the dev server)
```

Package manager: **pnpm** (v10.28.0). Do not use npm or yarn.

## Architecture

Cuecard — presentation editor app: React 19 + Zustand + Vite + TypeScript. Three modes:

- **Edit mode** — WYSIWYG slide editor: text/heading/list elements are edited in place on the canvas (Tiptap; all text formatting lives in the element toolbar above the canvas), drag-and-drop reordering (dnd-kit), element positioning, speaker notes
- **Presenter mode** — fullscreen presentation with speaker notes, timer, next-slide preview; keyboard/click navigation
- **Audience mode** — synced read-only view receiving navigation state via BroadcastChannel + localStorage fallback

### Data Flow

`Markdown → remark parser → inferLayout → Slide[]` (import)
`Slide[] → slideToMarkdown` (export)
`Zustand store` is the single source of truth, with `zundo` for undo/redo.

**Rendering performance**: `Slide`, `ElementRenderer` and the code view are `React.memo`'d. This relies on the store (immer) keeping unchanged slides/elements as the same objects — never mutate slide data outside the store or rebuild unchanged objects, or every slide (hidden `PrintView` + slide panel thumbnails) re-renders on each drag step. The code view only re-highlights when `code`, `language` or `highlightLines` change.

### Universal Element Model

All slide layouts use `SlideElement[]` with percentage-based positioning (`x`, `y`, `w`, `h` as 0-100). Element types: `heading`, `text`, `list`, `code`, `image`, `video`, `rectangle`, `circle`, `line`, `html`. Layout types (`title`, `title-list`, `two-column`, `code-block`, `full-bleed-media`, `media-anywhere`, `freestyle`) are inferred from content but all render through `UniversalSlide` → `ElementRenderer`.

Code elements shrink their text to fit the element box instead of scrolling (never growing past `--font-size-base`). `fitCodeToBox` in `src/lib/code/fitCode.ts` measures the `<pre>` and sets a `--code-scale` CSS var on the box, refitting on resize, code change and font load (`loadingdone`). Because everything scales in `cqw`, the scale is resolution-independent. The standalone HTML export runtime (`src/lib/export/exportRuntime.ts`) carries a minified copy of the same logic — keep the two in sync.

The `html` element type embeds arbitrary HTML/CSS as a first-class slide element. It stores raw HTML in `htmlContent`, renders in a sandboxed iframe (`HtmlFrame.tsx`, no scripts) that receives the slide theme styles (font, color) and inlined fonts, and serializes as a raw mdast `html` node for markdown round-trip. The editor provides a live preview above a syntax-highlighted code editor (SyntaxHighlighter overlay on textarea).

**Important**: `inferLayout.ts` converts mdast AST nodes to elements. The node-to-element mapping is NOT 1:1 — layouts reorder, combine, and filter nodes. Custom properties on mdast nodes (e.g., `_fragment`, `_fragmentPerItem`) pass metadata through this pipeline.

### Fragment/Build Animations

Elements have optional `fragment?: number` for incremental reveal during presentation. Lists support `fragmentPerItem?: boolean`. The `useFragmentNav` hook wraps slide navigation to step through fragments before advancing slides.

### Sync Protocol

`src/types/sync.ts` defines message types. `usePresentationSync` hook handles BroadcastChannel communication with localStorage fallback. Broadcasts include slide index and fragment index.

### Markdown Round-Trip

- **Parser**: `remarkSlidePlugin.ts` parses HTML comment directives (`<!-- position: ... -->`, `<!-- fragment: N -->`, etc.) and attaches metadata to mdast nodes. `inferLayout.ts` converts parsed nodes into `SlideElement[]`.
- **Serializer**: `slideToMarkdown.ts` converts `Slide[]` back to markdown with comment directives.
- **Editing imported content**: imported text/heading/list content stays markdown until edited. `elementToHTML` (`slideToTiptap.ts`) must convert it to HTML the same way `ElementRenderer` renders it (`markdownToEditorHtml` for text, `inlineContentToHtml` for headings/list items) — otherwise markdown syntax becomes literal text on the first edit.

### Theming

CSS custom properties defined in `src/styles/themes/`. 18 built-in themes plus custom themes (`custom-<slug>`, injected `<style>`). Variables scoped via `[data-theme]` attribute on `<html>`. Presentation-level fonts (`fontHeading`/`fontBody`) are scoped to slide containers via inline `--font-heading`/`--font-body` CSS vars — they don't leak to editor UI.

Editor UI light/dark/system mode (`src/lib/theme/uiTheme.ts`, toolbar toggle) sets `data-ui-theme` on `<html>`; dark colors live in `src/styles/uiDark.css` under `:root[data-ui-theme='dark']`. Slides are unaffected because every slide container's `data-theme` redefines all color vars. `index.html` applies the stored preference before first paint — keep its inline script in sync with `uiTheme.ts`.

### Slide Content Scaling

Slide containers (both `<Slide>` component and editor canvas `.slideCanvas`) use the `data-slide-container` attribute, which applies `container-type: inline-size` and overrides `--font-size-*` / `--space-*` CSS vars with `cqw` (container query width) units. This ensures text and spacing scale proportionally with the slide container width — the same slide looks identical in edit mode, present mode, presenter view, and thumbnails. The scaling rules are in `src/styles/global.css` under the `[data-slide-container]` selector. Reference: 1000px container width ≈ original rem-based pixel values.

### Font System

- 17 bundled fonts via `@fontsource/*` packages (registered in `src/styles/fonts.ts`)
- Dynamic Google Fonts loading in `src/lib/fonts/fontLoader.ts` — **must use HTTPS** (API returns HTTP URLs, replace before injecting)
- `getAvailableFonts()` in `src/lib/fonts/availableFonts.ts` merges built-in + loaded Google Fonts
- Per-element `fontFamily` uses inline styles; presentation-level fonts use CSS vars

### Storage

- Autosave to localStorage (`src/lib/storage/autosave.ts`)
- **Project assets** (`src/lib/media/projectAssets.ts`, dev-server plugin `vite/projectAssets.ts`): a project folder holds one slideshow, so images live as files in `public/assets/` and image elements reference them as `/assets/<name>` — commit the folder to move a deck. Uploads/relinks are written there via `POST /__cuecard/assets`; the image popover's Project tab lists the folder. Save first moves any IndexedDB-only images (`cacheKey`) there (`linkProjectAssets`, no undo entry). Only under `vite` dev (`import.meta.env.DEV`); a static build keeps the IndexedDB path. e2e sets `CUECARD_ASSETS_DIR` so tests never write into `public/assets`.
- IndexedDB via `idb-keyval` for media blobs (fallback outside the dev server; legacy decks)
- File import/export for markdown files
- Deck files (`.cuecard.json`, `src/lib/storage/fileStorage.ts`) deliberately avoid the File System Access API — Chrome's pickers refuse some folders ("contains system files", e.g. `\\wsl.localhost` paths on Windows):
  - **Open** uses an ordinary `<input type=file>`.
  - **Save** (Ctrl+S) downloads the file (`<a download>`); Chrome asks for the folder when "Ask where to save each file" is on. Decks are never linked to a file, so there is no autosave to disk — localStorage autosave keeps work in progress.
  - Must work in Chrome on Windows (incl. WSL paths) and macOS.

## Key Files

| Area | Path |
|------|------|
| Types | `src/types/slide.ts`, `src/types/sync.ts`, `src/types/presentation.ts` |
| Store | `src/store/presentationStore.ts` |
| Parser | `src/lib/parser/remarkSlidePlugin.ts`, `src/lib/parser/inferLayout.ts` |
| Serializer | `src/lib/serializer/slideToMarkdown.ts` |
| Slide rendering | `src/components/layouts/UniversalSlide.tsx`, `src/components/layouts/ElementRenderer.tsx` |
| Navigation | `src/hooks/useFragmentNav.ts`, `src/hooks/useKeyboardNav.ts` |
| Editor | `src/components/editor/` (EditorLayout, SlidePanel, SlideEditor, InlineTextEditor, TextElementToolbar, EditorFormatToolbar, EditorToolbar) |
| Rich text engine | `src/lib/editor/` (tiptapSchema, slideToTiptap/tiptapToSlide, editorCommands, pasteCleanup) |
| Security | `src/lib/security/` (sanitize, inlineStyle allowlist) — all user HTML goes through these |
| Code blocks | `src/lib/code/` (languages, oneDarkTheme, fitCode) |
| Deck files | `src/lib/storage/fileStorage.ts` (open/save, embedded image assets) |
| Themes | `src/styles/themes/` (default.css, dark.css, etc.) |

## Testing

Tests live alongside source in `__tests__/` directories. Vitest with jsdom environment. ~705 unit tests across parser, serializer (incl. lossless round-trip), store, editor, export, media, hooks, and themes. Playwright browser tests in `e2e/` (`pnpm test:e2e`, ~39 tests).

Zustand persist warnings in test output are expected (no localStorage in test env).

## Path Aliases

`@/*` maps to `./src/*` (configured in tsconfig.json and vite.config.ts).
