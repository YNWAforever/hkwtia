// @vitest-environment node
import {spawnSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {createTranslator} from 'next-intl';
import {afterEach, describe, expect, it} from 'vitest';
import en from '@/messages/en.json';
import zh from '@/messages/zh-HK.json';

const corruptKeys = ['eyebrow','title','description','filters','preview','tier','status','scoreMin','scoreMax','renewalWithinDays','sector','lastLoginBeforeDays','nameEn','nameZh','corporate','startup','community','patron','active','pastDue','pendingReview','caption','total','empty','name','email','company','plan','renewal','score','unavailable','saved','export'] as const;
const script = resolve('scripts/audit-visible-strings.mjs');
const directories: string[] = [];
afterEach(() => {for (const directory of directories.splice(0)) rmSync(directory, {recursive:true, force:true});});
function audit(english: Record<string,unknown>, chinese = english) {
  const cwd=mkdtempSync(join(tmpdir(),'hkwtia-translation-'));directories.push(cwd);
  mkdirSync(join(cwd,'messages'));
  writeFileSync(join(cwd,'messages/en.json'),JSON.stringify(english));
  writeFileSync(join(cwd,'messages/zh-HK.json'),JSON.stringify(chinese));
  const result=spawnSync(process.execPath,[script],{cwd,encoding:'utf8'});
  expect(result.error).toBeUndefined();
  return {status:result.status,output:result.stdout+result.stderr};
}

describe('full remediation translation quality', () => {
  it('renders readable Traditional Chinese for all 33 previously corrupted segment controls', () => {
    expect(corruptKeys).toHaveLength(33);
    const translate=createTranslator({locale:'zh-HK',messages:zh,namespace:'Admin.segments'});
    for(const key of corruptKeys) {
      const text=translate(key);
      expect(text,key).toMatch(/\p{Script=Han}/u);
      expect(text,key).not.toMatch(/\?{2,}|\uFFFD/);
      const tokens=(value:string)=>[...value.matchAll(/\{([A-Za-z_]\w*)\s*[,}]/g)].map(match=>match[1]).sort();
      expect(tokens(zh.Admin.segments[key]),key).toEqual(tokens(en.Admin.segments[key]));
    }
  });
  it.each([
    ['????','CORRUPT_PLACEHOLDER'],
    ['Member \uFFFD name','REPLACEMENT_CHARACTER'],
    ['   ','EMPTY_LABEL'],
  ])('fails the actual audit command for corrupt value %j', (value,reason) => {
    const result=audit({Admin:{segments:{title:value}}});
    expect(result.status).toBe(1);
    expect(result.output).toContain('Admin.segments.title');
    expect(result.output).toContain(reason);
  });
  it('allows legitimate single question marks and URL queries', () => {
    const result=audit({Support:{title:'Need help?',url:'https://example.test/?q=member&next=%2F'}});
    expect(result.status).toBe(0);
  });
  it('does not bypass broken labels merely because another label contains a URL', () => {
    const result=audit({Support:{url:'https://example.test/?q=member',title:'?? Help'}});
    expect(result.status).toBe(1);
    expect(result.output).toContain('CORRUPT_PLACEHOLDER');
  });
  it('rejects an empty message discovery rather than passing vacuously', () => {
    const result=audit({});
    expect(result.status).toBe(1);expect(result.output).toContain('EMPTY_BUNDLE');
  });
  it('checks leaf keys and interpolation tokens in the same audit command', () => {
    const missing=audit({Label:{name:'Name',total:'{count} members'}},{Label:{name:'名稱'}});
    expect(missing.status).toBe(1);expect(missing.output).toContain('MISSING_KEY');
    const tokens=audit({Label:{total:'{count} members'}},{Label:{total:'{total} 位會員'}});
    expect(tokens.status).toBe(1);expect(tokens.output).toContain('TOKEN_MISMATCH');
  });
});
