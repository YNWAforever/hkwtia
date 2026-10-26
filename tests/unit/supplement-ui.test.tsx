import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it} from 'vitest';
import {randomUUID} from 'node:crypto';
import en from '@/messages/en.json';
import zh from '@/messages/zh-HK.json';
import {SupplementResponseForm} from '@/components/member/supplement-response-form';
import {SupplementPublishPreview} from '@/components/admin/supplement-publish-preview';
import {createSupplementService, type SupplementState} from '@/lib/membership/supplement-service';
afterEach(cleanup);
async function fixture() {
 const state: SupplementState = {applications:[{id:randomUUID(),applicantUserId:'a',status:'pending_review'}], requests:[],responses:[],receipts:[],audits:[]};
 const service=createSupplementService({transaction:async work=>work(state)});
 const staff={kind:'staff',userId:'staff',profileId:'staff'} as const;
 const created=await service.createSupplementDraft(staff,{applicationId:state.applications[0].id,operationRequestId:randomUUID(),items:[{itemId:'website',label:'Company website',required:true}],dueAt:'2026-11-01T16:00:00Z',staffContext:'PRIVATE-SENTINEL'});
 if(created.status!=='saved') throw Error('fixture draft');
 return {state,service,staff,request:state.requests[0]};
}
describe('offline supplement UI through real service / fake transaction',()=>{
 for(const messages of [en,zh]) it(`previews and publishes member-visible fields`,async()=>{
  const f=await fixture(); const labels=messages.Supplement;
  render(<SupplementPublishPreview request={f.request} labels={labels} action={input=>f.service.publishSupplementRequest(f.staff,input)}/>);
  expect(screen.getByText(labels.visible)).toBeInTheDocument();
  expect(document.body.textContent).not.toContain('PRIVATE-SENTINEL');
  fireEvent.click(screen.getByRole('button',{name:labels.publish}));
  expect(await screen.findByText(labels.saved)).toBeInTheDocument();
  expect(f.state.requests[0].status).toBe('published');
  expect(screen.getByText(/2026-11-01T16:00:00Z/)).toBeInTheDocument();
 });
 for(const messages of [en,zh]) it('retains invalid answers, then responds with receipt',async()=>{
  const f=await fixture(); const labels=messages.Supplement;
  await f.service.publishSupplementRequest(f.staff,{requestId:f.request.id,expectedVersion:1,operationRequestId:randomUUID()});
  const [request]=await f.service.listMySupplementRequests({kind:'member',userId:'a',profileId:'a'},{applicationId:f.request.applicationId});
  render(<SupplementResponseForm request={request} labels={labels} action={input=>f.service.respondToSupplementRequest({kind:'member',userId:'a',profileId:'a'},input)}/>);
  const text=screen.getByLabelText(`${labels.text}: Company website`); const url=screen.getByLabelText(`${labels.url}: Company website`);
  fireEvent.change(text,{target:{value:'Keep my answer'}}); fireEvent.change(url,{target:{value:'http://unsafe.test'}});
  fireEvent.click(screen.getByRole('button',{name:labels.respond}));
  expect(await screen.findByRole('alert')).toHaveTextContent(labels.validation);
  expect(text).toHaveValue('Keep my answer'); expect(url).toHaveValue('http://unsafe.test');
  fireEvent.change(url,{target:{value:'https://example.test'}});
  fireEvent.click(screen.getByRole('button',{name:labels.respond}));
  expect(await screen.findByText(labels.saved)).toBeInTheDocument();
  expect(f.state.responses[0].answers[0].text).toBe('Keep my answer');
  expect(screen.getByText(new RegExp(f.state.responses[0].operationId))).toBeInTheDocument();
  expect(document.body.textContent).not.toContain('PRIVATE-SENTINEL');
 });
 it('rejects a same-company non-applicant through the injected service',async()=>{
  const f=await fixture(); const labels=en.Supplement;
  await f.service.publishSupplementRequest(f.staff,{requestId:f.request.id,expectedVersion:1,operationRequestId:randomUUID()});
  render(<SupplementResponseForm request={f.state.requests[0]} labels={labels} action={input=>f.service.respondToSupplementRequest({kind:'member',userId:'b',profileId:'b'},input)}/>);
  fireEvent.click(screen.getByRole('button',{name:labels.respond}));
  expect(await screen.findByRole('alert')).toHaveTextContent(labels.forbidden);
  expect(f.state.responses).toHaveLength(0);
 });
});
it('retains required and overlong answers on service validation',async()=>{
 const f=await fixture();const labels=en.Supplement;
 await f.service.publishSupplementRequest(f.staff,{requestId:f.request.id,expectedVersion:1,operationRequestId:randomUUID()});
 render(<SupplementResponseForm request={f.state.requests[0]} labels={labels} action={input=>f.service.respondToSupplementRequest({kind:'member',userId:'a',profileId:'a'},input)}/>);
 fireEvent.click(screen.getByRole('button',{name:labels.respond}));
 expect(await screen.findByRole('alert')).toHaveTextContent(labels.validation);
 const text=screen.getByLabelText(`${labels.text}: Company website`);
 fireEvent.change(text,{target:{value:'x'.repeat(2001)}});
 fireEvent.click(screen.getByRole('button',{name:labels.respond}));
 expect(await screen.findByRole('alert')).toHaveTextContent(labels.validation);
 expect(text).toHaveValue('x'.repeat(2001));
 expect(f.state.responses).toHaveLength(0);
});
it('freezes an unknown operation and displays its stable receipt key',async()=>{
 const f=await fixture();const labels=en.Supplement;const operation=randomUUID();
 render(<SupplementResponseForm request={f.request} labels={labels} initialOperationRequestId={operation} action={async()=>{throw Error('lost response');}}/>);
 fireEvent.change(screen.getByLabelText(`${labels.text}: Company website`),{target:{value:'Retain on uncertainty'}});
 fireEvent.click(screen.getByRole('button',{name:labels.respond}));
 expect(await screen.findByRole('alert')).toHaveTextContent(labels.unknown);
 expect(screen.getByText(new RegExp(operation))).toBeInTheDocument();
 expect(screen.getByRole('button',{name:labels.respond})).toBeDisabled();
 expect(screen.getByLabelText(`${labels.text}: Company website`)).toHaveValue('Retain on uncertainty');
});
it('retains cancelled-version input and prevents blind retry',async()=>{
 const f=await fixture();const labels=en.Supplement;
 await f.service.publishSupplementRequest(f.staff,{requestId:f.request.id,expectedVersion:1,operationRequestId:randomUUID()});
 const request={...f.state.requests[0]};
 await f.service.cancelSupplementRequest(f.staff,{requestId:request.id,expectedVersion:request.version,operationRequestId:randomUUID(),reason:'Internal reason'});
 render(<SupplementResponseForm request={request} labels={labels} action={input=>f.service.respondToSupplementRequest({kind:'member',userId:'a',profileId:'a'},input)}/>);
 const text=screen.getByLabelText(`${labels.text}: Company website`);
 fireEvent.change(text,{target:{value:'Preserve across cancellation'}});
 fireEvent.click(screen.getByRole('button',{name:labels.respond}));
 expect(await screen.findByRole('alert')).toHaveTextContent(labels.conflict);
 expect(text).toHaveValue('Preserve across cancellation');
 expect(screen.getByRole('button',{name:labels.respond})).toBeDisabled();
 expect(f.state.responses).toHaveLength(0);
 expect(document.body.textContent).not.toContain('Internal reason');
});
it('exposes native labeled controls, bounded input and focus recovery for long mobile copy',async()=>{
 const f=await fixture();const labels=zh.Supplement;const label='公司網址及補充資料'.repeat(30);
 render(<SupplementResponseForm request={{...f.request,items:[{itemId:'website',label,required:true}]}} labels={labels} action={async()=>({status:'validation',reason:'invalid_answers'})}/>);
 const text=screen.getByRole('textbox',{name:`${labels.text}: ${label}`});
 expect(text).toHaveAttribute('maxlength','2000');expect(text).toHaveAttribute('aria-required','true');
 expect(screen.getByRole('textbox',{name:`${labels.url}: ${label}`})).toHaveAttribute('maxlength','2048');
 fireEvent.click(screen.getByRole('button',{name:labels.respond}));
 const alert=await screen.findByRole('alert');
 await new Promise(resolve=>setTimeout(resolve,40));
 expect(alert).toHaveFocus();
});
