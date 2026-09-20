-- Correct typo fixture_nmadra → fixture_nmdpra (NMDPRA agency id)

INSERT INTO official_sources (
  id, organization_name, short_name, agency_type, jurisdiction_level,
  official_website, feed_url, ingestion_method, provider_key,
  status, verification_status, sync_interval_minutes, config, notes,
  verified_at, health_status, last_success_at, last_failure_at,
  last_attempt_at, last_error_message, consecutive_failures
)
SELECT
  'fixture_nmdpra',
  organization_name,
  short_name,
  agency_type,
  jurisdiction_level,
  official_website,
  feed_url,
  ingestion_method,
  provider_key,
  status,
  verification_status,
  sync_interval_minutes,
  config,
  notes,
  verified_at,
  health_status,
  last_success_at,
  last_failure_at,
  last_attempt_at,
  last_error_message,
  consecutive_failures
FROM official_sources
WHERE id = 'fixture_nmadra'
ON CONFLICT (id) DO NOTHING;

UPDATE official_updates
SET source_id = 'fixture_nmdpra'
WHERE source_id = 'fixture_nmadra'
  AND EXISTS (SELECT 1 FROM official_sources WHERE id = 'fixture_nmdpra');

UPDATE official_sync_runs
SET source_id = 'fixture_nmdpra'
WHERE source_id = 'fixture_nmadra'
  AND EXISTS (SELECT 1 FROM official_sources WHERE id = 'fixture_nmdpra');

DELETE FROM official_sources WHERE id = 'fixture_nmadra';
