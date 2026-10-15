-- The church time zone setting (CLAUDE.md "Time zone"). The church is in Winnipeg.
-- The administrator can change it in Admin → Settings; src/domain/settings has the same default.
INSERT INTO app_settings (key, value) VALUES ('church_timezone', 'America/Winnipeg')
ON CONFLICT (key) DO NOTHING;
