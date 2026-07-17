import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it} from "vitest";

import {StatusCard} from "@/components/portal/status-card";
import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";

describe("portal presentation", () => {
  it.each([
    [en.Portal.status.active.label, en.Portal.status.active.title, en.Portal.status.active.description],
    [zh.Portal.status.active.label, zh.Portal.status.active.title, zh.Portal.status.active.description],
  ])("renders the supplied localized status label, title, and description", (label, title, description) => {
    const markup = renderToStaticMarkup(<StatusCard status="active" label={label} title={title} description={description}/>);

    expect(markup).toContain(label);
    expect(markup).toContain(title);
    expect(markup).toContain(description);
    expect(markup).not.toMatch(/>active<\/p>/);
    expect(markup).not.toContain("membership status");
  });

  it.each([
    [en.Portal.plans.community, "community"],
    [en.Portal.plans.startup, "startup"],
    [en.Portal.plans.corporate, "corporate"],
    [en.Portal.plans.patron, "patron"],
    [zh.Portal.plans.community, "community"],
    [zh.Portal.plans.startup, "startup"],
    [zh.Portal.plans.corporate, "corporate"],
    [zh.Portal.plans.patron, "patron"],
  ])("provides a translated plan label for %s", (label, code) => {
    expect(label).toBeTruthy();
    expect(label).not.toBe(code);
  });
});
