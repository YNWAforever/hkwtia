export type RouteMapVariant = 'hero' | 'board';

export type RouteMapLabels = Readonly<{hk: string; gz: string; sz: string; world?: string}>;

const wrapperClassName: Record<RouteMapVariant, string> = {hero: 'gba-map', board: 'route-map'};

// Two real donor selectors, not one: app/styles/wisetech.css:255-257 .gba-map (4 nodes, named
// classes, full-bleed hero background) vs :281 .gba-route-board .route-map (3 bare spans styled
// by nth-child position, two-column boxed diagram). Sharing this component keeps both grammars
// correct instead of forcing one page's markup onto the other's CSS.
export function RouteMap({variant, labels}: Readonly<{variant: RouteMapVariant; labels: RouteMapLabels}>) {
  return (
    <div className={wrapperClassName[variant]} aria-hidden="true">
      {variant === 'hero' ? (
        <>
          <span className="hk-node">{labels.hk}</span>
          <span className="gz-node">{labels.gz}</span>
          <span className="sz-node">{labels.sz}</span>
          {labels.world ? <span className="world-node">{labels.world}</span> : null}
        </>
      ) : (
        <>
          <span>{labels.hk}</span>
          <span>{labels.gz}</span>
          <span>{labels.sz}</span>
        </>
      )}
    </div>
  );
}
