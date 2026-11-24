BEGIN;

ALTER TABLE "users"
  ADD COLUMN "session_version" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "password_reset_digest" TEXT,
  ADD COLUMN "password_reset_expires_at" TIMESTAMPTZ(3),
  ADD CONSTRAINT "users_password_reset_pair_check"
    CHECK (("password_reset_digest" IS NULL) = ("password_reset_expires_at" IS NULL));

CREATE UNIQUE INDEX "users_password_reset_digest_key" ON "users"("password_reset_digest");

COMMIT;
