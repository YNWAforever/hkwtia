import {render,screen} from '@testing-library/react';
import {createTranslator} from 'next-intl';
import {describe,expect,it,vi} from 'vitest';
import en from '@/messages/en.json';
const events=vi.hoisted(()=>Array.from({length:21},(_,i)=>({id:'00000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),title:'Synthetic Event '+(i+1),published:true,startsAt:new Date('2100-01-'+String(i+1).padStart(2,'0'))})));
vi.mock('next-intl/server',()=>({setRequestLocale:vi.fn(),getTranslations:async({namespace}:{namespace:"Admin.segments"|"Admin.contacts"})=>createTranslator({locale:'en',messages:en,namespace})}));
vi.mock('@/lib/admin/page-auth',()=>({requireAdminPageActor:async()=>({kind:'staff',userId:'m2-staff',profileId:'m2-staff'})}));
vi.mock('@/lib/admin/segments',()=>({previewSegment:async()=>({total:0,items:[],nextCursor:null})}));
vi.mock('@/lib/db/repos/segments',()=>({segmentsRepository:{list:async()=>[]}}));
vi.mock('@/lib/db/repos/events',()=>({eventsRepository:{listForAdmin:async()=>events},localizeEvent:(event:unknown)=>event}));
vi.mock('@/lib/admin/segment-actions',()=>({saveSegmentAction:vi.fn()}));
vi.mock('@/lib/admin/campaign-actions',()=>({queueCampaignAction:vi.fn()}));
import SegmentsPage from '@/app/[locale]/(admin)/admin/segments/page';
describe('selected event and draft survive the preview form',()=>{
 it('retains the 21st selected upcoming event outside the first 20 options',async()=>{
 const draft='00000000-0000-4000-8000-000000001003';
 render(await SegmentsPage({params:Promise.resolve({locale:'en'}),searchParams:Promise.resolve({eventId:events[20].id,eventState:'not_registered',campaignDraft:draft,limit:'100',profileId:'synthetic-1'})}));
 const event=screen.getByLabelText('Event');expect(event).toHaveValue(events[20].id);
 expect(screen.getByRole('option',{name:'Synthetic Event 21'})).toBeInTheDocument();
 const data=new FormData(event.closest('form')!);expect(data.get('eventId')).toBe(events[20].id);expect(data.get('eventState')).toBe('not_registered');expect(data.get('campaignDraft')).toBe(draft);expect(data.get('limit')).toBe('100');expect(data.get('profileId')).toBe('synthetic-1');expect(data.has('cursor')).toBe(false);
 });
});
