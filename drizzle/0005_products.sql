CREATE TABLE "product_parts" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"stock_key" text NOT NULL,
	"label" text NOT NULL,
	"quantity_hundredths" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"price_cents" integer NOT NULL,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "job_lines" ADD COLUMN "product_id" integer;--> statement-breakpoint
ALTER TABLE "product_parts" ADD CONSTRAINT "product_parts_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_parts_product_idx" ON "product_parts" USING btree ("product_id");--> statement-breakpoint
ALTER TABLE "job_lines" ADD CONSTRAINT "job_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;