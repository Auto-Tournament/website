CREATE TABLE "admin_notes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"author_user_id" text,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "free_lan_confirmations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event" text NOT NULL,
	"organizer" text NOT NULL,
	"dates" text,
	"servers" text,
	"confirmed_on" text NOT NULL,
	"note" text,
	"lead_id" uuid,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"organization" text,
	"topic" text NOT NULL,
	"servers" text,
	"event_dates" text,
	"message" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manual_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" text NOT NULL,
	"licensee" text NOT NULL,
	"org_id" uuid,
	"email_hash" text,
	"product" text NOT NULL,
	"pack" text NOT NULL,
	"max_servers" integer NOT NULL,
	"kind" text NOT NULL,
	"start_day" text,
	"end_day" text,
	"amount_total" integer NOT NULL,
	"currency" text NOT NULL,
	"payment_ref" text,
	"license_id" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "licenses" ADD COLUMN "source" text DEFAULT 'stripe' NOT NULL;--> statement-breakpoint
ALTER TABLE "licenses" ADD COLUMN "payment_ref" text;--> statement-breakpoint
ALTER TABLE "licenses" ADD COLUMN "supersedes" text;--> statement-breakpoint
ALTER TABLE "licenses" ADD COLUMN "superseded_by" text;--> statement-breakpoint
ALTER TABLE "licenses" ADD COLUMN "revoked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "licenses" ADD COLUMN "revoke_reason" text;--> statement-breakpoint
ALTER TABLE "free_lan_confirmations" ADD CONSTRAINT "free_lan_confirmations_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_orders" ADD CONSTRAINT "manual_orders_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_notes_target_idx" ON "admin_notes" USING btree ("target_type","target_id","created_at");--> statement-breakpoint
CREATE INDEX "leads_status_idx" ON "leads" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "leads_updated_idx" ON "leads" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "manual_orders_status_idx" ON "manual_orders" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "audit_action_idx" ON "audit_log" USING btree ("action","at");