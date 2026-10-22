import { useState, type CSSProperties } from 'react';
import { imageSrc } from '../lib/images';

/**
 * An image in a box sized before the bytes arrive. width and height are the
 * true pixel dimensions from the generated data, so the ratio is right and
 * nothing shifts when the picture lands. Fades in on load; eager for the LCP.
 */
export function Picture({ src, alt, width, height, eager = false, className = '', fit = 'cover', sizes, style, onClick }: {
  src: string; alt: string; width: number; height: number; eager?: boolean; className?: string; fit?: 'cover' | 'contain'; sizes?: string; style?: CSSProperties; onClick?: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className={`frame ${fit === 'contain' ? 'contain' : ''} ${className}`} style={{ aspectRatio: `${width} / ${height}`, ...style }} onClick={onClick}>
      <img
        src={imageSrc(src)}
        alt={alt}
        width={width}
        height={height}
        loading={eager ? 'eager' : 'lazy'}
        decoding={eager ? 'sync' : 'async'}
        {...(eager ? ({ fetchpriority: 'high' } as object) : {})}
        sizes={sizes}
        onLoad={() => setLoaded(true)}
        className={`pic ${loaded ? 'loaded' : ''}`}
      />
    </div>
  );
}
