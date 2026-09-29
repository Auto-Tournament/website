ALTER TABLE "invites" ADD COLUMN "access_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "expires_at" timestamp with time zone;