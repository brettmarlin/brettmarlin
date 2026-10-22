/** Where the site finds its Worker. Empty means same origin (the dev proxy,
 *  or a production route on the site's own domain). */
export const API_BASE: string = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') ?? '';

/** The remote image origin the generated bundle points at. In dev, with
 *  VITE_LOCAL_IMAGES=1, these are answered by the Vite shim instead. */
export const IMAGE_ORIGIN = 'https://marliin-recipient-worker.brett-6a3.workers.dev';
export const LOCAL_IMAGES = import.meta.env.DEV && import.meta.env.VITE_LOCAL_IMAGES === '1';

export const SITE = {
  name: 'Brett Marlin',
  url: 'https://www.brettmarlin.xyz',
  email: 'brett@brettmarlin.com',
  linkedin: 'https://www.linkedin.com/in/brettmarlin',
  x: 'https://x.com/brettmarlin',
  substack: 'https://brettmarlin.substack.com',
  marliin: 'https://www.marliin.com',
  github: 'https://github.com/brettmarlin',
  location: 'San Francisco',
};

export const SESSION_KEYS = {
  recipientPassword: (slug: string) => `bm-recipient:${slug}`,
  studyPassword: (slug: string) => `bm-study:${slug}`,
  adminToken: 'bm-admin-token',
};
