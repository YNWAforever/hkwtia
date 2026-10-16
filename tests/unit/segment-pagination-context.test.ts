import {describe,expect,it} from 'vitest';
import {segmentFilterSchema,segmentPreviewSchema} from '@/lib/admin/segment-schema';
import {bindSegmentCursor,parseSegmentPageQuery,segmentCursorPosition,segmentPageHref} from '@/lib/admin/segment-pagination';
const draft='00000000-0000-4000-8000-000000001003';
const filter=segmentFilterSchema.parse({profileIds:['synthetic-1'],tier:['corporate','community'],status:['active'],scoreMin:12,scoreMax:90,renewalWithinDays:30,sector:'Synthetic',lastLoginBeforeDays:5,whatsappOptIn:false,industryTags:['ai'],companyPlan:['corporate'],event:{eventId:draft,state:'not_registered'},audience:'both',contactStage:['new'],contactSource:['event_guest']});
function raw(href:string){const p=new URL(href,'https://isolated.example.test').searchParams;return Object.fromEntries([...new Set(p.keys())].map(k=>[k,p.getAll(k).length>1?p.getAll(k):p.get(k)!]));}
describe('segment validated navigation context',()=>{
 it('round trips all filters, locale, draft and page size with previous history',()=>{
 const cursor=bindSegmentCursor(filter,50,'pointer',50);const href=segmentPageHref('zh-HK',{filter,limit:50,cursor},draft,[null]);
 expect(href.startsWith('/zh/admin/segments?')).toBe(true);expect(raw(href).campaignDraft).toBe(draft);
 expect(parseSegmentPageQuery(raw(href))).toEqual({query:{filter,limit:50,cursor},history:[null],offset:50});
 });
 it('restarts after audience or page size changes and rejects stale history',()=>{
 const cursor=bindSegmentCursor(filter,50,'pointer',50);const href=segmentPageHref('en',{filter,limit:50,cursor},draft,[null]);
 for(const changed of [{sector:'Changed'},{limit:'100'}])expect(parseSegmentPageQuery({...raw(href),...changed})).toMatchObject({query:{cursor:null},history:[],offset:0});
 const bad=Buffer.from(JSON.stringify([bindSegmentCursor({...filter,sector:'Other'},50,'pointer',50)])).toString('base64url');
 expect(parseSegmentPageQuery({...raw(href),history:bad}).history).toEqual([]);
 });
 it('keeps the maximum valid repository cursor usable after binding instead of failing on page two',()=>{
 const cursor=bindSegmentCursor(filter,50,'x'.repeat(500),50);
 expect(cursor.length).toBeGreaterThan(500);
 expect(()=>segmentPreviewSchema.parse({filter,limit:50,cursor})).not.toThrow();
 expect(parseSegmentPageQuery(raw(segmentPageHref('en',{filter,limit:50,cursor},draft,[null]))).query.cursor).toBe(cursor);
 });
 it('treats legacy or malformed cursors as restart requests without granting any audience',()=>{
 for(const cursor of ['legacy','!!!',Buffer.from('{}').toString('base64url')])expect(segmentCursorPosition(filter,50,cursor)).toEqual({cursor:null,offset:0,valid:false});
 expect(()=>parseSegmentPageQuery({audience:'unknown'})).toThrow();
 });
});
