-- Every login account (student, parent, staff, owner) must have its own unique
-- mobile number so that a number resolves to exactly one account at sign-in.
-- NULL/empty phones are excluded from the constraint.
CREATE UNIQUE INDEX "users_phone_key" ON "users" ("phone") WHERE "phone" IS NOT NULL;
