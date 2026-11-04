-- Menu texts in other languages (additive; existing rows get an empty object).
-- The plain name/description columns keep holding the default language.
ALTER TABLE "categories" ADD COLUMN "translations" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "menu_items" ADD COLUMN "translations" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "modifier_groups" ADD COLUMN "translations" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "modifier_options" ADD COLUMN "translations" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "combo_deals" ADD COLUMN "translations" JSONB NOT NULL DEFAULT '{}';
