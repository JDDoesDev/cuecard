---
title: FLDC Feature Reference
theme: default
fontHeading: Raleway
fontBody: Source Sans 3
---

# FLDC Feature Reference

A complete guide to every markdown feature

<!-- notes: This presentation demonstrates every feature available in FLDC. Use it as a template for building your own presentations. -->
<!-- transition: fade -->

---

<!-- layout: title-list -->

## Slide Basics

- Slides are separated by `---` (horizontal rule)
- Frontmatter sets title, theme, and fonts
- Layouts are auto-inferred from content
- Override layout with `<!-- layout: type -->`

<!-- notes: The app supports 8 layout types: title, title-list, two-column, code-block, full-bleed-media, media-anywhere, freestyle, and blank. -->

---

<!-- layout: title -->

# Title Slide

A single heading with an optional subtitle line creates a centered title layout automatically

<!-- transition: fade -->

---

<!-- layout: title-list -->

## Unordered List

- First bullet point
- Second bullet point
- Third bullet point
- Fourth bullet point

<!-- notes: A heading followed by a list automatically infers the title-list layout. -->

---

<!-- layout: title-list -->

## Ordered List

1. Step one
2. Step two
3. Step three
4. Step four

---

<!-- layout: title-list -->

## Fragment Animations (All At Once)

<!-- fragment: 1 -->
- This entire list appears on the first click
- All items show at the same time
- Use `<!-- fragment: N -->` before any element

<!-- notes: A fragment directive without fragment-items reveals the whole element at once on click N. -->

---

<!-- layout: title-list -->

## Fragment Animations (One By One)

<!-- fragment: 1 -->
<!-- fragment-items -->
- This item appears first (click 1)
- This item appears second (click 2)
- This item appears third (click 3)
- This item appears fourth (click 4)

<!-- notes: Add both a fragment directive (fragment: 1) and a fragment-items directive before a list to reveal items individually. Each click reveals the next item. -->

---

<!-- layout: title-list -->

## Multiple Fragment Groups

<!-- fragment: 1 -->
This text appears on click 1

<!-- fragment: 2 -->
<!-- fragment-items -->
- Then this item on click 2
- This item on click 3
- This item on click 4

<!-- notes: You can mix fragment elements on the same slide. Each fragment number controls when that element appears. -->

---

## Two Columns

**Left column** content goes here.

You can put any text, lists, or formatting on either side.

- Left bullet one
- Left bullet two

<!-- column-break -->

**Right column** content goes here.

The `<!-- column-break -->` directive splits content into two columns.

- Right bullet one
- Right bullet two

---

<!-- layout: code-block -->

## Code Block

```typescript
import { parseMarkdown } from './parser';

const presentation = parseMarkdown(markdownString);

for (const slide of presentation.slides) {
  console.log(slide.layout, slide.elements.length);
}
```

A heading followed by a fenced code block infers the code-block layout

<!-- notes: Code blocks support syntax highlighting. The language identifier after the opening backticks determines the highlighting. -->

---

<!-- layout: code-block -->

## Multiple Languages

```python
def fibonacci(n: int) -> list[int]:
    """Generate fibonacci sequence."""
    fib = [0, 1]
    for i in range(2, n):
        fib.append(fib[i-1] + fib[i-2])
    return fib

print(fibonacci(10))
```

Supported languages: typescript, javascript, python, go, rust, css, html, bash, json, sql, php, twig

---

![Full-screen image](https://picsum.photos/1920/1080)

<!-- notes: A slide with only an image automatically becomes a full-bleed-media layout. The image fills the entire slide. -->

---

## Image With Text

This layout is inferred when a slide has both text and an image. The text appears on one side and the image on the other.

![Sample photo](https://picsum.photos/800/600)

<!-- notes: This is the media-anywhere layout. It's automatically detected when you mix text content with an image. -->

---

<!-- layout: title -->

# Text Formatting

Inline styles available in all text elements

---

<!-- layout: freestyle -->

## Rich Text Examples

**Bold text** for emphasis

*Italic text* for subtle emphasis

***Bold and italic*** combined

`inline code` for technical terms

~~Strikethrough~~ for corrections

[Hyperlinks](https://example.com) are supported

---

<!-- layout: freestyle -->

## Tables

| Feature | Status | Priority |
|---------|--------|----------|
| Markdown import | Done | High |
| WYSIWYG editing | Done | High |
| Fragment animations | Done | Medium |
| Export to PDF | Done | Low |

<!-- notes: Tables use GitHub-flavored markdown syntax. They render with theme-aware styling. -->

---

<!-- layout: title -->

# Transitions

Use `<!-- transition: type -->` to control slide entry

<!-- transition: fade -->

---

## Fade Transition

This slide uses `<!-- transition: fade -->`

The default smooth crossfade effect

<!-- transition: fade -->

---

## Slide Transition

This slide uses `<!-- transition: slide -->`

Content slides in from the right

<!-- transition: slide -->

---

## Zoom Transition

This slide uses `<!-- transition: zoom -->`

Content zooms in from center

<!-- transition: zoom -->

---

<!-- layout: title -->

# Layout Override

Force a specific layout with `<!-- layout: type -->`

---

<!-- layout: freestyle -->

## Freestyle Layout

When you use `<!-- layout: freestyle -->`, every content element becomes a separately positioned block that you can drag and resize in the editor.

This is a second text block.

This is a third text block.

<!-- notes: Freestyle is the most flexible layout. Each element gets its own position. In the editor, you can drag elements anywhere on the slide canvas. -->

---

<!-- layout: blank -->

<!-- notes: This is a blank slide. Use the layout directive with the value blank when you want an empty slide, perhaps as a pause point or for shapes added in the editor. -->

---

<!-- layout: title -->

# Speaker Notes

Add notes with `<!-- notes: your text -->`

<!-- notes: Speaker notes appear in the presenter view but not in the audience view. They help you remember key talking points during your presentation. You can write as much as you need here. -->

---

<!-- layout: title-list -->

## Available Themes

- default, dark, light, minimal
- corporate, nature
- aurora, sunset, midnight, ember, ocean
- split-teal, split-rose, split-charcoal, split-sage
- neon-vice, synthwave, cyber-grid

<!-- notes: Set the theme in frontmatter with `theme: name` or change it in the editor toolbar. Gradient and split themes only affect slides, not the editor UI. -->

---

<!-- layout: title-list -->

## Available Fonts (Bundled)

- Sans: Inter, Roboto, Open Sans, Lato, Montserrat, Poppins, Raleway, Source Sans 3, Nunito, Work Sans, Oswald
- Serif: Playfair Display, Merriweather, PT Serif, Libre Baskerville
- Mono: Fira Code, JetBrains Mono, Source Code Pro

<!-- notes: Set presentation-wide fonts in frontmatter with fontHeading and fontBody. Per-element fonts can be set in the editor. Google Fonts can also be loaded dynamically. -->

---

<!-- layout: title-list -->

## Keyboard Shortcuts

- **Ctrl+Z** / **Cmd+Z** -- Undo
- **Ctrl+Shift+Z** / **Cmd+Y** -- Redo
- **Ctrl+S** / **Cmd+S** -- Save
- **Delete** / **Backspace** -- Delete selected element
- **[ ]** -- Reorder element z-index
- **Arrow keys** -- Navigate slides in presentation
- **F** -- Toggle fullscreen
- **Escape** -- Exit presentation

---

<!-- layout: title -->

# Thank You

Questions?

<!-- notes: Wrap up and take questions from the audience. -->
<!-- transition: fade -->
