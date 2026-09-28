CREATE TABLE "refund_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"license_id" text NOT NULL,
	"admin_user_id" text NOT NULL,
	"amount" integer NOT NULL,
	"currency" text NOT NULL,
	"reason" text NOT NULL,
	"note" text,
	"notify_buyer" boolean DEFAULT false NOT NULL,
	"send_to" text,
	"refunded_on" text,
	"reference" text,
	"token_hash" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"confirmed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"stripe_refund_id" text,
	CONSTRAINT "refund_requests_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_admin_user_id_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "refund_requests_license_idx" ON "refund_requests" USING btree ("license_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "refund_requests_one_pending" ON "refund_requests" USING btree ("license_id") WHERE "refund_requests"."status" in ('pending', 'confirming');