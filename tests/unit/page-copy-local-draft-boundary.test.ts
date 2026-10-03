import {beforeEach,describe,expect,it} from 'vitest';
import {discardLocalCopyDraft,localCopyDraftKey,readLocalCopyDraft,writeLocalCopyDraft,type LocalCopyDraft} from '@/lib/admin/page-copy-local-draft';
const now=Date.parse('2026-10-01T04:00:00Z');
const key=localCopyDraftKey('synthetic-editor','Home');const allowed=new Set(['copy:en:hero.title','copy:zh-HK:hero.title']);
const draft:LocalCopyDraft={schemaVersion:1,namespace:'Home',baseRevision:'a'.repeat(64),updatedAt:new Date(now).toISOString(),changes:{'copy:en:hero.title':'Synthetic English','copy:zh-HK:hero.title':'合成文字'}};
beforeEach(()=>sessionStorage.clear());
describe('local CMS draft storage boundary',()=>{
 it('round trips only allowed bilingual strings and partitions identity/namespace',()=>{
 expect(writeLocalCopyDraft(sessionStorage,key,draft,allowed)).toBe(true);expect(readLocalCopyDraft(sessionStorage,key,'Home',allowed,now)).toEqual({status:'available',draft});
 expect(localCopyDraftKey('synthetic-editor-b','Home')).not.toBe(key);expect(localCopyDraftKey('synthetic-editor','About')).not.toBe(key);
 expect(discardLocalCopyDraft(sessionStorage,key)).toBe(true);expect(readLocalCopyDraft(sessionStorage,key,'Home',allowed,now)).toEqual({status:'missing'});
 });
 it('rejects actual hostile shapes and expired drafts instead of silently restoring them',()=>{
 const hostile=[{...draft,changes:{token:'DO_NOT_STORE'}},{...draft,changes:{'copy:en:hero.title':42}},{...draft,namespace:'About'},{...draft,updatedAt:new Date(now-86_400_001).toISOString()},{...draft,updatedAt:new Date(now+60_001).toISOString()},{...draft,baseRevision:'unknown'},{...draft,schemaVersion:2},{...draft,changes:{}}];
 expect(hostile.length).toBeGreaterThanOrEqual(8);
 for(const sample of hostile){sessionStorage.setItem(key,JSON.stringify(sample));expect(readLocalCopyDraft(sessionStorage,key,'Home',allowed,now)).toEqual({status:'missing'});expect(sessionStorage.getItem(key)).toBeNull();}
 expect(writeLocalCopyDraft(sessionStorage,key,{...draft,changes:{secret:'DO_NOT_STORE'}},allowed)).toBe(false);
 });
 it('reports denied read/write/remove and malformed JSON without inventing success',()=>{
 const denied={getItem:()=>{throw Error('denied');},setItem:()=>{throw Error('denied');},removeItem:()=>{throw Error('denied');}};
 expect(readLocalCopyDraft(denied,key,'Home',allowed,now)).toEqual({status:'unavailable'});expect(writeLocalCopyDraft(denied,key,draft,allowed)).toBe(false);expect(discardLocalCopyDraft(denied,key)).toBe(false);
 sessionStorage.setItem(key,'broken-json');expect(readLocalCopyDraft(sessionStorage,key,'Home',allowed,now).status).not.toBe('available');
 });
});
