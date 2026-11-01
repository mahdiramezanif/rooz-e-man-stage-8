const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const home=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(home,'index.html'),'utf8');
const js=fs.readFileSync(path.join(home,'app.js'),'utf8');
const nav=fs.readFileSync(path.join(home,'ui-v8.js'),'utf8');
const workflow=fs.readFileSync(path.join(home,'.github/workflows/build-apk.yml'),'utf8');
for (const page of ['home','planner','reminders','baskets','diary','exercise','language','notifications','settings']) {
  assert.ok(html.includes(`data-page="${page}"`),`Missing page ${page}`);
}
for(const file of ['index.html','app.js','styles.css','sw.js','ui-v8.css','ui-v8.js','manifest.webmanifest']){
 assert.deepEqual(fs.readFileSync(path.join(home,file)),fs.readFileSync(path.join(home,'android/app/src/main/assets',file)),`Native asset mismatch: ${file}`);
}
assert.ok(js.includes('version: 8'),'backup version');
assert.ok(js.includes('6, 7, 8].includes(raw.version)'),'v8 import');
assert.ok(html.includes('id="newTaskHero"'),'existing action is preserved');
assert.ok(nav.includes('history.pushState'),'mobile navigation history');
assert.ok(workflow.includes('workflow_dispatch:'),'manual build enabled');
assert.ok(workflow.includes('setup-android@v4'),'SDK fix retained');
console.log('Passed: stage 8 navigation, versioning, native assets and workflow checks');
const old=JSON.parse(JSON.stringify({app:'rooz-e-man',version:7,tasks:[],reminders:[],basketTasks:[],diaryEntries:[],exerciseSessions:[],languageSessions:[]}));
const vm=require('node:vm');
const code=js.replace(/\nmain\(\);\s*$/,'');
const ctx={console,Date,Intl,Math,Number,String,Set,Array,RegExp,globalThis:{},window:{},document:{getElementById:()=>({}),querySelectorAll:()=>[]},setTimeout(){},clearTimeout(){},setInterval(){}};
vm.createContext(ctx);vm.runInContext(code,ctx);
ctx.data=old;
assert.equal(vm.runInContext('validateBackup(data).version',ctx),7,'Existing v7 backup must remain readable');
ctx.data={...old,version:8};
assert.equal(vm.runInContext('validateBackup(data).version',ctx),8,'v8 backup must be readable');
console.log('Passed: stage 8 import/export versions and old-data compatibility');
