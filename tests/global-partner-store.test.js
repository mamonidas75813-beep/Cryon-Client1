import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { GlobalPartnerStore, validateGlobalPartners } from '../modules/partners/global-partner-store.js';
const url = 'https://example.test/partner-feed/partners.json';
const one = {id:'first',name:'First MC',address:'play.first.example',logo:'first.png'};
const two = {id:'second',name:'Second MC',address:'play.second.example'};
const seed = {id:'seed',name:'Seed MC',address:'seed.example'};
const image = await fs.readFile(new URL('../assets/partner-servers/solvane-mc-64.png', import.meta.url));
async function setup(t, source = url) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'cryon-global-'));
  t.after(() => fs.rm(root,{recursive:true,force:true}));
  const seedFile = path.join(root,'seed.json'), sourceFile = path.join(root,'source.json');
  await fs.writeFile(seedFile,JSON.stringify([seed])); await fs.writeFile(sourceFile,JSON.stringify({url:source}));
  let data = [one], offline = false, now = 0, calls = [], badImage = false;
  const fetcher = async (target, options) => {
    calls.push(target); assert.equal(options.redirect,'error');
    if (offline) throw new Error('network unavailable');
    if (target === url) return new Response(JSON.stringify(data));
    if (target === new URL('images/first.png',url).href) return new Response(badImage ? 'not a png' : image);
    return new Response('',{status:404});
  };
  const make = (name='alice') => new GlobalPartnerStore({directory:path.join(root,name,'global-partners'),seedFile,sourceFile,bundledAssets:root,fetcher,now:()=>now});
  return {root, make, calls, setData: value=>{data=value;}, offline: value=>{offline=value;}, tick:()=>{now+=60000;}, badImage:()=>{badImage=true;}};
}
test('two separate user installations receive identical remote additions, edits and removals', async t=>{
  const f=await setup(t), a=f.make(), b=f.make('bob');
  assert.deepEqual((await a.refresh()).partners.map(p=>p.id),['first']);
  assert.deepEqual((await b.refresh()).partners.map(p=>p.id),['first']);
  f.setData([{...one,name:'Edited MC'},two]); f.tick();
  for(const store of [a,b]) assert.deepEqual((await store.refresh()).partners.map(p=>p.name),['Edited MC','Second MC']);
  f.setData([two]); f.tick();
  for(const store of [a,b]) assert.deepEqual((await store.refresh()).partners.map(p=>p.id),['second']);
});
test('offline restart restores last valid online list and ignores old local config',async t=>{
  const f=await setup(t), a=f.make(); await a.refresh();
  await fs.mkdir(path.join(f.root,'alice','partners'),{recursive:true});
  await fs.writeFile(path.join(f.root,'alice','partners','partners.json'),JSON.stringify([two]));
  f.offline(true); const result=await f.make().refresh();
  assert.equal(result.source,'cache'); assert.equal(result.partners[0].id,'first'); assert.match(result.error,/last synced/);
});
test('invalid remote updates do not replace cache; valid empty list does',async t=>{
  const f=await setup(t), a=f.make(); await a.refresh();
  f.setData([one,{...one,id:'other'}]); f.tick(); assert.equal((await a.refresh()).source,'cache'); assert.equal(a.partners.length,1);
  f.setData([]); f.tick(); assert.deepEqual((await a.refresh()).partners,[]);
  f.offline(true); assert.deepEqual((await f.make().refresh()).partners,[]);
});
test('background refresh throttles, manual refresh bypasses, concurrent requests coalesce',async t=>{
  const f=await setup(t), a=f.make(); await Promise.all([a.refresh(),a.refresh(true)]); assert.equal(f.calls.length,1);
  f.setData([two]); await a.refresh(); assert.equal(a.partners[0].id,'first');
  await a.refresh(true); assert.equal(a.partners[0].id,'second'); assert.equal(f.calls.length,2);
});
test('first offline run falls back to bundled seed; no source is explicit',async t=>{
  const f=await setup(t); f.offline(true); const result=await f.make().refresh(); assert.equal(result.source,'bundled'); assert.equal(result.partners[0].id,'seed');
  const unconfigured=await setup(t,''); const blank=await unconfigured.make().refresh(); assert.match(blank.error,/not configured/); assert.equal(unconfigured.calls.length,0);
});
test('remote images use feed-relative URL and cached image survives offline restart',async t=>{
  const f=await setup(t), a=f.make(); await a.refresh(); assert.deepEqual(await a.imageBytes('first.png'),image);
  assert.equal(await a.imageBytes('../secret.png'),null); assert.equal(await a.imageBytes('other.png'),null);
  f.offline(true); const next=f.make(); await next.refresh(); assert.deepEqual(await next.imageBytes('first.png'),image);
});
test('invalid image is ignored without losing the partner',async t=>{
  const f=await setup(t), a=f.make(); f.badImage(); await a.refresh(); assert.equal(await a.imageBytes('first.png'),null); assert.equal(a.partners.length,1);
});
test('validates duplicate, invalid address and unsafe filenames',()=>{
  assert.throws(()=>validateGlobalPartners([one,one])); assert.throws(()=>validateGlobalPartners([{...one,address:'https://example.com'}])); assert.throws(()=>validateGlobalPartners([{...one,logo:'../bad.png'}])); assert.throws(()=>validateGlobalPartners([null]));
});
test('rejects non HTTPS or indirect source URLs without fetching',async t=>{
  const f=await setup(t,'http://example.test/partners.json'); const result=await f.make().refresh(); assert.match(result.error,/HTTPS/); assert.equal(f.calls.length,0);
});
test('official edit handlers and editor are absent from runtime',async()=>{
  for(const file of ['src/main.js','src/preload.cjs','src/renderer/app.js','src/renderer/index.html']) {
    const contents=await fs.readFile(new URL('../'+file,import.meta.url),'utf8');
    assert.doesNotMatch(contents,/partner-servers:save-featured|partner-servers:remove-featured|saveFeaturedPartner|removeFeaturedPartner|featured-partner-form/);
  }
});
