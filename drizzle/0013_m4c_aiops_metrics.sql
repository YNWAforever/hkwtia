CREATE MATERIALIZED VIEW "aiops_monthly_metrics" AS (
  WITH settings AS (
    SELECT
      date_trunc('month', timezone('Asia/Hong_Kong', now()))::date
        AS current_month,
      now() AS refreshed_at
  ),
  months AS (
    SELECT
      generated.month_start::date AS month_start,
      generated.month_start::date = settings.current_month AS is_partial_month,
      generated.month_start::timestamp AT TIME ZONE 'Asia/Hong_Kong' AS month_from,
      (generated.month_start + interval '1 month')::timestamp
        AT TIME ZONE 'Asia/Hong_Kong' AS month_to,
      settings.refreshed_at
    FROM settings
    CROSS JOIN LATERAL generate_series(
      settings.current_month - interval '11 months',
      settings.current_month,
      interval '1 month'
    ) AS generated(month_start)
  ),
  month_conversations AS (
    SELECT months.month_start, months.month_to, conversations.id
    FROM months
    INNER JOIN conversations
      ON conversations.agent_kind = 'concierge'
     AND conversations.created_at >= months.month_from
     AND conversations.created_at < months.month_to
  ),
  latest_terminal AS (
    SELECT DISTINCT ON (month_conversations.month_start, agent_runs.conversation_id)
      month_conversations.month_start,
      agent_runs.conversation_id,
      agent_runs.status
    FROM month_conversations
    INNER JOIN agent_runs
      ON agent_runs.conversation_id = month_conversations.id
     AND agent_runs.agent = 'concierge'
     AND agent_runs.status IN ('completed', 'escalated', 'failed')
     AND agent_runs.completed_at IS NOT NULL
     AND agent_runs.completed_at < month_conversations.month_to
    ORDER BY month_conversations.month_start, agent_runs.conversation_id,
      agent_runs.completed_at DESC, agent_runs.created_at DESC,
      agent_runs.id DESC
  ),
  first_user AS (
    SELECT DISTINCT ON (month_conversations.month_start, messages.conversation_id)
      month_conversations.month_start,
      messages.conversation_id,
      messages.created_at,
      messages.id
    FROM month_conversations
    INNER JOIN messages ON messages.conversation_id = month_conversations.id
    WHERE messages.role = 'user'
    ORDER BY month_conversations.month_start, messages.conversation_id,
      messages.created_at, messages.id
  ),
  first_response AS (
    SELECT
      first_user.month_start,
      first_user.conversation_id,
      floor(extract(epoch FROM (
        min(messages.created_at) - first_user.created_at
      )) * 1000)::integer AS latency_ms
    FROM first_user
    INNER JOIN messages
      ON messages.conversation_id = first_user.conversation_id
     AND messages.role = 'assistant'
     AND messages.created_at >= first_user.created_at
    GROUP BY first_user.month_start, first_user.conversation_id,
      first_user.created_at
    HAVING min(messages.created_at) >= first_user.created_at
  ),
  conversation_aggregates AS (
    SELECT
      months.month_start,
      count(DISTINCT month_conversations.id)::integer AS conversation_count,
      count(DISTINCT latest_terminal.conversation_id)::integer
        AS terminal_conversation_count,
      count(DISTINCT latest_terminal.conversation_id)
        FILTER (WHERE latest_terminal.status = 'completed')::integer
        AS resolved_conversation_count,
      count(DISTINCT latest_terminal.conversation_id)
        FILTER (WHERE latest_terminal.status = 'escalated')::integer
        AS escalated_conversation_count,
      count(DISTINCT latest_terminal.conversation_id)
        FILTER (WHERE latest_terminal.status = 'failed')::integer
        AS failed_conversation_count
    FROM months
    LEFT JOIN month_conversations
      ON month_conversations.month_start = months.month_start
    LEFT JOIN latest_terminal
      ON latest_terminal.month_start = months.month_start
     AND latest_terminal.conversation_id = month_conversations.id
    GROUP BY months.month_start
  ),
  response_aggregates AS (
    SELECT
      months.month_start,
      percentile_disc(0.5) WITHIN GROUP (ORDER BY first_response.latency_ms)
        FILTER (WHERE first_response.latency_ms >= 0)::integer
        AS median_first_response_ms,
      count(first_response.latency_ms)
        FILTER (WHERE first_response.latency_ms >= 0)::integer
        AS first_response_sample_count
    FROM months
    LEFT JOIN first_response ON first_response.month_start = months.month_start
    GROUP BY months.month_start
  ),
  cost_aggregates AS (
    SELECT
      months.month_start,
      coalesce(sum(agent_runs.cost_usd), 0)::numeric(12, 6) AS llm_cost_usd
    FROM months
    LEFT JOIN agent_runs
      ON agent_runs.started_at >= months.month_from
     AND agent_runs.started_at < months.month_to
    GROUP BY months.month_start
  ),
  csat_aggregates AS (
    SELECT
      months.month_start,
      avg(agent_runs.csat_score)::numeric(4, 2) AS csat_average,
      count(agent_runs.csat_score)::integer AS csat_response_count
    FROM months
    LEFT JOIN agent_runs
      ON agent_runs.agent = 'concierge'
     AND agent_runs.status IN ('completed', 'escalated', 'failed')
     AND agent_runs.csat_score IS NOT NULL
     AND agent_runs.completed_at >= months.month_from
     AND agent_runs.completed_at < months.month_to
    GROUP BY months.month_start
  ),
  renewal_per_membership AS (
    SELECT
      months.month_start,
      engagement_events.metadata ->> 'membershipId' AS membership_id,
      bool_or(engagement_events.type = 'renewal_paid') AS paid,
      bool_or(
        jsonb_typeof(engagement_events.metadata -> 'renewalOrdinal') = 'number'
        AND engagement_events.metadata -> 'renewalOrdinal' = '1'::jsonb
      ) AS first_year_due,
      bool_or(
        engagement_events.type = 'renewal_paid'
        AND jsonb_typeof(engagement_events.metadata -> 'renewalOrdinal') = 'number'
        AND engagement_events.metadata -> 'renewalOrdinal' = '1'::jsonb
      ) AS first_year_paid
    FROM months
    INNER JOIN engagement_events
      ON engagement_events.occurred_at >= months.month_from
     AND engagement_events.occurred_at < months.month_to
     AND engagement_events.type IN ('renewal_paid', 'renewal_failed')
    INNER JOIN memberships
      ON memberships.id::text =
        engagement_events.metadata ->> 'membershipId'
    GROUP BY months.month_start,
      engagement_events.metadata ->> 'membershipId'
  ),
  renewal_aggregates AS (
    SELECT
      months.month_start,
      count(renewal_per_membership.membership_id)::integer
        AS renewal_due_count,
      count(renewal_per_membership.membership_id)
        FILTER (WHERE renewal_per_membership.paid)::integer
        AS renewal_paid_count,
      count(renewal_per_membership.membership_id)
        FILTER (WHERE renewal_per_membership.first_year_due)::integer
        AS first_year_renewal_due_count,
      count(renewal_per_membership.membership_id)
        FILTER (WHERE renewal_per_membership.first_year_paid)::integer
        AS first_year_renewal_paid_count
    FROM months
    LEFT JOIN renewal_per_membership
      ON renewal_per_membership.month_start = months.month_start
    GROUP BY months.month_start
  )
  SELECT
    months.month_start,
    months.is_partial_month,
    conversation_aggregates.conversation_count,
    conversation_aggregates.terminal_conversation_count,
    conversation_aggregates.resolved_conversation_count,
    conversation_aggregates.escalated_conversation_count,
    conversation_aggregates.failed_conversation_count,
    CASE WHEN conversation_aggregates.terminal_conversation_count = 0
      THEN NULL ELSE
      conversation_aggregates.resolved_conversation_count::numeric
        / conversation_aggregates.terminal_conversation_count END
      ::numeric(7, 6) AS agent_resolved_rate,
    CASE WHEN conversation_aggregates.terminal_conversation_count = 0
      THEN NULL ELSE
      conversation_aggregates.escalated_conversation_count::numeric
        / conversation_aggregates.terminal_conversation_count END
      ::numeric(7, 6) AS escalation_rate,
    CASE WHEN conversation_aggregates.terminal_conversation_count = 0
      THEN NULL ELSE
      conversation_aggregates.failed_conversation_count::numeric
        / conversation_aggregates.terminal_conversation_count END
      ::numeric(7, 6) AS failure_rate,
    response_aggregates.median_first_response_ms,
    response_aggregates.first_response_sample_count,
    csat_aggregates.csat_average,
    csat_aggregates.csat_response_count,
    (conversation_aggregates.resolved_conversation_count::numeric / 10)
      ::numeric(12, 2) AS staff_hours_saved,
    cost_aggregates.llm_cost_usd,
    renewal_aggregates.renewal_due_count,
    renewal_aggregates.renewal_paid_count,
    CASE WHEN renewal_aggregates.renewal_due_count = 0
      THEN NULL ELSE
      renewal_aggregates.renewal_paid_count::numeric
        / renewal_aggregates.renewal_due_count END
      ::numeric(7, 6) AS renewal_rate,
    renewal_aggregates.first_year_renewal_due_count,
    renewal_aggregates.first_year_renewal_paid_count,
    CASE WHEN renewal_aggregates.first_year_renewal_due_count = 0
      THEN NULL ELSE
      renewal_aggregates.first_year_renewal_paid_count::numeric
        / renewal_aggregates.first_year_renewal_due_count END
      ::numeric(7, 6) AS first_year_renewal_rate,
    months.refreshed_at
  FROM months
  INNER JOIN conversation_aggregates USING (month_start)
  INNER JOIN response_aggregates USING (month_start)
  INNER JOIN cost_aggregates USING (month_start)
  INNER JOIN csat_aggregates USING (month_start)
  INNER JOIN renewal_aggregates USING (month_start)
  ORDER BY months.month_start
);
CREATE UNIQUE INDEX "aiops_monthly_metrics_month_start_unique"
  ON "aiops_monthly_metrics" ("month_start");
