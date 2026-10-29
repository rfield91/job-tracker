ALTER TABLE "job_lines" ADD COLUMN "est_cost_cents" integer;--> statement-breakpoint
ALTER TABLE "job_lines" ADD COLUMN "part_number" text;--> statement-breakpoint
ALTER TABLE "job_lines" ADD COLUMN "quantity_hundredths" integer;