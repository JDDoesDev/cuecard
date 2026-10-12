# Contributing to Cuecard

Thanks for your interest in improving Cuecard! This guide covers how to set up the project, the conventions the code relies on, and what a good pull request looks like.

## Getting set up

Requirements:

- A current LTS release of **Node.js**
- **pnpm**, at the version pinned in `package.json` (`packageManager`). The easiest way to get it is `corepack enable`. Please don't use npm or yarn; they ignore `pnpm-lock.yaml`.

```bash
git clone git@github.com:JDDoesDev/cuecard.git
cd cuecard
pnpm install
pnpm dev                              # http://localhost:5173
```

For the browser tests, install Playwright's Chromium once:

```bash
pnpm exec playwright install chromium
```

## Scripts

| Command | What it does |
|---------|--------------|
| `pnpm dev` | Vite dev server |
| `pnpm build` | Production build (includes the PWA service worker) |
| `pnpm preview` | Serve the production build locally |
| `pnpm typecheck` | TypeScript check of the app (`tsc --noEmit`) |
| `pnpm typecheck:e2e` | TypeScript check of the Playwright tests |
| `pnpm test` | Unit tests (Vitest, jsdom) |
| `pnpm test:watch` | Unit tests in watch mode |
| `pnpm test:e2e` | Playwright browser tests (starts its own dev server on port 5199; set `E2E_PORT` to change it) |
| `pnpm test:e2e:ui` | Playwright in interactive UI mode |

Warnings from Zustand's persist middleware in unit test output are expected (there's no `localStorage` in the test environment).

## Finding your way around

[`CLAUDE.md`](CLAUDE.md) is the architecture reference: data flow, the element model, theming, fonts, storage and a table of key files. Read the sections for the area you're changing. The [README](README.md) documents the user-facing markdown format and directives.

The short version:

- `src/types/` holds the data model (`Slide`, `SlideElement`, sync messages)
- `src/store/presentationStore.ts` is the single source of truth (Zustand + Immer, with zundo for undo/redo)
- `src/lib/parser/` handles markdown to slides, and `src/lib/serializer/` handles slides back to markdown
- `src/components/editor/` contains the editor UI, and `src/components/layouts/` contains slide rendering
- `src/lib/editor/` contains the Tiptap rich-text engine and its conversions
- `src/lib/security/` contains HTML sanitizing and the inline style allowlist

## Conventions that matter

These are easy to break without noticing, so reviewers will check them:

- **Go through the store.** Never mutate slide data outside the store, and don't rebuild unchanged slides or elements. `Slide`, `ElementRenderer` and the code view are memoized and depend on unchanged objects keeping their identity. Otherwise every thumbnail re-renders on each drag step.
- **Keep markdown round-trips lossless.** If you add an element property or directive, update the parser (`remarkSlidePlugin.ts` / `inferLayout.ts`) and the serializer (`slideToMarkdown.ts`) together. Then add a round-trip test.
- **Imported content stays markdown until it's edited.** Anything that shows element content (the renderer or the in-place editor) has to convert it the same way. See "Editing imported content" in `CLAUDE.md`.
- **Sanitize user HTML.** All user-supplied HTML and inline styles go through `src/lib/security/`. The `html` element renders in a sandboxed iframe with no scripts. Keep it that way.
- **Size slide content in `cqw`.** Slide content scales with its container (`[data-slide-container]`), so a slide looks identical in the editor, presenter view and thumbnails. Use the `--font-size-*` / `--space-*` variables rather than fixed pixel sizes inside slides.
- **Keep editor UI theming separate from slide themes.** Slide themes apply to slide containers via `data-theme`. Editor UI light/dark mode applies to `<html>` via `data-ui-theme`. A change to one must not leak into the other.
- **Keep paired code in sync.** The code-fitting logic in `src/lib/code/fitCode.ts` has a minified copy in `src/lib/export/exportRuntime.ts`. The UI theme script in `index.html` mirrors `src/lib/theme/uiTheme.ts`.
- **Use the `@/` alias.** `@/` maps to `src/`; use it for imports across directories.
- **Match the surrounding code.** Follow its naming, comment density and idioms. There is no linter or formatter config, so consistency is by eye.

## Tests

- Unit tests sit next to the code they test, in `__tests__/` directories.
- Bug fixes should come with a test that fails without the fix.
- Parser and serializer changes need round-trip coverage.
- UI behavior that unit tests can't reach (focus, selection, layout, multi-window sync) belongs in a Playwright spec in `e2e/`. Shared helpers live in `e2e/support/app.ts`, and fixtures in `e2e/fixtures/`.
- The `demo/` folder has sample decks that are handy for manual testing.

Before opening a pull request, run:

```bash
pnpm typecheck && pnpm typecheck:e2e && pnpm test && pnpm test:e2e
```

## Commits and pull requests

- Keep each commit to one area or concern. Unrelated fixes go in separate commits.
- Write the subject line in the imperative mood and sentence case, with no type prefix, describing the user-visible change. For example: `Shrink code block text to fit its element instead of scrolling` or `Open decks through the ordinary file picker`.
- Use the commit body to explain *why* when it isn't obvious.
- In the pull request, describe what changed and how you verified it. For visual changes, include before and after screenshots, in both light and dark editor UI if the change touches the chrome.
- If your change affects architecture or a convention above, update `CLAUDE.md` in the same pull request. If it changes the markdown format or user-facing features, update the `README`.
- Saving and opening deck files must keep working in Chrome on Windows (including WSL paths) and on macOS. Read the Storage section of `CLAUDE.md` before touching `fileStorage.ts`.

## Reporting bugs

Please open an issue that includes:

- what you did, what you expected, and what happened
- browser and OS
- a minimal markdown deck that reproduces the problem, if one applies

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
