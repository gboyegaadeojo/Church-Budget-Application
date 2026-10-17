-- FR-49 as changed by the church (2026-10-16): an approver who hasn't decided within
-- 5 days is reminded every day. Replaces the weekly 7-day Board Chair reminder.
INSERT INTO app_settings (key, value) VALUES ('approval_reminder_days', '5')
ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint
DELETE FROM app_settings WHERE key = 'board_reminder_days';
