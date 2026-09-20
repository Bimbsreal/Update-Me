-- Register NGN-capable external market provider; keep Frankfurter optional/off.

INSERT INTO fx_sources (id, display_name, provider_key, rate_type, is_active, website_url, notes)
VALUES (
  'open_er_api',
  'External market data provider',
  'open_er_api',
  'market_indicative',
  TRUE,
  'https://www.exchangerate-api.com/docs/free',
  'Indicative market rates via Open Exchange Rate API (and dated CDN snapshots for history). Not a CBN official rate.'
)
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  provider_key = EXCLUDED.provider_key,
  rate_type = EXCLUDED.rate_type,
  is_active = EXCLUDED.is_active,
  website_url = EXCLUDED.website_url,
  notes = EXCLUDED.notes,
  updated_at = NOW();

UPDATE fx_sources
SET is_active = FALSE,
    notes = 'Optional ECB-derived provider. Disabled by default because NGN coverage is unreliable.',
    updated_at = NOW()
WHERE id = 'frankfurter';
