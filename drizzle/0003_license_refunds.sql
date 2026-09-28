ALTER TABLE "licenses" ADD COLUMN "payment_intent" text;--> statement-breakpoint
ALTER TABLE "licenses" ADD COLUMN "refunded_amount" integer;--> statement-breakpoint
ALTER TABLE "licenses" ADD COLUMN "refunded_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "licenses_payment_intent_idx" ON "licenses" USING btree ("payment_intent");