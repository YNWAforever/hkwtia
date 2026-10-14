import "server-only";
import {cache} from "react";
import {membershipsRepository} from "@/lib/db/repos/memberships";
import type {Actor} from "@/lib/membership/lifecycle";

// React's cache is confined to the current server render. The cached getActor()
// supplies the same actor object to layout/page; new requests re-read revocations.
// Mutation repositories deliberately do not use this read-only rendering cache.
export const requestMemberships = cache((actor: Actor) => membershipsRepository.list(actor));
