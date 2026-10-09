// ============================================================================
// YouTube URL parsing
// ============================================================================

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
]);

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

export interface YouTubeVideo {
  id: string;
  /** Start offset in seconds */
  start?: number;
}

/** Parse "90", "90s", "1m30s", "1h2m3s" into seconds. */
export function parseYouTubeTime(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  if (/^\d+$/.test(value)) return parseInt(value, 10);
  const match = value.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!match || (!match[1] && !match[2] && !match[3])) return undefined;
  return (parseInt(match[1] || '0', 10) * 3600) +
    (parseInt(match[2] || '0', 10) * 60) +
    parseInt(match[3] || '0', 10);
}

/**
 * Parse a YouTube URL by hostname (not substring), supporting
 * youtu.be/ID, /watch?v=ID, /shorts/ID, /live/ID, /embed/ID, /v/ID,
 * m.youtube.com and youtube-nocookie.com, plus t= / start= offsets.
 * Returns null for anything that is not a YouTube video URL.
 */
export function parseYouTubeUrl(raw: string): YouTubeVideo | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

  const host = url.hostname.toLowerCase();
  let id: string | undefined;

  if (host === 'youtu.be') {
    id = url.pathname.split('/')[1];
  } else if (YOUTUBE_HOSTS.has(host)) {
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] === 'watch') {
      id = url.searchParams.get('v') ?? undefined;
    } else if (['shorts', 'live', 'embed', 'v', 'e'].includes(parts[0])) {
      id = parts[1];
    }
  } else {
    return null;
  }

  if (!id || !VIDEO_ID_RE.test(id)) return null;

  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
  const start =
    parseYouTubeTime(url.searchParams.get('start')) ??
    parseYouTubeTime(url.searchParams.get('t')) ??
    parseYouTubeTime(hashParams.get('t'));

  return start ? { id, start } : { id };
}

export function getYouTubeEmbedUrl(video: YouTubeVideo): string {
  const base = `https://www.youtube.com/embed/${video.id}`;
  return video.start ? `${base}?start=${video.start}` : base;
}
