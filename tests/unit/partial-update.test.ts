import {z} from "zod";
import {expect, it} from "vitest";
import {partialUpdate} from "@/lib/validation/partial-update";
it("preserves omission through create defaults and transform pipelines while validating supplied fields", () => {
  const create = z.object({title: z.string().min(1), tags: z.array(z.string()).default([]).transform(tags => tags.map(tag => tag.toLowerCase())), capacity: z.number().positive().nullable().default(null)}).strict();
  const patch = partialUpdate(create);
  expect(patch.parse({title: "changed"})).toEqual({title: "changed"});
  expect(patch.parse({tags: ["AI"]})).toEqual({tags: ["ai"]});
  expect(patch.parse({capacity: null})).toEqual({capacity: null});
  expect(patch.safeParse({capacity: -1}).success).toBe(false);
  expect(patch.safeParse({role: "admin"}).success).toBe(false);
});
