import posthog from 'posthog-js';

/** PostHog, the same project the previous site reported to. No key, no
 *  analytics: previews and local runs skip cleanly. Pageviews are captured
 *  by hand because an SPA route change never fires the automatic one. */
const KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const HOST = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ?? 'https://us.i.posthog.com';
let ready = false;

export function initAnalytics() {
  if (!KEY || ready) return;
  posthog.init(KEY, { api_host: HOST, capture_pageview: false, capture_pageleave: true, persistence: 'localStorage+cookie' });
  ready = true;
}

export function capture(event: string, props?: Record<string, unknown>) {
  if (!KEY) return;
  posthog.capture(event, props);
}
