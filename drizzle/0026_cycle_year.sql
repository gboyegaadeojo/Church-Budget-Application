-- A budget cycle is the budget year; Closed now means the year has ended and its spending
-- is locked (docs/decisions.md 2026-10-18). A cycle closed only for submissions is still
-- being spent, so it is Open; a locked one is Closed.
UPDATE "budget_cycles" SET "status" = 'open' WHERE "status" = 'closed' AND "spending_locked_at" IS NULL;--> statement-breakpoint
UPDATE "budget_cycles" SET "status" = 'closed' WHERE "spending_locked_at" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "budget_cycles" ADD CONSTRAINT "budget_cycles_closed_is_locked" CHECK (("budget_cycles"."status" = 'closed') = ("budget_cycles"."spending_locked_at" is not null));
