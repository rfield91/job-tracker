ALTER TABLE "purchase_lines" ADD COLUMN "part_number" text;--> statement-breakpoint
ALTER TABLE "purchase_lines" ADD COLUMN "quantity_hundredths" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_lines" ADD COLUMN "stock" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_lines" ADD COLUMN "used_on" date;