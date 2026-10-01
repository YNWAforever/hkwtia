-- Separate a compensating refund intent from a provider-confirmed refund.
-- Additive only; no historical order or grant mutation.
ALTER TYPE "event_order_status" ADD VALUE IF NOT EXISTS 'refund_pending';
