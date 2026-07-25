import {readFileSync} from "node:fs";

import {describe, expect, it} from "vitest";

const schema = readFileSync("lib/db/schema-core.ts", "utf8");

describe("M3 schema", () => {
  it("defines recurring journey identity and durable delivery keys", () => {
    expect(schema).toContain('pgEnum("journey_status"');
    expect(schema).toContain('"instance_key"');
    expect(schema).toContain("journey_state_profile_instance_step_unique");
    expect(schema).toContain("journey_state_delivery_key_unique");
  });

  it("adds WhatsApp consent only to profiles", () => {
    const companiesSchema = schema.slice(schema.indexOf('export const companies'), schema.indexOf('export const companyMembers'));

    expect(companiesSchema).not.toContain('"whatsapp_opt_in"');
    expect(companiesSchema).not.toContain('"whatsapp_number"');
  });

  it("stores WhatsApp consent, suppressions, delivery logs and staff tasks", () => {
    expect(schema).toContain('"whatsapp_opt_in"');
    expect(schema).toContain('"whatsapp_number"');
    expect(schema).toContain('pgTable("whatsapp_log"');
    expect(schema).toContain('pgTable("message_suppressions"');
    expect(schema).toContain('pgTable("staff_tasks"');
  });
});
