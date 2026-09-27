-- Seed default alert rules (separate transaction so new enum values are usable).

INSERT INTO notification_alert_rules (
  code, category, name, description, enabled, priority, cooldown_minutes, ttl_hours,
  min_severity, eligible_channels, conditions, template_key
) VALUES
(
  'traffic_significant',
  'traffic',
  'Significant traffic',
  'Notify for heavy / standstill / blocked traffic near saved places.',
  TRUE,
  'important',
  30,
  12,
  'heavy',
  ARRAY['in_app','push'],
  '{"severities":["heavy","standstill","blocked"]}'::jsonb,
  'traffic.alert'
),
(
  'road_closure_hazard',
  'road_alerts',
  'Road hazard / closure',
  'Notify for caution+ local safety alerts near saved places.',
  TRUE,
  'urgent',
  30,
  24,
  'caution',
  ARRAY['in_app','push'],
  '{"severities":["caution","urgent","critical"]}'::jsonb,
  'road.hazard'
),
(
  'fuel_price_change',
  'fuel',
  'Fuel price change',
  'Notify when a meaningful fuel observation is recorded near a saved area.',
  TRUE,
  'normal',
  60,
  24,
  NULL,
  ARRAY['in_app'],
  '{"min_change_percent":2}'::jsonb,
  'fuel.price'
),
(
  'commodity_threshold',
  'prices',
  'Commodity price threshold',
  'Notify when a subscribed commodity crosses a user threshold.',
  TRUE,
  'normal',
  120,
  72,
  NULL,
  ARRAY['in_app'],
  '{}'::jsonb,
  'commodity.price'
),
(
  'fx_threshold',
  'fx',
  'FX rate threshold',
  'Notify when a subscribed FX pair crosses a user threshold.',
  TRUE,
  'important',
  60,
  24,
  NULL,
  ARRAY['in_app','push'],
  '{}'::jsonb,
  'fx.rate'
),
(
  'official_important',
  'official',
  'Important official update',
  'Notify for important/urgent/critical official updates affecting subscribed locations.',
  TRUE,
  'important',
  0,
  168,
  NULL,
  ARRAY['in_app','push'],
  '{"priorities":["important","urgent","critical"]}'::jsonb,
  'official.update'
),
(
  'system_emergency',
  'system',
  'Emergency public alert',
  'Admin-authorized emergency broadcast to eligible users. Use sparingly.',
  TRUE,
  'critical',
  0,
  48,
  NULL,
  ARRAY['in_app','push'],
  '{"requires_confirmation":true}'::jsonb,
  'system.emergency'
)
ON CONFLICT (code) DO NOTHING;
