import type {DirectoryPersonProfile} from "@/lib/members/profile-hooks";

/**
 * Hook for individual profiles on a company card. `/members` publishes companies
 * only, so this renders nothing until a person row exists to pass in.
 */
export function DirectoryPersonSlots({people}: Readonly<{people: readonly DirectoryPersonProfile[]}>) {
  if (people.length === 0) return null;
  return (
    <ul>
      {people.map((person) => (
        <li key={`${person.displayName}:${person.companyName ?? ""}`}>
          {person.displayName}
        </li>
      ))}
    </ul>
  );
}
