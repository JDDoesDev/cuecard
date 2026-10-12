# Cuecard

A markdown-first presentation editor: write slides in markdown or build them visually, then present with a speaker view, synced audience window, themes and fragment animations. Decks export to markdown, a self-contained HTML file, or PDF.

## Getting Started

```bash
pnpm install
pnpm dev        # Start dev server
pnpm build      # Production build
pnpm test       # Run tests
pnpm typecheck  # TypeScript check
```

## Slide Layouts

Every slide uses one of these layout presets. The layout is auto-detected from your content, or you can set it explicitly with `<!-- layout: name -->`.

| Layout | Description |
|--------|-------------|
| `title` | H1 heading with optional subtitle |
| `title-list` | Heading + bullet list |
| `two-column` | Side-by-side content split by `<!-- column-break -->` |
| `code-block` | Heading + syntax-highlighted code block |
| `full-bleed-media` | Single image filling the entire slide |
| `media-anywhere` | Image alongside text content |
| `freestyle` | Elements positioned freely on the canvas |
| `blank` | Empty slide |

## Markdown Format

Presentations are plain markdown. Slides are separated by `---` (a thematic break on its own line, with blank lines around it). Settings and metadata use HTML comment directives, which other markdown renderers simply hide.

````markdown
---
title: My Presentation
theme: dark
---

# Welcome
Subtitle text

???

Speaker notes go after a line containing only ???

---

<!-- layout: title-list -->
## Agenda
- First topic
- Second topic

---

## Code Example

```typescript
const x: number = 42;
```

---

Left column content

<!-- column-break -->

Right column content
````

### Code Blocks

Fenced code blocks are syntax-highlighted for the language named after the opening backticks (` ```php `, ` ```javascript `, …). Names are case-insensitive and common short forms work (`js`, `ts`, `py`, `sh`, `yml`, `c++`, `cs`, …). Supported: Bash, C, C++, C#, Clojure, CSS, Dart, Diff, Dockerfile, Elixir, Erlang, F#, Go, Groovy, Haskell, HTML/XML, INI/TOML, Java, JavaScript, JSON, Kotlin, Less, Lua, Makefile, Markdown, Nginx, Objective-C, Perl, PHP, PowerShell, Python, R, Ruby, Rust, Scala, SCSS, SQL, Swift, Twig, TypeScript and YAML (see `src/lib/code/languages.ts`). Other or missing languages render as plain text. The language name is kept as written on export.

### Frontmatter

Optional YAML at the very top of the file, between `---` lines.

| Key | Meaning |
|-----|---------|
| `title` | Presentation title |
| `theme` | Theme id (e.g. `default`, `dark`) |
| `fontHeading` / `fontBody` | Presentation-wide heading / body fonts |
| `aspectRatio` | `16:9`, `4:3` or `16:10` |
| `schemaVersion` | Written by the app; ignored on import |
| any other key | Kept as presentation metadata and written back on export |

Plain, quoted (`"..."`, `'...'`) and JSON-style values are supported, as are nested maps/lists and `|` / `>` block scalars. Values containing `:` or `#` should be quoted. Unsupported YAML (anchors, tags) is kept as text with an import warning.

### Speaker Notes

Everything after a line containing only `???` (until the next `---`) is the slide's speaker notes, taken verbatim — notes can contain any markdown. The legacy form `<!-- notes: text -->` is still read.

### Directives Reference

| Directive | Scope | Description |
|-----------|-------|-------------|
| `<!-- layout: name -->` | slide | Force a specific layout (otherwise inferred) |
| `<!-- transition: fade -->` | slide | Slide transition (`fade`, `slide`, `zoom`, `none`) |
| `<!-- notes: text -->` | slide | Speaker notes (legacy; prefer `???`) |
| `<!-- notes-data: "json string" -->` | slide | Speaker notes as a JSON string; written by export only when notes can't be represented after `???` |
| `<!-- column-break -->` | slide | Split point for the two-column layout (content before → left, after → right) |
| `<!-- fragment: N -->` | next element | Element appears on the Nth click |
| `<!-- fragment-items -->` | next list | List items reveal one per click, starting at the fragment step |
| `<!-- position: {"x":10,"y":20,"width":80,"height":50} -->` | previous element | Element position in % of the slide (see below) |
| `<!-- shape: {"type":"rectangle","fill":"#f00"} -->` | element | A shape (`rectangle`, `circle`, `line`) with its properties; combine with `position` |
| `<!-- element: {...} -->` | next block | Full element description written by export (see below) |

