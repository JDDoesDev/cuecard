---
title: FLDC 2026 - Sample Presentation
theme: default
schemaVersion: "1.0"
---

<!-- transition: fade -->

# Welcome to FLDC 2026

<!-- position: {"x":10,"y":30,"width":80,"height":20} -->

Markdown-First Presentations

<!-- position: {"x":15,"y":55,"width":70,"height":10} -->

---

<!-- transition: slide -->

# Features

<!-- position: {"x":5,"y":5,"width":90,"height":15} -->

- 7 Layout Types
- Theme Support
- Keyboard Navigation
- Responsive Scaling

<!-- position: {"x":10,"y":25,"width":80,"height":70} -->

---

<!-- transition: fade -->

# Comparison

<!-- position: {"x":5,"y":5,"width":90,"height":12} -->

Before
\- Manual slides
\- No themes
\- Limited layouts

<!-- position: {"x":3,"y":20,"width":45,"height":75} -->

<!-- column-break -->

After
\- Markdown import
\- Rich themes
\- 7 layout types

<!-- position: {"x":52,"y":20,"width":45,"height":75} -->

---

## Example Code

<!-- position: {"x":5,"y":3,"width":90,"height":10} -->

```typescript
interface Presentation {
  id: string;
  title: string;
  theme: string;
  slides: Slide[];
}

function createPresentation(): Presentation {
  return { id: crypto.randomUUID(), title: '', theme: 'default', slides: [] };
}
```

<!-- position: {"x":5,"y":15,"width":90,"height":70} -->

Type-safe presentation data model

<!-- position: {"x":5,"y":88,"width":90,"height":8} -->

---

<!-- transition: zoom -->

![](https://picsum.photos/1920/1080)

<!-- position: {"x":0,"y":0,"width":100,"height":100} -->

Full-screen media with optional caption

<!-- position: {"x":5,"y":85,"width":90,"height":10} -->

---

<!-- transition: fade -->

Position media anywhere on the slide with text content flowing around it.

<!-- position: {"x":5,"y":5,"width":50,"height":90} -->

![](https://picsum.photos/800/600)

<!-- position: {"x":60,"y":20,"width":35,"height":50} -->

---

<!-- transition: slide -->

Freestyle Layout

<!-- position: {"x":10,"y":10,"width":40,"height":15} -->

Position text elements anywhere

<!-- position: {"x":15,"y":30,"width":35,"height":10} -->

Total creative freedom

<!-- position: {"x":50,"y":60,"width":40,"height":15} -->
