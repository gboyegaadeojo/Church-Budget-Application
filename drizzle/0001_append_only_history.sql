-- Financial history and the audit log are append-only (FR-22, CLAUDE.md constraint 6).
-- Rows can be inserted but never changed or removed, whichever database role connects.
CREATE FUNCTION forbid_history_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is not allowed', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER audit_events_append_only BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION forbid_history_change();
--> statement-breakpoint
CREATE TRIGGER audit_events_no_truncate BEFORE TRUNCATE ON audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_history_change();
--> statement-breakpoint
CREATE TRIGGER request_revisions_append_only BEFORE UPDATE OR DELETE ON request_revisions
  FOR EACH ROW EXECUTE FUNCTION forbid_history_change();
--> statement-breakpoint
CREATE TRIGGER request_revisions_no_truncate BEFORE TRUNCATE ON request_revisions
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_history_change();
--> statement-breakpoint
CREATE TRIGGER approval_decisions_append_only BEFORE DELETE ON approval_decisions
  FOR EACH ROW EXECUTE FUNCTION forbid_history_change();
--> statement-breakpoint
CREATE TRIGGER approval_decisions_no_truncate BEFORE TRUNCATE ON approval_decisions
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_history_change();
--> statement-breakpoint
-- A held decision (FR-19a) gets its release time later; nothing else on it may change.
CREATE FUNCTION approval_decisions_only_release() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.released_at IS NULL AND NEW.released_at IS NOT NULL
     AND (to_jsonb(NEW) - 'released_at') = (to_jsonb(OLD) - 'released_at') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'approval_decisions is append-only: only setting released_at once is allowed'
    USING ERRCODE = 'restrict_violation';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER approval_decisions_release_only BEFORE UPDATE ON approval_decisions
  FOR EACH ROW EXECUTE FUNCTION approval_decisions_only_release();
--> statement-breakpoint
CREATE TRIGGER approved_line_items_append_only BEFORE UPDATE OR DELETE ON approved_line_items
  FOR EACH ROW EXECUTE FUNCTION forbid_history_change();
--> statement-breakpoint
CREATE TRIGGER approved_line_items_no_truncate BEFORE TRUNCATE ON approved_line_items
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_history_change();
--> statement-breakpoint
CREATE TRIGGER approval_adjustments_append_only BEFORE UPDATE OR DELETE ON approval_adjustments
  FOR EACH ROW EXECUTE FUNCTION forbid_history_change();
--> statement-breakpoint
CREATE TRIGGER approval_adjustments_no_truncate BEFORE TRUNCATE ON approval_adjustments
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_history_change();
--> statement-breakpoint
-- Defaults from Requirements 9.6 and 20.2.
INSERT INTO app_settings (key, value) VALUES
  ('sales_tax_rate', '0.1200'),
  ('near_limit_threshold', '0.80'),
  ('backup_escalation_days', '3'),
  ('weekly_audit_summary', 'false'),
  ('church_name', 'Immanuel Fellowship Church'),
  ('app_name', 'Church Budget');
