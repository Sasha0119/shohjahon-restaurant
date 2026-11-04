-- Stock toggle ordering (additive; existing rows start at 0).
-- Bumped atomically on every stock change, so clients can tell which of two
-- updates is the newer one, whatever order the network delivers them in.
ALTER TABLE "menu_items" ADD COLUMN "stock_version" INTEGER NOT NULL DEFAULT 0;
