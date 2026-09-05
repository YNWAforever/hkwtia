"use client";

import {useState} from "react";

import {siteConfig} from "@/config/site";

export const CONTACT_TOPICS = ["portal", "membership", "events", "programmes", "partnership", "privacy", "media"] as const;
export type ContactTopic = (typeof CONTACT_TOPICS)[number];

export type PreparedEmailFormLabels = Readonly<{
  topicLabel: string;
  composeAction: string;
  topics: Readonly<Record<ContactTopic, string>>;
  subjects: Readonly<Record<ContactTopic, string>>;
  bodies: Readonly<Record<ContactTopic, string>>;
}>;

function isContactTopic(value: string): value is ContactTopic {
  return (CONTACT_TOPICS as readonly string[]).includes(value);
}

/**
 * D-6, matching the newsletter's own mailto pattern (components/layout/footer-newsletter.tsx):
 * no persistence, no server action. Deliberately no <form> element -- the compose action is a
 * plain link whose href is recomputed on every topic change, so there is nothing to submit and
 * nothing for next.config.ts's `form-action 'self'` CSP directive to block.
 *
 * Single-instance-per-page by construction (mounted exactly once, on /contact -- see
 * app/[locale]/(public)/contact/page.tsx), so the hardcoded `contact-topic-select` id is safe:
 * unlike FooterNewsletter (mounted from the persistent public layout, plus a second time on
 * /news), there is no second mount on the same page to collide with.
 */
export function PreparedEmailForm({labels, initialTopic}: Readonly<{labels: PreparedEmailFormLabels; initialTopic?: string}>) {
  const defaultTopic: ContactTopic = initialTopic && isContactTopic(initialTopic) ? initialTopic : "portal";
  const [topic, setTopic] = useState<ContactTopic>(defaultTopic);
  const mailto = `mailto:${siteConfig.contact.email}?subject=${encodeURIComponent(labels.subjects[topic])}&body=${encodeURIComponent(labels.bodies[topic])}`;

  return (
    <div className="prepared-email-form">
      <label htmlFor="contact-topic-select">{labels.topicLabel}</label>
      <select
        id="contact-topic-select"
        value={topic}
        onChange={(event) => {
          const {value} = event.target;
          if (isContactTopic(value)) setTopic(value);
        }}
      >
        {CONTACT_TOPICS.map((value) => (
          <option key={value} value={value}>{labels.topics[value]}</option>
        ))}
      </select>
      <a className="button" href={mailto}>{labels.composeAction}</a>
    </div>
  );
}
