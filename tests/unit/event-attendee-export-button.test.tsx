import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({prepare:vi.fn(),push:vi.fn()}));
vi.mock('next/navigation',()=>({useRouter:()=>({push:mocks.push})}));
vi.mock('@/lib/admin/batches/actions',()=>({prepareAdminBatchAction:mocks.prepare}));
import {EventAttendeeExportButton} from '@/components/admin/event-attendee-export-button';
afterEach(cleanup);beforeEach(()=>vi.clearAllMocks());
describe('event export preparation',()=>{
 it('preserves a failed attempt for safe retry and carries only event/filter scope to the server',async()=>{
  mocks.prepare.mockRejectedValueOnce(new Error('response lost')).mockResolvedValueOnce({batchId:'11111111-1111-4111-8111-111111111111'});
  render(<EventAttendeeExportButton eventId="22222222-2222-4222-8222-222222222222" search="Synthetic" locale="zh-HK" label="Preview" errorLabel="Try again"/>);
  fireEvent.click(screen.getByRole('button',{name:'Preview'}));await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button',{name:'Preview'}));await waitFor(()=>expect(mocks.push).toHaveBeenCalledWith('/zh/admin/batches/11111111-1111-4111-8111-111111111111'));
  expect(mocks.prepare).toHaveBeenCalledTimes(2);const first=mocks.prepare.mock.calls[0]![0];expect(mocks.prepare.mock.calls[1]![0]).toEqual(first);
  expect(Object.keys(first).sort()).toEqual(['idempotencyKey','operation','payload']);expect(first.payload).toEqual({eventId:'22222222-2222-4222-8222-222222222222',search:'Synthetic'});
 });
});
