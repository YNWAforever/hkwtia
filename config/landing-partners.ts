import rawLandingPartners from "./landing-partners.json";

import {landingPartnerMapSchema} from "@/lib/launchpad/contracts";

/** Curated public map only; MOU negotiation and contact data remain outside this module. */
export const landingPartners = Object.freeze(landingPartnerMapSchema.parse(rawLandingPartners));
