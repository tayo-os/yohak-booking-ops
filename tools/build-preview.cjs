const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'preview');
fs.mkdirSync(dir,{recursive:true});
const source=fs.readFileSync(path.join(root,'GuestPortal.html'),'utf8');
// Preview deliberately has no backend, real booking, token or credential.
fs.writeFileSync(path.join(dir,'index.html'),source.replace("new URLSearchParams(location.search).get('demo')==='1'","true"));
console.log('Built isolated synthetic-data preview.');
