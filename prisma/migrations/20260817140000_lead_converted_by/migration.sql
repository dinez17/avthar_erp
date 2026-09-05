-- Record who converted a lead.
--
-- The lead already carries its owner (the assigned salesman), but the person who actually
-- turns it into a quotation may be someone else — a manager clearing a colleague's board,
-- say. Stamp that user, with a name snapshot beside the id like every other reference on
-- the lead, so the converted row reads as itself long after.

ALTER TABLE "leads" ADD COLUMN "convertedByUserId" UUID;
ALTER TABLE "leads" ADD COLUMN "convertedByName" TEXT;
