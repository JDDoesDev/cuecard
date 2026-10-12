## Example Code

```typescript
interface Presentation {
  id: string;
  title: string;
  theme: string;
  slides: Slide[];
}

function createPresentation(): Presentation {
  return { id: crypto.randomUUID(), title: '', theme: 'default', slides: [], createdAt: Date.now() };
}

export const presentations = new Map<string, Presentation>();
```
