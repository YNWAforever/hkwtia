import {describe, expect, it} from "vitest";
import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";
describe("at-risk bilingual evidence contract", () => { it.each([en.Admin.atRisk, zh.Admin.atRisk])("describes both v1.1 branches", (labels) => { expect(labels.description).toMatch(/90/); expect(labels.description).toMatch(/120/); expect(labels.branchAEvidence).toBeTruthy(); expect(labels.branchBEvidence).toBeTruthy(); }); });