Unknown or invalid directive values (e.g. `<!-- transition: spin -->`) are ignored with an import warning — they never make an import fail. Other HTML comments (author notes, comments meant for other tools) are ignored.

**Position rule:** a `position` directive applies to the element it *follows* (the format older exports use). Only when it appears before the first element of a slide (or of a column after `column-break`) does it apply to the next element. If an element gets more than one position directive, the last one wins.

### Elements and Layouts

Each markdown block becomes one element, in document order: headings, paragraphs (text), lists, fenced code, images, and raw HTML blocks. Tables, block quotes and other blocks become text elements holding their markdown verbatim. An image whose URL is a video file (`.mp4`, `.webm`, `.mov`, …) or a YouTube/Vimeo link becomes a video element.

Lists keep their structure: nested sub-lists (indented under an item, any mix of `-` and `1.` lists, any depth) stay part of their parent item, and an ordered list keeps its start number (`3. Third` starts the list at 3). Export writes them back as indented markdown lists:

```markdown
3. Third **bold**
   - sub-point with [a link](https://example.com)
     1. deeper
4. Fourth
```

The layout (inferred or set with `layout:`) only decides **default positions**; it never drops or reorders content. Elements are laid out top-to-bottom in source order and always fit on the slide.

### Lossless Export Format

Markdown export round-trips everything the editor can do. When a slide matches what import would infer anyway, it is exported as plain markdown. Otherwise each element is preceded by an `element` directive carrying its type and any properties markdown can't express (position, fonts, alignment, line height, highlighted lines, image fit, colors, …), followed by the content as normal markdown:

```markdown
<!-- layout: freestyle -->

<!-- element: {"type":"heading","position":{"x":10,"y":5,"width":80,"height":12},"textAlign":"center"} -->

## Centered heading

<!-- fragment: 1 -->

<!-- element: {"type":"video","position":{"x":20,"y":30,"width":60,"height":50}} -->

![](https://example.com/clip.mp4)
```

- The block directly after an `element` directive is that element's content. Further blocks before the next directive are imported as separate, automatically positioned elements (with a warning).
- Content that can't be written as an unambiguous markdown block (e.g. text containing `---` or `???`) is stored inside the directive JSON instead.
- Shapes have no markdown form, so their directive stands alone.
- Rich text edited in the app (paragraphs with bold/italic/strike/code/links, and simple tables with a header row) is exported as plain markdown and GFM pipe tables under a directive with `"richText":true`; its content may span several paragraphs and tables up to the next directive. Formatting markdown can't express (fonts, colors, line spacing, indent, merged cells) is exported as HTML instead. Files using `"richText"` need this version of Cuecard or newer to import back exactly; older versions import the body as markdown text.

## Fragment Animations (Build/Reveal)

Fragments let you reveal elements incrementally during presentation. Press next to step through fragments within a slide before advancing to the next slide.

### How It Works

Rules for the markdown directives:

- `<!-- fragment: N -->` applies to the next element (or the next `element` block). N is a whole number ≥ 0.
- `<!-- fragment-items -->` only affects lists. Put it together with `fragment: N` before the list; items then appear on clicks N, N+1, …. Only top-level items are steps; nested sub-items appear with their parent.
- An image paragraph containing several images gives the fragment to the first one.

- Elements without a fragment value are visible immediately (step 0)
- `fragment: 1` means the element appears on the first click
- `fragment: 2` means the element appears on the second click
- After all fragments are revealed, the next click advances to the next slide
- Going backwards decrements the fragment, then moves to the previous slide (fully built)

