import Image from 'next/image';

export type ExcoRosterCard = Readonly<{
  slug: string;
  name: string;
  title: string | null;
  organization: string | null;
  paragraphs: readonly string[];
  photo: string | null;
  photoPosition: 'center' | 'top';
}>;

// Copy is resolved from messages/en.json and messages/zh-HK.json by the page.
// zhPending lives on content/exco-roster.ts: zh-HK bios are the English text.

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
            {member.title ? <p className="exco-roster-title">{member.title}</p> : null}
            {member.organization ? <p className="exco-roster-org">{member.organization}</p> : null}
            <div className="exco-roster-bio">
              {member.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
