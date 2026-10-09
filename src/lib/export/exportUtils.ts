/**
 * Small, pure helpers used by the standalone HTML export.
 * Kept free of DOM/React dependencies so they are trivially unit-testable.
 */

export type ExportAspectRatio = '16:9' | '4:3' | '16:10';

/** Width/height pair for a presentation aspect ratio (defaults to 16:9). */
export function aspectRatioDims(ratio?: string): { w: number; h: number } {
  switch (ratio) {
    case '4:3':
      return { w: 4, h: 3 };
    case '16:10':
      return { w: 16, h: 10 };
    default:
      return { w: 16, h: 9 };
  }
}

/**
 * Make a string safe to use as a download filename: strips path separators,
 * reserved characters (/ \ : * ? " < > |) and control characters, collapses
 * whitespace and trims leading/trailing dots/spaces. Falls back to
 * "presentation" when nothing usable remains.
 */
export function sanitizeFilename(name: string | undefined | null): string {
  const cleaned = (name ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
    .replace(/[/\\:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.]+|[\s.]+$/g, '')
    .slice(0, 200);
  return cleaned || 'presentation';
}

const NAMED_COLOR = /^[a-z]{3,30}$/i;
const HEX_COLOR = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FUNC_COLOR = /^(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(\s*[-\d.%\s,/a-z]*\)$/i;
const VAR_COLOR = /^var\(\s*--[\w-]+\s*(?:,\s*(?:#[0-9a-f]{3,8}|[a-z]+))?\s*\)$/i;

/** True when `value` looks like a plain CSS color (no url(), quotes, semicolons…). */
export function isSafeColor(value: string | undefined | null): value is string {
  if (typeof value !== 'string') return false;
  const v = value.trim();
  if (!v || v.length > 100) return false;
  return HEX_COLOR.test(v) || NAMED_COLOR.test(v) || FUNC_COLOR.test(v) || VAR_COLOR.test(v);
}

/** Return `value` when it is a safe color, otherwise `fallback`. */
export function safeColor(value: string | undefined, fallback: string | undefined): string | undefined {
  return isSafeColor(value) ? value.trim() : fallback;
}

/** Keep font family names to a conservative character set (no quotes/semicolons). */
export function safeFontName(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const cleaned = name.replace(/[^\w\s-]/g, '').trim();
  return cleaned || undefined;
}

const YT_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
  'youtu.be',
  'www.youtu.be',
]);

function parseStartTime(raw: string | null): number | undefined {
  if (!raw) return undefined;
  if (/^\d+$/.test(raw)) return parseInt(raw, 10);
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/.exec(raw);
  if (!m || (!m[1] && !m[2] && !m[3])) return undefined;
  return (parseInt(m[1] || '0', 10) * 3600) + (parseInt(m[2] || '0', 10) * 60) + parseInt(m[3] || '0', 10);
}

/**
 * Parse a YouTube URL (watch, youtu.be, shorts, live, embed, v/) into its video
 * id and optional start time. Returns null for non-YouTube hosts or invalid ids.
 */
export function parseYouTubeUrl(url: string): { id: string; start?: number } | null {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  const host = parsed.hostname.toLowerCase();
  if (!YT_HOSTS.has(host)) return null;

  let id: string | null = null;
  const segments = parsed.pathname.split('/').filter(Boolean);
  if (host.endsWith('youtu.be')) {
    id = segments[0] ?? null;
  } else if (segments[0] === 'watch') {
    id = parsed.searchParams.get('v');
  } else if (['embed', 'shorts', 'live', 'v', 'e'].includes(segments[0] ?? '')) {
    id = segments[1] ?? null;
  }
  if (!id || !/^[\w-]{6,20}$/.test(id)) return null;

  const hashT = parsed.hash.startsWith('#t=') ? parsed.hash.slice(3) : null;
  const start = parseStartTime(parsed.searchParams.get('t') ?? parsed.searchParams.get('start') ?? hashT);
  return start ? { id, start } : { id };
}

/** Privacy-enhanced embed URL for a parsed YouTube video. */
export function youTubeEmbedUrl(video: { id: string; start?: number }): string {
  const base = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(video.id)}`;
  return video.start ? `${base}?start=${video.start}` : base;
}
