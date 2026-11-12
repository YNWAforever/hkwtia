import Image from 'next/image';

import {excoRoster, type ExcoRosterMember} from '@/content/exco-roster';
import type {AppLocale} from '@/i18n/routing';

// zhPending is true on every record: zh-HK keeps the English bio. Chinese names and
// Willy's 主席 are the only locale-specific lines, and only where one was supplied.

function displayName(member: ExcoRosterMember, locale: AppLocale) {
  return locale === 'zh-HK' && member.zhName ? member.zhName : member.name;
}

function displayTitle(member: ExcoRosterMember, locale: AppLocale) {
  if (locale === 'zh-HK' && member.zhTitle) return member.zhTitle;
  return member.title;
}

function initials(name: string) {
  const parts = name.split(/\s+/).filter((part) => part.length > 0);
  const first = parts[0] ?? '';
  const last = parts.length >= 2 ? (parts[parts.length - 1] ?? '') : '';
  const letters = last ? `${first.slice(0, 1)}${last.slice(0, 1)}` : first.slice(0, 2);
  return letters.toUpperCase();
}

export function ExcoRoster({locale}: Readonly<{locale: AppLocale}>) {
  return (
    <div className="exco-roster">
      {excoRoster.map((member) => {
        const name = displayName(member, locale);
        const title = displayTitle(member, locale);
        return (
          <article className="exco-roster-card" data-slug={member.slug} key={member.slug}>
            <div className="exco-roster-media">
              {member.photo ? (
                <Image
                  alt={name}
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
              <h3>{name}</h3>
              {title ? <p className="exco-roster-title">{title}</p> : null}
              {member.organization ? <p className="exco-roster-org">{member.organization}</p> : null}
              <div className="exco-roster-bio">
                {member.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
