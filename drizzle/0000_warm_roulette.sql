CREATE TABLE "buildings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"rank" integer,
	"unlocked_at_amount" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "panels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"amount" integer DEFAULT 0 NOT NULL,
	"url" text NOT NULL,
	"title" text,
	"favicon_url" text,
	"dominant_color" text,
	"description" text,
	"category" text,
	"position_x" real,
	"position_y" real,
	"size" real,
	"building_id" uuid,
	"slot_index" integer,
	"owner_email" text,
	"notify_on_outgrown" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "panels" ADD CONSTRAINT "panels_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "panels_amount_idx" ON "panels" USING btree ("amount");--> statement-breakpoint
CREATE INDEX "panels_category_idx" ON "panels" USING btree ("category");--> statement-breakpoint
CREATE INDEX "panels_building_id_idx" ON "panels" USING btree ("building_id");