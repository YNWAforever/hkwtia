import {act,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {beforeEach,afterEach,describe,expect,it,vi} from 'vitest';
import {PageCopyForm} from '@/components/admin/page-copy-form';
import {AdminUnsavedChangesProvider} from '@/components/admin/unsaved-changes-guard';
const labels={english:'English',chinese:'Chinese',revertHint:'Fallback',save:'Publish',saving:'Publishing',previewDraft:'Preview',previewPrivate:'Private',previewEnglish:'English preview',previewChinese:'Chinese preview'};
const draftLabels={saved:'Saved in this tab at {time}',unavailable:'This tab could not save your draft. Keep this page open.',available:'An unsaved draft is available.',restore:'Restore draft',discard:'Discard draft',conflict:'Published copy changed. Compare the draft before editing.',compare:'Compare draft',current:'Current copy',draft:'Draft copy'};
const fields=[{keyPath:'sections.0.heading',enBundle:'Default',zhBundle:'預設',enField:'copy:en:sections.0.heading',zhField:'copy:zh-HK:sections.0.heading',enValue:'Published',zhValue:'已發布'}];
const revision='a'.repeat(64);
function mount(identity='synthetic-editor-a',baseRevision=revision,action=vi.fn(async()=>({}))){return render(<AdminUnsavedChangesProvider confirmMessage="Leave?"><PageCopyForm {...{action,fields,labels,revision:baseRevision,localDraft:{identity,namespace:'Home' as const,labels:draftLabels}}}/></AdminUnsavedChangesProvider>);}
beforeEach(()=>sessionStorage.clear());afterEach(()=>vi.restoreAllMocks());
describe('CMS tab draft recovery',()=>{
 it('offers explicit restore after unmount and restores both languages without publishing',()=>{
 const action=vi.fn(async()=>({}));const first=mount('synthetic-editor-a',revision,action);fireEvent.input(screen.getByLabelText('English'),{target:{value:'Synthetic unsaved'}});fireEvent.input(screen.getByLabelText('Chinese'),{target:{value:'合成草稿'}});first.unmount();mount('synthetic-editor-a',revision,action);
 expect(screen.getByLabelText('English')).toHaveValue('Published');fireEvent.click(screen.getByRole('button',{name:'Restore draft'}));expect(screen.getByLabelText('English')).toHaveValue('Synthetic unsaved');expect(screen.getByLabelText('Chinese')).toHaveValue('合成草稿');expect(action).not.toHaveBeenCalled();
 });
 it('reports denied storage without falsely reporting a saved draft',()=>{
 vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new DOMException('Denied','SecurityError');});mount();fireEvent.input(screen.getByLabelText('English'),{target:{value:'Still in form'}});expect(screen.getByRole('alert')).toHaveTextContent(draftLabels.unavailable);expect(screen.queryByText(/Saved in this tab/)).not.toBeInTheDocument();expect(screen.getByLabelText('English')).toHaveValue('Still in form');
 });
 it('keeps current revision and fields on stale draft and offers comparison instead of automatic restore',()=>{
 const first=mount();fireEvent.input(screen.getByLabelText('English'),{target:{value:'Stale synthetic draft'}});first.unmount();const second=mount('synthetic-editor-a','b'.repeat(64));expect(screen.getByText(draftLabels.conflict)).toBeInTheDocument();expect(screen.queryByRole('button',{name:'Restore draft'})).not.toBeInTheDocument();expect(screen.getByLabelText('English')).toHaveValue('Published');expect(second.container.querySelector('input[name="revision"]')).toHaveValue('b'.repeat(64));expect(screen.getByText('Stale synthetic draft')).toBeInTheDocument();
 });
 it('does not disclose another signed-in identity draft',()=>{
 const first=mount();fireEvent.input(screen.getByLabelText('English'),{target:{value:'Identity A draft'}});first.unmount();mount('synthetic-editor-b');expect(screen.queryByRole('button',{name:'Restore draft'})).not.toBeInTheDocument();expect(screen.getByLabelText('English')).toHaveValue('Published');
 });
 it('clears an explicitly discarded draft and retains published fields',()=>{
 const first=mount();fireEvent.input(screen.getByLabelText('English'),{target:{value:'To discard'}});first.unmount();const second=mount();fireEvent.click(screen.getByRole('button',{name:'Discard draft'}));expect(screen.getByLabelText('English')).toHaveValue('Published');second.unmount();mount();expect(screen.queryByRole('button',{name:'Restore draft'})).not.toBeInTheDocument();
 });
 it('clears only after successful publishing, preserving failed-save edits',async()=>{
 let result:{status:'success'|'error';message:string;revision?:string}={status:'error',message:'Synthetic failure'};const action=vi.fn(async()=>result);const first=mount('synthetic-editor-a',revision,action);fireEvent.input(screen.getByLabelText('English'),{target:{value:'Retry content'}});fireEvent.click(screen.getByRole('button',{name:'Publish'}));await waitFor(()=>expect(screen.getByText('Synthetic failure')).toBeInTheDocument());first.unmount();const second=mount('synthetic-editor-a',revision,action);fireEvent.click(screen.getByRole('button',{name:'Restore draft'}));result={status:'success',message:'Published',revision:'b'.repeat(64)};fireEvent.click(screen.getByRole('button',{name:'Publish'}));await waitFor(()=>expect(screen.getByRole('status')).toHaveTextContent('Published'));second.unmount();mount('synthetic-editor-a','b'.repeat(64),action);expect(screen.queryByRole('button',{name:'Restore draft'})).not.toBeInTheDocument();
 });
 it('retains edits entered while publishing and binds them to the new published revision',async()=>{
 let complete!:(value:{status:'success';message:string;revision:string})=>void;
 const action=vi.fn(()=>new Promise<{status:'success';message:string;revision:string}>(resolve=>{complete=resolve;}));
 const first=mount('synthetic-editor-a',revision,action);
 fireEvent.input(screen.getByLabelText('English'),{target:{value:'Submitted draft'}});fireEvent.click(screen.getByRole('button',{name:'Publish'}));await waitFor(()=>expect(action).toHaveBeenCalledOnce());
 fireEvent.input(screen.getByLabelText('English'),{target:{value:'Later draft'}});
 await act(async()=>complete({status:'success',message:'Published',revision:'b'.repeat(64)}));
 expect(screen.getByLabelText('English')).toHaveValue('Later draft');first.unmount();mount('synthetic-editor-a','b'.repeat(64));fireEvent.click(screen.getByRole('button',{name:'Restore draft'}));expect(screen.getByLabelText('English')).toHaveValue('Later draft');
 });

 it('does not restore a draft that expires while the recovery choice remains open',()=>{
 const first=mount();fireEvent.input(screen.getByLabelText('English'),{target:{value:'Expiring draft'}});first.unmount();mount();
 const raw=sessionStorage.getItem('hkwtia:cms-draft:v1:synthetic-editor-a:Home')!;
 vi.spyOn(Date,'now').mockReturnValue(Date.parse(JSON.parse(raw).updatedAt)+86_400_001);
 fireEvent.click(screen.getByRole('button',{name:'Restore draft'}));expect(screen.getByLabelText('English')).toHaveValue('Published');
 });

});
