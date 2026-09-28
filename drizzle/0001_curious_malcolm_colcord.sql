CREATE TABLE "vat_alerts" (
	"percent" integer PRIMARY KEY NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"first_crossed_at" timestamp with time zone,
	"last_total_nok" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "licenses" ADD COLUMN "amount_total" integer;--> statement-breakpoint
ALTER TABLE "licenses" ADD COLUMN "currency" text;--> statement-breakpoint
ALTER TABLE "licenses" ADD COLUMN "paid_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "licenses_paid_at_idx" ON "licenses" USING btree ("paid_at");