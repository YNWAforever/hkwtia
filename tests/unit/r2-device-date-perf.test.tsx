import {describe,it,expect} from 'vitest';
import {formatPortalDate,portalDateParts} from '@/lib/portal/format-date';
import {ci} from '@/lighthouserc.js';
describe('R2 offline date and measurement contracts (no browser or timing evidence)',()=>{
 for(const [before,after,enBefore,enAfter,zhBefore,zhAfter] of [
  ['2026-10-31T15:59:00Z','2026-10-31T16:00:00Z','31 October 2026','1 November 2026','2026年10月31日','2026年11月1日'],
  ['2026-12-31T15:59:00Z','2026-12-31T16:00:00Z','31 December 2026','1 January 2027','2026年12月31日','2027年1月1日'],
 ]) it(`uses Hong Kong midnight at ${after}`,()=>{
  expect(formatPortalDate('en',before)).toBe(enBefore);expect(formatPortalDate('en',after)).toBe(enAfter);
  expect(formatPortalDate('zh-HK',before)).toBe(zhBefore);expect(formatPortalDate('zh-HK',after)).toBe(zhAfter);
  expect(portalDateParts('en',after,new Date(before)).year).toBe(after.includes('12-31')?'2027':null);
 });
 it('prepares three public lab runs with existing score gates intact',()=>{
  expect(ci.collect.numberOfRuns).toBeGreaterThanOrEqual(3);
  expect(ci.assert.aggregationMethod).toBe('median');
  expect(ci.assert.assertions['categories:performance']).toEqual(['error',{minScore:0.9}]);
  expect(ci.assert.assertions['categories:accessibility']).toEqual(['error',{minScore:0.95}]);
  expect(ci.collect.url.some(url=>url.endsWith('/membership'))).toBe(true);
  expect(ci.collect.url.some(url=>url.endsWith('/zh/membership'))).toBe(true);
 });
});
