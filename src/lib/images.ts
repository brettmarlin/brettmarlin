import { IMAGE_ORIGIN, LOCAL_IMAGES } from './config';

/** Rewrites a remote image URL to the dev shim when local images are on. */
export function imageSrc(src: string): string {
  if (LOCAL_IMAGES && src.startsWith(`${IMAGE_ORIGIN}/images/`)) {
    return src.replace(`${IMAGE_ORIGIN}/images/`, '/__local-images/');
  }
  return src;
}
