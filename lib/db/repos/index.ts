export {profiles, profilesRepo, profilesRepository} from "./profiles";
export {companies, companiesRepo, companiesRepository} from "./companies";
export {memberships, membershipsRepo, membershipsRepository} from "./memberships";
export {applications, applicationsRepo, applicationsRepository} from "./applications";
export {jobs, jobsRepo, jobsRepository} from "./jobs";
export {auditEvents, auditEventsRepo, auditEventsRepository} from "./audit-events";

import {profiles} from "./profiles";
import {companies} from "./companies";
import {memberships} from "./memberships";
import {applications} from "./applications";
import {jobs} from "./jobs";
import {auditEvents} from "./audit-events";

export const repositories = {profiles, companies, memberships, applications, jobs, auditEvents};
