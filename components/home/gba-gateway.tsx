import {getHomeTranslations, type HomeCopyProps} from '@/lib/home/copy-preview';

import {ActionLink} from '@/components/wt/action-link';
import {RouteMap} from '@/components/wt/route-map';

// Section 9 of 13. The public Launch Pad route is hidden, so this band links to
// Contact with that page's existing channel label. app/styles/wisetech.css:253
// .gba-section; :254 .gba-copy; :255-257 .gba-map/.hk-node/.gz-node/.sz-node/.world-node.
export async function GbaGateway({locale, copyOverrides}: HomeCopyProps) {
  const [t, contact] = await Promise.all([
    getHomeTranslations({locale, copyOverrides, namespace: 'Home.gbaGateway'}),
    getHomeTranslations({locale, copyOverrides, namespace: 'Contact'}),
  ]);

  return (
    <section className="gba-section" aria-labelledby="gba-gateway-title">
      <RouteMap variant="hero" labels={{hk: 'HK', gz: 'GZ', sz: 'SZ', world: '↗'}} />
      <div className="shell gba-copy">
        <p className="eyebrow light">{t('eyebrow')}</p>
        <h2 id="gba-gateway-title">{t('title')}</h2>
        <p>{t('copy')}</p>
        <div className="hero-actions">
          <ActionLink variant="button-light" href="/contact">
            {contact('channelsTitle')}
          </ActionLink>
        </div>
      </div>
    </section>
  );
}
