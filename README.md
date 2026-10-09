# FLDC 2026

A markdown-first presentation app built with React, TypeScript, and Zustand.

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

Slides are separated by `---`. Metadata uses HTML comment directives.

```markdown
---
title: My Presentation
theme: dark
---

# Welcome
Subtitle text

<!-- notes: Remember to greet the audience -->

---

<!-- layout: title-list -->
## Agenda
- First topic
- Second topic
- Third topic

---

## Code Example

```typescript
const x: number = 42;
```

---

Left column content

<!-- column-break -->

Right column content
```

### Directives Reference

| Directive | Description |
|-----------|-------------|
| `<!-- layout: name -->` | Force a specific layout |
| `<!-- transition: fade -->` | Slide transition (`fade`, `slide`, `zoom`, `none`) |
| `<!-- notes: text -->` | Speaker notes |
| `<!-- position: {"x":10,"y":20,"width":80,"height":50} -->` | Element position (percentages) |
| `<!-- column-break -->` | Split point for two-column layout |
| `<!-- fragment: N -->` | Element appears on the Nth click (see below) |
| `<!-- fragment-items -->` | List items reveal one at a time (see below) |

## Fragment Animations (Build/Reveal)

Fragments let you reveal elements incrementally during presentation. Press next to step through fragments within a slide before advancing to the next slide.

### How It Works

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
- **Export** options include Markdown (with position/layout metadata) and HTML (self-contained offline file)
- **Open/Save** uses the File System Access API for native `.json` presentation files

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
