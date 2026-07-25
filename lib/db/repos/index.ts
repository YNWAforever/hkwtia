import "server-only";

export {profiles, profilesRepo, profilesRepository} from "./profiles";
export {companies, companiesRepo, companiesRepository} from "./companies";
export {memberships, membershipsRepo, membershipsRepository} from "./memberships";
export {applications, applicationsRepo, applicationsRepository} from "./applications";
export {jobs, jobsRepo, jobsRepository} from "./jobs";
export {auditEvents, auditEventsRepo, auditEventsRepository} from "./audit-events";
export {profileIdentityRepository} from "./profile-identities";
export {portalContentRepository} from "./portal-content";
export {journeys, journeysRepo, journeysRepository} from "./journeys";
export {deliveries, deliveriesRepo, deliveriesRepository} from "./deliveries";
export {suppressions, suppressionsRepo, suppressionsRepository} from "./suppressions";
export {staffTasksRepo, staffTasksRepository} from "./staff-tasks";

import {profiles} from "./profiles";
import {companies} from "./companies";
import {memberships} from "./memberships";
import {applications} from "./applications";
import {jobs} from "./jobs";
import {auditEvents} from "./audit-events";
import {profileIdentityRepository} from "./profile-identities";
import {portalContentRepository} from "./portal-content";
import {journeys} from "./journeys";
import {deliveries} from "./deliveries";
import {suppressions} from "./suppressions";
import {staffTasksRepository} from "./staff-tasks";

export const repositories = {
  profiles,
  companies,
  memberships,
  applications,
  jobs,
  auditEvents,
  profileIdentityRepository,
  portalContentRepository,
  journeys,
  deliveries,
  suppressions,
  staffTasks: staffTasksRepository,
};
