CREATE TABLE "org_pending_owners" (
	"org_id" uuid NOT NULL,
	"email_hash" text NOT NULL,
	"session_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "org_pending_owners_org_id_email_hash_pk" PRIMARY KEY("org_id","email_hash")
);
--> statement-breakpoint
ALTER TABLE "licenses" ADD COLUMN "org_resolved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "org_pending_owners" ADD CONSTRAINT "org_pending_owners_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "org_pending_owners_email_idx" ON "org_pending_owners" USING btree ("email_hash");