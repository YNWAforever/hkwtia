import {readFileSync} from 'node:fs';
import {parse} from 'postcss';
import {expect, it} from 'vitest';

// Inspect the selected effect, so renaming keyframes cannot retire the opacity check.
function actionEffect(css: string) {
  const root = parse(css);
  const names: string[] = [];
  root.walkRules('.hero-content > .hero-actions', rule => {
    rule.walkDecls('animation-name', declaration => {names.push(declaration.value);});
  });
  expect(names).toHaveLength(1);
  const properties: string[] = [];
  let effects = 0;
  root.walkAtRules('keyframes', effect => {
    if (effect.params === names[0]) {
      effects++;
      effect.walkDecls(declaration => {properties.push(declaration.prop);});
    }
  });
  expect(effects).toBe(1);
  expect(properties.length).toBeGreaterThan(0);
  return properties;
}

it('keeps the hero action entrance transform-only for contrast', () => {
  expect(actionEffect(readFileSync('app/styles/wisetech-experience.css', 'utf8'))).toEqual(['transform']);
});

it('detects the fading shape it is meant to catch, including renamed effects', () => {
  const sample = (body: string) => `.hero-content > .hero-actions { animation-name: renamed; }
    @keyframes renamed { from { ${body} } }`;
  expect(actionEffect(sample('transform: translateY(18px);'))).toEqual(['transform']);
  expect(actionEffect(sample('opacity: 0; transform: translateY(18px);'))).toContain('opacity');
});
