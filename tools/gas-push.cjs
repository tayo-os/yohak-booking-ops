const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
const config=JSON.parse(fs.readFileSync(path.join(root,'.clasp.json'),'utf8'));
const approved=JSON.parse(fs.readFileSync(path.join(root,'.local/staging-target.json'),'utf8'));
if(config.scriptId!==approved.scriptId||approved.environment!=='STAGING')throw Error('Staging target mismatch; refusing to push.');
if(config.rootDir!=='.')throw Error('Unexpected clasp rootDir.');
const apply=process.argv.includes('--apply');
const run=(exe,args,cwd=root)=>{const p=cp.spawnSync(exe,args,{cwd,stdio:'inherit'});if(p.status!==0)process.exit(p.status||1);};
run(process.execPath,['test.cjs']);
run(process.execPath,['--test','portal.test.cjs']);
run(process.execPath,['--test','booking-entry.test.cjs']);
const clasp=path.join(root,'node_modules/.bin/clasp');
console.log('Target script:',config.scriptId);
run(clasp,['show-file-status']);
if(!apply){console.log('Review the target and changed files. Nothing pushed. Use npm run gas:push -- --apply after backing up the existing Google project.');process.exit(0);}
// Save a separate remote backup before any upload. Never pull over the working source.
const backup=path.join(root,'.local','backup-'+Date.now());fs.mkdirSync(backup,{recursive:true,mode:0o700});
fs.writeFileSync(path.join(backup,'.clasp.json'),JSON.stringify({scriptId:config.scriptId,rootDir:'.'}),{mode:0o600});
run(clasp,['pull'],backup);
const allowed=new Set(['.clasp.json','appsscript.json','Code.js','Code.gs','BookingOps.js','BookingOps.gs','BookingEntry.gs','BookingEntry.js','GuestPortal.js','GuestPortal.gs','GuestPortal.html']);
const unknown=fs.readdirSync(backup).filter(f=>!allowed.has(f));
if(unknown.length)throw Error('Remote project contains additional files. Merge them deliberately before pushing: '+unknown.join(', '));
for(const legacy of ['Code.js','Code.gs']){
  const file=path.join(backup,legacy);
  if(fs.existsSync(file)&&!fs.readFileSync(file,'utf8').includes('function yohakInstallStaging()'))throw Error('Unrecognised legacy Code file. Refusing replacement.');
}
console.log('Private remote backup created under .local. Uploading staging source only; no deployment is published.');
run(clasp,['push']);
console.log('Source pushed. Review scopes, run staging setup/tests, then explicitly update the web-app deployment. Production is not activated.');
