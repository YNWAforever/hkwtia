-- Read-only aggregate, compatible with audit-baseline schema51 and candidate56.
-- Does not expose identities, rewrite episode keys or delete history.
BEGIN READ ONLY;
SELECT current_setting('transaction_read_only') = 'on' AS read_only;
SELECT count(*) AS conflicting_renewal_episode_groups
FROM (
 SELECT membership_id, step,
   regexp_replace(instance_key,
     '^period:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}:',
     'period:') AS normalized_instance
 FROM journey_state
 WHERE journey = 'renewal' AND membership_id IS NOT NULL
 GROUP BY membership_id, step, normalized_instance
 HAVING count(*) > 1
) AS conflicts;
SELECT count(*) AS pending_refund_orders
FROM event_orders WHERE status::text = 'refund_pending';
ROLLBACK;
