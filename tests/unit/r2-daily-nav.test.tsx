import {render,screen,cleanup} from '@testing-library/react';
import {afterEach,it,expect} from 'vitest';
import {DashboardTiles} from '@/components/admin/dashboard-tiles';
import en from '@/messages/en.json';
import zh from '@/messages/zh-HK.json';
afterEach(cleanup);
for(const [locale,messages,prefix] of [['en',en,''],['zh-HK',zh,'/zh']] as const) it(`offers submitted work directly in ${locale}`,()=>{
 render(<DashboardTiles locale={locale} tiles={[]} labels={messages.Admin.dashboard}/>);
 expect(screen.getByRole('link',{name:messages.Admin.dashboard.submittedApplications})).toHaveAttribute('href',`${prefix}/admin/members/queue?status=submitted`);
 expect(screen.getByRole('link',{name:messages.Admin.dashboard.applicationQueue})).toHaveAttribute('href',`${prefix}/admin/members/queue`);
});
