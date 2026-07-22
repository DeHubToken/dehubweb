import { createContext } from 'react';

/**
 * False while a page is rendered inside PersistentPageCache but is NOT the
 * active route. Those pages stay mounted (hidden) so their state survives
 * navigation, which means every page's <SEOHead> would otherwise be live at
 * once and react-helmet would resolve the title/canonical last-render-wins.
 * Consumers that write document-level metadata must no-op when this is false.
 *
 * Defaults to true so pages rendered outside the cache behave normally.
 */
export const CachedPageActiveContext = createContext(true);
