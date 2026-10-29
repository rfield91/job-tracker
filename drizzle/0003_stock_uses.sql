CREATE TABLE "stock_uses" (
	"id" serial PRIMARY KEY NOT NULL,
	"purchase_line_id" integer NOT NULL,
	"job_id" integer NOT NULL,
	"quantity_hundredths" integer NOT NULL,
	"used_on" date NOT NULL,
	"job_line_id" integer
);
--> statement-breakpoint
ALTER TABLE "stock_uses" ADD CONSTRAINT "stock_uses_purchase_line_id_purchase_lines_id_fk" FOREIGN KEY ("purchase_line_id") REFERENCES "public"."purchase_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_uses" ADD CONSTRAINT "stock_uses_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_uses" ADD CONSTRAINT "stock_uses_job_line_id_job_lines_id_fk" FOREIGN KEY ("job_line_id") REFERENCES "public"."job_lines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_uses_line_idx" ON "stock_uses" USING btree ("purchase_line_id");--> statement-breakpoint
CREATE INDEX "stock_uses_job_idx" ON "stock_uses" USING btree ("job_id");--> statement-breakpoint
-- Stock used to be taken by splitting the purchase line. Merge each taken
-- piece back into its stock line (or turn it back into one) and record the
-- use, so purchases show the lines as entered.
DO $$
DECLARE
  u record;
  base_id integer;
BEGIN
  FOR u IN SELECT * FROM purchase_lines WHERE used_on IS NOT NULL ORDER BY id LOOP
    SELECT b.id INTO base_id FROM purchase_lines b
      WHERE b.purchase_id = u.purchase_id AND b.stock AND b.id <> u.id
        AND b.description IS NOT DISTINCT FROM u.description
        AND b.part_number IS NOT DISTINCT FROM u.part_number
      ORDER BY b.id LIMIT 1;
    IF u.job_id IS NOT NULL THEN
      INSERT INTO stock_uses (purchase_line_id, job_id, quantity_hundredths, used_on, job_line_id)
      VALUES (coalesce(base_id, u.id), u.job_id, u.quantity_hundredths, u.used_on,
        (SELECT jl.id FROM job_lines jl WHERE jl.purchase_line_id = u.id ORDER BY jl.id LIMIT 1));
    END IF;
    UPDATE job_lines SET purchase_line_id = NULL WHERE purchase_line_id = u.id;
    IF base_id IS NULL THEN
      UPDATE purchase_lines SET stock = true, job_id = NULL, used_on = NULL WHERE id = u.id;
    ELSE
      UPDATE purchase_lines SET quantity_hundredths = quantity_hundredths + u.quantity_hundredths,
        amount_cents = amount_cents + u.amount_cents WHERE id = base_id;
      DELETE FROM purchase_lines WHERE id = u.id;
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint
ALTER TABLE "purchase_lines" DROP COLUMN "used_on";