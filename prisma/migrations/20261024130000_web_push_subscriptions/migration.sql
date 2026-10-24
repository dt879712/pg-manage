CREATE TABLE "web_push_subscriptions" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tenantId" TEXT,
  "endpoint" TEXT NOT NULL,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "web_push_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "web_push_subscriptions_endpoint_key"
  ON "web_push_subscriptions"("endpoint");
CREATE INDEX "web_push_subscriptions_userId_idx"
  ON "web_push_subscriptions"("userId");
CREATE INDEX "web_push_subscriptions_tenantId_idx"
  ON "web_push_subscriptions"("tenantId");

ALTER TABLE "web_push_subscriptions"
  ADD CONSTRAINT "web_push_subscriptions_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "web_push_subscriptions"
  ADD CONSTRAINT "web_push_subscriptions_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
