import Image from 'next/image';

export type ExcoRosterCard = Readonly<{
  slug: string;
  name: string;
  wtiaRole: string | null;
  title: string | null;
  organization: string | null;
  paragraphs: readonly string[];
  /** Chrome label when no biography was supplied. Not a biography. */
  pendingBiography: string | null;
  linkedIn: Readonly<{href: string; label: string}> | null;
  photo: string | null;
  photoPosition: 'center' | 'top';
}>;

// Copy is resolved from messages/en.json and messages/zh-HK.json by the page.
// zhPending lives on content/exco-roster.ts. Approved zh-HK bios are in messages.

function initials(name: string) {
  const parts = name.split(/\s+/).filter((part) => part.length > 0);
  const first = parts[0] ?? '';
  const last = parts.length >= 2 ? (parts[parts.length - 1] ?? '') : '';
  const letters = last ? `${first.slice(0, 1)}${last.slice(0, 1)}` : first.slice(0, 2);
  return letters.toUpperCase();
}

export function ExcoRoster({members}: Readonly<{members: readonly ExcoRosterCard[]}>) {
  return (
    <div className="exco-roster">
      {members.map((member) => (
        <article className="exco-roster-card" data-slug={member.slug} key={member.slug}>
          <div className="exco-roster-media">
            {member.photo ? (
              <Image
                alt={member.name}
                className={member.photoPosition === 'top' ? 'exco-roster-photo exco-roster-photo-top' : 'exco-roster-photo'}
                fill
                loading="lazy"
                sizes="(max-width: 759px) 100vw, (max-width: 1099px) 50vw, 33vw"
                src={member.photo}
              />
            ) : (
              <span aria-hidden="true" className="exco-roster-fallback">{initials(member.name)}</span>
            )}
          </div>
          <div className="exco-roster-body">
            <h3>{member.name}</h3>
            {member.wtiaRole ? <p className="exco-roster-role">{member.wtiaRole}</p> : null}
            {member.title ? <p className="exco-roster-title">{member.title}</p> : null}
            {member.organization ? <p className="exco-roster-org">{member.organization}</p> : null}
            {member.paragraphs.length > 0 ? (
              <div className="exco-roster-bio">
                {member.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            ) : (
              <p className="exco-roster-pending">{member.pendingBiography}</p>
            )}
            {member.linkedIn ? (
              <a className="exco-roster-link" href={member.linkedIn.href} rel="noopener noreferrer" target="_blank">{member.linkedIn.label}</a>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}
