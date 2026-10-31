-- Persist tenant location and currency configuration.
ALTER TABLE "Gym"
  ADD COLUMN "postalCode" VARCHAR(24),
  ADD COLUMN "currency" VARCHAR(3) NOT NULL DEFAULT 'USD';
