-- Simplify the lead pipeline to New → Follow-up → Converted → Not interested.
--
-- The first cut modelled a longer funnel (contacted, qualified, quoted, won, lost). In
-- practice the desk works a lead, converts it into a quotation, or drops it — so the stages
-- collapse to those four. CONVERTED is still reached only by the convert action, and
-- NOT_INTERESTED carries a reason like LOST did.
--
-- Existing rows are remapped rather than dropped: the old working stages fold into
-- FOLLOW_UP, anything already quoted or won becomes CONVERTED, and lost becomes
-- NOT_INTERESTED. The swap goes through a renamed old type so the column can be recast in
-- place.

ALTER TYPE "LeadStage" RENAME TO "LeadStage_old";

CREATE TYPE "LeadStage" AS ENUM ('NEW', 'FOLLOW_UP', 'CONVERTED', 'NOT_INTERESTED');

ALTER TABLE "leads" ALTER COLUMN "stage" DROP DEFAULT;

ALTER TABLE "leads"
  ALTER COLUMN "stage" TYPE "LeadStage"
  USING (
    CASE "stage"::text
      WHEN 'NEW'       THEN 'NEW'
      WHEN 'CONTACTED' THEN 'FOLLOW_UP'
      WHEN 'QUALIFIED' THEN 'FOLLOW_UP'
      WHEN 'QUOTED'    THEN 'CONVERTED'
      WHEN 'WON'       THEN 'CONVERTED'
      WHEN 'LOST'      THEN 'NOT_INTERESTED'
      ELSE 'NEW'
    END::"LeadStage"
  );

ALTER TABLE "leads" ALTER COLUMN "stage" SET DEFAULT 'NEW';

DROP TYPE "LeadStage_old";
