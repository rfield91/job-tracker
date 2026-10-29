ALTER TABLE "stock_uses" ALTER COLUMN "job_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_uses" ADD COLUMN "category_id" integer;--> statement-breakpoint
ALTER TABLE "stock_uses" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "stock_uses" ADD CONSTRAINT "stock_uses_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_uses" ADD CONSTRAINT "stock_uses_job_or_category" CHECK (("stock_uses"."job_id" is null) <> ("stock_uses"."category_id" is null));--> statement-breakpoint
-- Existing databases get the new default category; new ones are seeded with it.
INSERT INTO "categories" ("name", "schedule_line", "sort_order")
SELECT 'Prototypes and R&D', '27a', max("sort_order") + 1 FROM "categories"
HAVING count(*) > 0 AND NOT bool_or(lower("name") = lower('Prototypes and R&D'));
