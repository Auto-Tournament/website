CREATE TABLE "license_checkin_days" (
	"license_id" text NOT NULL,
	"instance_id" uuid NOT NULL,
	"day" text NOT NULL,
	"matches" integer DEFAULT 0 NOT NULL,
	"tournaments" integer DEFAULT 0 NOT NULL,
	"max_teams" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "license_checkin_days_license_id_instance_id_day_pk" PRIMARY KEY("license_id","instance_id","day")
);
--> statement-breakpoint
CREATE TABLE "license_checkins" (
	"license_id" text NOT NULL,
	"instance_id" uuid NOT NULL,
	"first_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"server_count" integer NOT NULL,
	"platform_version" text NOT NULL,
	"declared" text DEFAULT 'none' NOT NULL,
	CONSTRAINT "license_checkins_license_id_instance_id_pk" PRIMARY KEY("license_id","instance_id")
);
--> statement-breakpoint
CREATE TABLE "license_usage_alerts" (
	"license_id" text PRIMARY KEY NOT NULL,
	"last_emailed_day" text NOT NULL,
	"reason" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "license_checkin_days_day_idx" ON "license_checkin_days" USING btree ("day");--> statement-breakpoint
CREATE INDEX "license_checkins_last_seen_idx" ON "license_checkins" USING btree ("last_seen");