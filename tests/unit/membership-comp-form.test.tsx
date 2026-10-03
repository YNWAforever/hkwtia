import {render,screen} from '@testing-library/react';
import {describe,expect,it} from 'vitest';
import {MembershipCompForm} from '@/components/admin/membership-comp-form';
const labels={title:'Special membership',description:'Use the finite grant workflow; use payment reconciliation for paid orders.',planLabel:'Plan',submit:'Grant membership'};
describe('retired indefinite grant form',()=>{
 it('explains recovery without exposing the retired write controls',()=>{
  render(<MembershipCompForm action={async()=>({})} labels={labels} profileId='synthetic'/>);
  expect(screen.getByRole('heading',{name:labels.title})).toBeInTheDocument();
  expect(screen.getByText(labels.description)).toBeInTheDocument();
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  expect(screen.queryByRole('button',{name:'Grant membership'})).not.toBeInTheDocument();
 });
});
