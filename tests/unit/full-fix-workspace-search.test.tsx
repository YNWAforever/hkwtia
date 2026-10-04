import {render,screen,within} from "@testing-library/react";
import {describe,expect,it,vi} from "vitest";
import {WorkspaceSearchView,type WorkspaceSearchLabels} from "@/components/admin/workspace-search-view";
import {WorkQueueTable,type WorkQueueLabels} from "@/components/admin/work-queue-table";
import {AdminTopbar} from "@/components/admin/admin-topbar";
import {AdminUnsavedChangesProvider} from "@/components/admin/unsaved-changes-guard";
vi.mock("next/navigation",()=>({usePathname:()=>"/zh/admin/search"}));
vi.mock("next-intl",()=>({useTranslations:()=> (key:string)=>key}));
vi.mock("@/components/admin/admin-account-menu",()=>({AdminAccountMenu:()=>null}));
vi.mock("@/components/layout/locale-switcher",()=>({LocaleSwitcher:()=>null}));
const labels:WorkspaceSearchLabels={title:"Workspace search",description:"Search authorized records",query:"Search all records",submit:"Search",idle:"Enter a query",empty:"No matching records",invalid:"Check your search",denied:"Access denied",unavailable:"Search unavailable; retry",next:"Next results",first:"First results",members:"Search members only",kinds:{member:"Members",company:"Companies",application:"Applications",event:"Events",conversation:"Support conversations"}};
describe("workspace search UI recovery and navigation",()=>{
 it("keeps global and member search distinct and gives a bounded GET form",()=>{
  render(<WorkspaceSearchView locale="zh-HK" query="合成" state={{status:"idle"}} labels={labels}/>);
  const box=screen.getByRole("searchbox",{name:labels.query});expect(box).toHaveValue("合成");expect(box).toHaveAttribute("maxLength","120");
  expect(box.closest("form")).toHaveAttribute("action","/zh/admin/search");expect(box.closest("form")).toHaveAttribute("method","get");
  expect(screen.getByRole("link",{name:labels.members})).toHaveAttribute("href","/zh/admin/members");
  expect(screen.getByText(labels.idle)).toBeInTheDocument();
 });
 it.each(["empty","invalid","denied","unavailable"] as const)("uses a distinct %s recovery instead of fabricated zero counts",kind=>{
  const state=kind==='empty'?{status:"ready" as const,page:{items:[],nextCursor:null}}:{status:kind};
  render(<WorkspaceSearchView locale="en" query="Synthetic" state={state} labels={labels}/>);
  expect(screen.getByText(labels[kind])).toBeInTheDocument();expect(screen.queryByText("0")).not.toBeInTheDocument();
 });
 it("groups entities, escapes labels and keeps query/cursor through pagination with /zh",()=>{
  render(<WorkspaceSearchView locale="zh-HK" query="Synthetic & 合成" cursor="prior" state={{status:"ready",page:{items:[{kind:'member',id:'m1',label:'<script>synthetic</script>',href:'/admin/members/m1'},{kind:'application',id:'a1',label:'Synthetic case',href:'/admin/members/queue/a1'}],nextCursor:'next-safe'}}} labels={labels}/>);
  expect(screen.getByRole('heading',{name:labels.kinds.member})).toBeInTheDocument();
  expect(screen.getByRole('heading',{name:labels.kinds.application})).toBeInTheDocument();expect(document.querySelector('script')).toBeNull();
  expect(screen.getByRole('link',{name:'Synthetic case'})).toHaveAttribute('href','/zh/admin/members/queue/a1');
  const next=new URL(screen.getByRole('link',{name:labels.next}).getAttribute('href')!,'https://synthetic.example.test');expect(next.pathname).toBe('/zh/admin/search');expect(next.searchParams.get('q')).toBe('Synthetic & 合成');expect(next.searchParams.get('cursor')).toBe('next-safe');
  expect(new URL(screen.getByRole('link',{name:labels.first}).getAttribute('href')!,'https://synthetic.example.test').searchParams.has('cursor')).toBe(false);
 });
 it("offers a global-search entry in the existing topbar without replacing member search",()=>{
  render(<AdminUnsavedChangesProvider confirmMessage="Leave?"><AdminTopbar locale="zh-HK" identity="Synthetic Staff" role="staff" mobileTrigger={null}/></AdminUnsavedChangesProvider>);
  expect(screen.getByRole('link',{name:'shell.searchWorkspace'})).toHaveAttribute('href','/zh/admin/search');
  expect(screen.getByRole('link',{name:'shell.searchMembers'})).toHaveAttribute('href','/zh/admin/members');
 });
 it("empty mine has an explicit unassigned recovery inside the empty-state content",()=>{
  const qLabels={title:'Today',description:'Daily cases',mine:'Mine',unassigned:'Unassigned',all:'All',empty:'No work',emptyMine:'No assigned work; check unassigned cases',unavailable:'Work unavailable',summary:'Summary',owner:'Owner',due:'Due',nextAction:'Next action',overdue:'Overdue',assigned:'Assigned',noDue:'No due',next:'Next',first:'First',kinds:{},actions:{},states:{}} as unknown as WorkQueueLabels;
  render(<WorkQueueTable locale="zh-HK" scope="mine" cursor={null} page={{items:[],nextCursor:null}} labels={qLabels}/>);
  const recovery=screen.getByText('No assigned work; check unassigned cases').closest<HTMLElement>('[role="status"]')!;
  expect(within(recovery).getByRole('link',{name:'Unassigned'})).toHaveAttribute('href','/zh/admin?workScope=unassigned');
 });
});
