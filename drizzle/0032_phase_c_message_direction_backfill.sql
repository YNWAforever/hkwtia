-- Programme C-1 / D-12. Two derivations, both mirrored in TypeScript under
-- tests/fixtures/ and asserted by tests/unit/phase-c-schema-contract.test.ts,
-- because this runs once against a database no local gate has.
--
-- Note what is NOT here: nothing names 'staff'. `npm run db:migrate` runs every
-- pending file in ONE transaction, and PostgreSQL refuses to use an enum value
-- added by ALTER TYPE in the transaction that added it. 0031 adds it; the
-- application writes it later, in its own transaction.

-- direction: the role a message was written in decides which way it went.
UPDATE "messages"
SET "direction" = CASE WHEN "role" = 'user' THEN 'inbound'::"message_direction" ELSE 'outbound'::"message_direction" END;
--> statement-breakpoint

-- channel: a conversation is WhatsApp if ANY of its messages is, not merely if
-- its newest one is. The old latest-message derivation in lib/db/repos/inbox.ts
-- called a WhatsApp thread "web" as soon as a web reply landed on it.
UPDATE "conversations" c
SET "channel" = 'whatsapp'::"message_channel"
WHERE EXISTS (SELECT 1 FROM "messages" m WHERE m."conversation_id" = c."id" AND m."channel" = 'whatsapp');
--> statement-breakpoint

-- last_inbound_at: seed the window clock from the newest inbound WhatsApp
-- message so a thread already open when this deploys does not read as "never
-- messaged" and lock staff out of a window that is genuinely still open.
UPDATE "conversations" c
SET "last_inbound_at" = sub.newest
FROM (
  SELECT m."conversation_id" AS id, max(m."created_at") AS newest
  FROM "messages" m
  WHERE m."channel" = 'whatsapp' AND m."role" = 'user'
  GROUP BY m."conversation_id"
) sub
WHERE c."id" = sub.id;
