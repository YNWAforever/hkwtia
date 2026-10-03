import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PolicyConfirmation } from "@/components/join/policy-confirmation";
const labels = { title: "TEST terms", version: "Version", accept: "I accept TEST terms", accepted: "Applicant acknowledged", unavailable: "Approved terms unavailable", ownerRequired: "Applicant must acknowledge", support: "Support" };
describe("policy acknowledgement rendering", () => {
    it("renders only the selected escaped content and native acknowledgement", () => {
        const html = renderToStaticMarkup(<PolicyConfirmation supportHref="/zh/contact" labels={labels} view={{ enabled: true, policy: { version: "test-v1", content: 'TEST <script>alert(1)</script>' }, needsAcceptance: true, canProceed: true, ownerRequired: false }}/>);
        expect(html).toContain('name="policyVersion"');
        expect(html).toContain('value="test-v1"');
        expect(html).toContain('name="policyAccepted"');
        expect(html).toContain('&lt;script&gt;');
        expect(html).not.toContain('<script>');
    });
    it("reuses a current server acceptance without asking for another checkbox", () => {
        const html = renderToStaticMarkup(<PolicyConfirmation supportHref="/contact" labels={labels} view={{ enabled: true, policy: { version: "test-v1", content: "TEST ONLY" }, needsAcceptance: false, canProceed: true, ownerRequired: false }}/>);
        expect(html).toContain("Applicant acknowledged");
        expect(html).not.toContain('type="checkbox"');
    });
    it("has a support recovery state for unavailable approval or a different applicant", () => {
        const html = renderToStaticMarkup(<PolicyConfirmation supportHref="/contact" labels={labels} view={{ enabled: true, policy: null, needsAcceptance: false, canProceed: false, ownerRequired: true }}/>);
        expect(html).toContain("Approved terms unavailable");
        expect(html).toContain("Applicant must acknowledge");
        expect(html).toContain('href="/contact"');
        expect(html).not.toContain('type="checkbox"');
    });
    it("keeps the default-off terms flow out of the existing form", () => {
        expect(renderToStaticMarkup(<PolicyConfirmation supportHref="/contact" labels={labels} view={{ enabled: false, policy: null, needsAcceptance: false, canProceed: true, ownerRequired: false }}/>)).toBe("");
    });
});
