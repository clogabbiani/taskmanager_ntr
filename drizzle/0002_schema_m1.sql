ALTER TABLE "issues" DROP CONSTRAINT "issues_status_id_statuses_id_fk";
--> statement-breakpoint
DROP INDEX "comments_fts_idx";--> statement-breakpoint
DROP INDEX "issues_fts_idx";--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "search_vector" "tsvector" GENERATED ALWAYS AS (to_tsvector('italian'::regconfig, coalesce(body_text, ''))) STORED;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "search_vector" "tsvector" GENERATED ALWAYS AS (to_tsvector('italian'::regconfig, coalesce(title, '') || ' ' || coalesce(description_text, ''))) STORED;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_status_id_statuses_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."statuses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comments_search_idx" ON "comments" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "issues_search_idx" ON "issues" USING gin ("search_vector");