### Making List Items Appear One by One

**In the editor:** Select a list element, then in the fragment controls bar:
1. Set **Fragment Step** to the click number when the first item should appear (e.g., `1`)
2. Check **Reveal items one-by-one**

Each item appears on successive clicks starting from the fragment step.

**In markdown:**

```markdown
# My Points

<!-- fragment: 1 -->
<!-- fragment-items -->
- First point appears on click 1
- Second point appears on click 2
- Third point appears on click 3
```

### Revealing Other Elements

Any element type (headings, images, code blocks, shapes, etc.) can have a fragment step.

**In the editor:** Select the element and set the Fragment Step number.

**In markdown:**

```markdown
# Title

Some intro text

<!-- fragment: 1 -->
## This heading appears on click 1

<!-- fragment: 2 -->
![](diagram.png)
```

### Fragment Ordering Example

Multiple elements can share the same fragment step (they appear together) or use different steps:

```markdown
# Build Slide

<!-- fragment: 1 -->
Step one explanation

<!-- fragment: 1 -->
![](step1.png)

<!-- fragment: 2 -->
Step two explanation

<!-- fragment: 3 -->
**Conclusion text**
```

Click 1 reveals the text and image together. Click 2 reveals the next text. Click 3 reveals the conclusion.

## Presentation Modes

### Single Screen
Click **Present (Single)** in the toolbar. Navigate with arrow keys, spacebar, or on-screen controls. Press `F` for fullscreen, `Escape` to exit.

### Dual Screen (Presenter + Audience)
Click **Present (Dual Screen)** to open an audience window. The main window becomes the presenter view with:
- Current slide (with fragment state)
- Next slide preview (fully built)
- Speaker notes
- Elapsed timer
- Navigation controls

Fragment state syncs automatically between presenter and audience views.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Right` / `Down` / `Space` | Next fragment or slide |
| `Left` / `Up` | Previous fragment or slide |
| `F` | Toggle fullscreen |
| `Escape` | Exit fullscreen or presentation |
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` / `Ctrl+Y` | Redo |
| `Ctrl+S` | Save to file |
| `Delete` / `Backspace` | Delete selected element(s) |
| `[` | Send element backward |
| `]` | Bring element forward |

## Editor Features

- **Rich text editing** with Tiptap (bold, italic, underline, strikethrough, sub/superscript, font size, color, highlight)
- **Element types:** headings (H1-H6), text, lists, code, images, videos, rectangles, circles, lines
- **Drag-and-drop** slide reordering in the side panel
- **Snap guides** and alignment aids when positioning elements
- **Layout selector** to change a slide's layout
- **Fragment controls** when an element is selected (step number + per-item reveal for lists)

## Themes

Select a built-in theme from the toolbar dropdown, or click **Customize** to open the theme panel. Themes control colors, fonts, and slide styling via CSS custom properties.

Click **Fonts** to browse and load Google Fonts.

## Import / Export

- **Import Markdown** parses `.md` files into slides with automatic layout inference
- **Export** options include Markdown (lossless; see [Lossless Export Format](#lossless-export-format)) and HTML (self-contained offline file)
- **Open** loads a `.cuecard.json` presentation file through the browser's ordinary file picker, which reaches any folder (including WSL paths on Windows). The opened file isn't linked for saving, so the next **Save** asks where to save.
- **Save / Save As** write `.cuecard.json` files with the File System Access API; after the first save, Save and autosave write to that file silently. Chrome's save picker refuses some folders (e.g. `\\wsl.localhost`), so **Download** saves a copy through the browser's normal downloads instead.

## Tech Stack

- React 19 + TypeScript
- Zustand (state) + Zundo (undo/redo) + Immer
- Tiptap (rich text editing)
- Vite + PWA
- Zod (validation)
- dnd-kit (drag and drop)
- react-syntax-highlighter (code blocks)
- unified/remark (markdown parsing/serialization)
- Vitest (testing)

## License

[MIT](LICENSE) © 2026 JD Flynn
