import path from "node:path";
import {ci as baseCi} from "../lighthouserc.js";
if (process.env.LHCI_COOKIE_FILE) throw Error("PUBLIC_PROFILE_REQUIRES_NO_CREDENTIAL");
export const ci={...baseCi,collect:{...baseCi.collect,puppeteerScript:".playwright/t21-lhci-public.cjs",puppeteerLaunchOptions:{userDataDir:path.resolve(`.playwright/t22-lhci-owned-profile-${Date.now()}`),args:["--no-sandbox","--disable-gpu","--disable-dev-shm-usage"]},settings:{...baseCi.collect.settings,extraHeaders:{"Accept-Language":"en"}}},upload:{target:"filesystem",outputDir:".playwright/t22-lighthouse-current"}};
export default {ci};
