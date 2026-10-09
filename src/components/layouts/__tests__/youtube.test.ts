import { describe, it, expect } from 'vitest';
import { parseYouTubeUrl, getYouTubeEmbedUrl, parseYouTubeTime } from '../youtube';

const ID = 'dQw4w9WgXcQ';

describe('parseYouTubeUrl', () => {
  it.each([
    `https://www.youtube.com/watch?v=${ID}`,
    `https://youtube.com/watch?feature=share&v=${ID}`,
    `https://m.youtube.com/watch?v=${ID}`,
    `https://youtu.be/${ID}`,
    `https://youtu.be/${ID}?si=abc`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/live/${ID}?feature=share`,
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube-nocookie.com/embed/${ID}`,
  ])('parses %s', (url) => {
    expect(parseYouTubeUrl(url)?.id).toBe(ID);
  });

  it('extracts start time from t= and start=', () => {
    expect(parseYouTubeUrl(`https://youtu.be/${ID}?t=90`)).toEqual({ id: ID, start: 90 });
    expect(parseYouTubeUrl(`https://www.youtube.com/watch?v=${ID}&t=1m30s`)).toEqual({ id: ID, start: 90 });
    expect(parseYouTubeUrl(`https://www.youtube.com/embed/${ID}?start=42`)).toEqual({ id: ID, start: 42 });
  });

  it('rejects spoofed hosts and non-video URLs', () => {
    expect(parseYouTubeUrl(`https://evil.com/youtube.com/watch?v=${ID}`)).toBeNull();
    expect(parseYouTubeUrl(`https://youtube.com.evil.com/watch?v=${ID}`)).toBeNull();
    expect(parseYouTubeUrl(`https://evil.com/?q=youtu.be/${ID}`)).toBeNull();
    expect(parseYouTubeUrl(`javascript:alert(1)//youtube.com`)).toBeNull();
    expect(parseYouTubeUrl('https://www.youtube.com/')).toBeNull();
    expect(parseYouTubeUrl('https://www.youtube.com/watch?v=bad"id')).toBeNull();
    expect(parseYouTubeUrl('video.mp4')).toBeNull();
  });

  it('builds embed URLs', () => {
    expect(getYouTubeEmbedUrl({ id: ID })).toBe(`https://www.youtube.com/embed/${ID}`);
    expect(getYouTubeEmbedUrl({ id: ID, start: 5 })).toBe(`https://www.youtube.com/embed/${ID}?start=5`);
  });

  it('parses time formats', () => {
    expect(parseYouTubeTime('1h2m3s')).toBe(3723);
    expect(parseYouTubeTime('45s')).toBe(45);
    expect(parseYouTubeTime('abc')).toBeUndefined();
  });
});
