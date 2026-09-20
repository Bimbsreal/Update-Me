'use client';

import { GlobalSearch } from '@/components/search/GlobalSearch';

/**
 * Explore-page search entry — delegates to GlobalSearch.
 * Location picks update the explore map context; other entities navigate away.
 */
export function ExploreSearch({ onPickLocation, onSubmitQuery, locationId, initialQuery }) {
  return (
    <GlobalSearch
      locationId={locationId}
      initialQuery={initialQuery || ''}
      placeholder="Lekki, Ajah, fuel, traffic, rice…"
      onNavigate={(href) => {
        try {
          const url = new URL(href, 'http://localhost');
          if (url.pathname === '/explore') {
            const loc = url.searchParams.get('locationId');
            const term = url.searchParams.get('q');
            if (loc && onPickLocation) {
              onPickLocation({ id: loc, title: term || 'Area', href });
              return;
            }
            if (term && onSubmitQuery) {
              onSubmitQuery(term);
            }
          }
        } catch {
          /* fall through to GlobalSearch router.push */
        }
      }}
    />
  );
}
