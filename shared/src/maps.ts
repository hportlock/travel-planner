/**
 * Google Maps URL normalization.
 *
 * The `https://www.google.com/maps/place/?q=place_id:<ID>` form resolves in
 * desktop web Maps but NOT in the mobile Google Maps app (it opens the app,
 * which then can't find the place). The documented cross-platform form is the
 * Maps URLs API: https://developers.google.com/maps/documentation/urls/get-started
 *   https://www.google.com/maps/search/?api=1&query=<encoded>&query_place_id=<ID>
 * where `query` is required and `query_place_id` takes precedence where supported.
 *
 * NOTE: migrations/003_fix_gmap_urls.ts inlines a copy of this rewrite
 * (migrations can't depend on shared being built) — keep them in sync.
 */

const BROKEN_PLACE_ID_URL = /^https:\/\/(?:www\.)?google\.com\/maps\/place\/\?q=place_id:([A-Za-z0-9_-]+)\/?$/;

/**
 * Rewrite a mobile-broken `maps/place/?q=place_id:` URL to the Maps URLs API
 * form, using `fallbackQuery` (typically the place name or address) as the
 * required `query` parameter. Any other URL passes through unchanged, so the
 * function is idempotent.
 */
export function normalizeGmapUrl(url: string | null | undefined, fallbackQuery: string): string {
  if (!url) return '';
  const m = url.match(BROKEN_PLACE_ID_URL);
  const query = fallbackQuery.trim();
  if (!m || !query) return url;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}&query_place_id=${m[1]}`;
}
