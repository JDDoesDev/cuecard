/**
 * Shrink a code block's text so it fits its box instead of scrolling.
 *
 * The code font size is `calc(var(--font-size-base) * var(--code-scale, 1))`.
 * Everything in a slide scales with the container width (cqw), so the fitted
 * scale is the same at any slide size — it only changes when the code or the
 * element's proportions do. Text never grows past the base size.
 *
 * The export runtime (exportRuntime.ts) carries a minified copy of this logic.
 */
export const CODE_SCALE_VAR = '--code-scale';

/** Never shrink below this, so huge code stays visible (clipped) rather than vanishing. */
export const MIN_CODE_SCALE = 0.1;

/** Scale that makes content of size `content` fit in `available` (both excluding padding). */
export function computeCodeScale(
  available: { width: number; height: number },
  content: { width: number; height: number },
): number {
  const ratios = [available.width / content.width, available.height / content.height].filter(
    (r) => Number.isFinite(r) && r > 0,
  );
  const fit = Math.min(1, ...ratios);
  // Small margin so sub-pixel rounding never leaves a sliver of overflow
  return fit < 1 ? Math.floor(fit * 0.99 * 1000) / 1000 : 1;
}

/** Measure `box`'s <pre> at full size and set `--code-scale` on `box` so the code fits. */
export function fitCodeToBox(box: HTMLElement): void {
  const pre = box.querySelector('pre');
  // Hidden (display:none) boxes measure as 0 — keep the previous scale
  if (!pre || !box.clientWidth || !box.clientHeight) return;
  const cs = getComputedStyle(pre);
  const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) || 0;
  const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) || 0;
  const measure = (scale: number): number => {
    box.style.setProperty(CODE_SCALE_VAR, String(scale));
    return computeCodeScale(
      { width: pre.clientWidth - padX, height: pre.clientHeight - padY },
      { width: pre.scrollWidth - padX, height: pre.scrollHeight - padY },
    );
  };
  // Some width doesn't scale with the font (e.g. letter-spacing, borders), so
  // a single proportional shrink can fall short — repeat until it fits.
  let scale = 1;
  for (let pass = 0; pass < 5; pass++) {
    const shrink = measure(scale);
    if (shrink >= 1) return;
    scale = Math.max(MIN_CODE_SCALE, Math.floor(scale * shrink * 1000) / 1000);
    if (scale === MIN_CODE_SCALE) break;
  }
  box.style.setProperty(CODE_SCALE_VAR, String(scale));
}
