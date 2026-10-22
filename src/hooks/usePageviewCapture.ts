import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { capture } from '../lib/analytics';

/** One $pageview per location, on every route, the recipient spaces
 *  included. The hash is not a dependency: an anchor jump is not a view. */
export function usePageviewCapture() {
  const { pathname, search } = useLocation();
  useEffect(() => { capture('$pageview'); }, [pathname, search]);
}
