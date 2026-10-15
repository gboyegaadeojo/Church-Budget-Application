-- Sign-in and Planning Center defaults (FR-01a, DRD 6.1a). The administrator changes them
-- in Admin → Settings; src/domain/settings holds the same defaults.
INSERT INTO app_settings (key, value) VALUES
  ('pco_leader_field_name', 'Ministry Leader'),
  ('pco_leader_accepted_values', '["Yes"]'),
  ('pco_require_for_requesters', 'true'),
  ('pco_require_for_staff', 'false'),
  ('signin_google_enabled', 'true'),
  ('signin_planning_center_enabled', 'true'),
  ('admin_contact_email', '')
ON CONFLICT (key) DO NOTHING;
