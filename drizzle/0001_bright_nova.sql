CREATE TABLE "stripe_events" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "panels" ALTER COLUMN "url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "panels" ADD COLUMN "stripe_checkout_session_id" text;--> statement-breakpoint
ALTER TABLE "panels" ADD CONSTRAINT "panels_stripe_checkout_session_id_unique" UNIQUE("stripe_checkout_session_id");