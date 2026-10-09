import YouTube from 'react-youtube';

interface YouTubeEmbedProps {
  videoId: string;
  autoplay?: boolean;
  className?: string;
}

/**
 * Extracts YouTube video ID from various URL formats:
 * - youtube.com/watch?v=VIDEO_ID
 * - youtu.be/VIDEO_ID
 * - youtube.com/embed/VIDEO_ID
 */
export function extractYouTubeId(url: string): string | null {
  const trimmed = url.trim();

  // youtu.be/VIDEO_ID
  if (trimmed.includes('youtu.be/')) {
    const match = trimmed.match(/youtu\.be\/([^?&]+)/);
    return match ? match[1] : null;
  }

  // youtube.com/watch?v=VIDEO_ID
  if (trimmed.includes('youtube.com/watch?v=')) {
    const match = trimmed.match(/[?&]v=([^&]+)/);
    return match ? match[1] : null;
  }

  // youtube.com/embed/VIDEO_ID
  if (trimmed.includes('youtube.com/embed/')) {
    const match = trimmed.match(/embed\/([^?&]+)/);
    return match ? match[1] : null;
  }

  // Assume it's already a video ID if no URL pattern matches
  return trimmed || null;
}

export function YouTubeEmbed({ videoId, autoplay = false, className }: YouTubeEmbedProps) {
  const opts = {
    width: '100%',
    height: '100%',
    playerVars: {
      autoplay: autoplay ? 1 : 0,
      modestbranding: 1,
      rel: 0,
      origin: typeof window !== 'undefined' ? window.location.origin : undefined,
    },
  };

  return <YouTube videoId={videoId} opts={opts} className={className} iframeClassName={className} />;
}
