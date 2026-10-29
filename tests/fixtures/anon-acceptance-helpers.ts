import {expect, type Page} from '@playwright/test';

// Shared anonymous-acceptance helpers (local spec + Preview OIDC spec). Moved verbatim.
// Infinite decorative effects are excluded; a stuck finite effect fails within 10s.
export async function settleAnimations(page: Page) {
  await page.evaluate(async () => {
    const finite = document.getAnimations().filter(animation => {
      const timing = animation.effect?.getComputedTiming();
      return timing && Number.isFinite(timing.endTime) && Number.isFinite(timing.iterations);
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.all(finite.map(animation => animation.finished.catch(() => undefined))),
        new Promise<never>((_, reject) => {timer = setTimeout(() => reject(Error('Finite animations did not settle within 10s')), 10_000);})
      ]);
    } finally {clearTimeout(timer);}
  });
}
// Assert the effective colours, including every ancestor's opacity.
export async function homeContrast(page: Page) {
  const result = await page.locator('.hero .hero-actions .button[href="#pathways"]').evaluate(element => {
    const rgb = (value: string) => {
      const channels = value.match(/[\d.]+/g)?.map(Number);
      if (!channels || channels.length < 3) throw Error(`Unsupported colour: ${value}`);
      return channels;
    };
    const foreground = getComputedStyle(element).color;
    let background = '';
    const opacities: number[] = [];
    for (let node: Element | null = element; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      opacities.push(Number(style.opacity));
      if (Number(style.opacity) !== 1) throw Error(`Unsettled opacity: ${style.opacity}`);
      if (!background) {
        const channels = rgb(style.backgroundColor);
        if (channels.length === 3 || channels[3] === 1) background = style.backgroundColor;
        else if (channels[3] !== 0) throw Error('Translucent background needs compositing');
      }
    }
    if (!background) throw Error('No opaque background');
    const luminance = (value: string) => rgb(value).slice(0, 3).map(c => {
      const v = c / 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    }).reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
    const fg = rgb(foreground);
    if (fg.length === 4 && fg[3] !== 1) throw Error('Translucent foreground');
    const a = luminance(foreground), b = luminance(background);
    return {foreground, background, opacities, ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)};
  });
  expect(result.ratio).toBeGreaterThanOrEqual(4.5);
  return result;
}
