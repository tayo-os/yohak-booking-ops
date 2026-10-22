const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const crypto=require('node:crypto');
const root=__dirname;
const plain=x=>JSON.parse(JSON.stringify(x));
function environment(){
  const props={},cache={},data={requests:[],writes:0},allowed='operator@example.test';
  const bheaders=['BOOKING LINK (KEEP)','BOOKING STATUS','PAX (EDIT HERE)','TOUR','TOUR DATE','SELECT TRIP'];
  const gheaders=['BOOKING LINK (KEEP)','GUEST','STATUS','SERVICE INFO STATUS','UPDATED BY (GUIDE)','UPDATED AT (PHT)',
    'PASSENGER FULL NAME','AGE AT TOUR','GENDER','NATIONALITY','ALLERGIES','DIETARY REQUIREMENTS','SPECIAL REQUESTS'];
  const sheets={};
  function sheet(name,headers,rows,id){
    const grid=[[],[],headers,...rows];
    const s={grid,getName:()=>name,getSheetId:()=>id,getLastColumn:()=>headers.length,getLastRow:()=>grid.length,
      getRange:(row,col,nr=1,nc=1)=>({
        getValues:()=>Array.from({length:nr},(_,i)=>Array.from({length:nc},(_,j)=>grid[row+i-1]?.[col+j-1]??'')),
        getDisplayValues:()=>Array.from({length:nr},(_,i)=>Array.from({length:nc},(_,j)=>String(grid[row+i-1]?.[col+j-1]??'')))
      })};
    sheets[name]=s;return s;
  }
  data.b=sheet('Bookings',bheaders,[['TEST-BOOKING','CONFIRMED',4,'Test tour',new Date('2099-11-20T00:00:00Z'),'TEST-TRIP']],1);
  data.g=sheet('All Guests',gheaders,Array.from({length:4},(_,i)=>['TEST-BOOKING',i+1,'ACTIVE','','','','','','','','','','']),2);
  sheets['10 Products']={getRange:()=>({getValues:()=>[['P1','Test tour']]})};
  data.departure=['TEST-TRIP','COMPANY','P1',new Date('2099-11-20T00:00:00Z'),new Date('2099-11-21T00:00:00Z'),'READY_FOR_REVIEW'];
  sheets['11 Departures']={getRange:()=>({getValues:()=>[data.departure]})};
  data.audit=[];
  sheets['Guest Intake Audit']={getLastRow:()=>data.audit.length+1,getSheetId:()=>3,getRange:()=>({getValues:()=>data.audit})};
  data.ss={getName:()=> 'Synthetic STAGING',getId:()=> 'synthetic-id',getSpreadsheetTimeZone:()=> 'Asia/Manila',getSheetByName:n=>sheets[n]};
  data.email=allowed;data.private=true;data.locked=false;data.failBatch=false;
  props.YGP_ENABLED='true';props.YGP_SPREADSHEET_ID='synthetic-id';props.YGP_PRIVACY_NOTICE='Test-only privacy notice';props.YGP_STAFF_EMAILS=allowed;
  const store={getProperty:k=>props[k]??null,setProperty:(k,v)=>{props[k]=v;},deleteProperty:k=>delete props[k]};
  const ctx={
    console,Date,JSON,Error,Number,String,Object,Array,Math,
    Session:{getActiveUser:()=>({getEmail:()=>data.email})},
    PropertiesService:{getScriptProperties:()=>store},
    SpreadsheetApp:{openById:()=>data.ss,flush:()=>{}},
    DriveApp:{Access:{PRIVATE:'PRIVATE'},getFileById:()=>({getSharingAccess:()=>data.private?'PRIVATE':'ANYONE'})},
    CacheService:{getScriptCache:()=>({get:k=>cache[k],put:(k,v)=>{cache[k]=v;}})},
    LockService:{getScriptLock:()=>({tryLock:()=>!data.locked,releaseLock:()=>{},waitLock:()=>{}})},
    Utilities:{
      DigestAlgorithm:{SHA_256:'SHA_256'},Charset:{UTF_8:'UTF_8'},
      computeDigest:(_,s)=>Array.from(crypto.createHash('sha256').update(s).digest()),
      formatDate:(d,tz,fmt)=>fmt==='yyyy-MM-dd'?d.toISOString().slice(0,10):d.toISOString(),
      getUuid:()=>crypto.randomUUID()
    },
    Sheets:{Spreadsheets:{batchUpdate:({requests})=>{
      if(data.failBatch)throw Error('Synthetic provider failure: confidential-provider-detail');
      data.writes++;data.requests=requests;
      for(const r of requests){
        if(r.updateCells){const a=r.updateCells;const target=Object.values(sheets).find(s=>s.getSheetId&&s.getSheetId()===a.range.sheetId);
          const val=a.rows[0].values[0].userEnteredValue;
          target.grid[a.range.startRowIndex][a.range.startColumnIndex]=val.stringValue??val.numberValue;
        } else if(r.appendCells) data.audit.push(r.appendCells.rows[0].values.map(v=>v.userEnteredValue.stringValue??v.userEnteredValue.numberValue));
      }
    }}}
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(root+'/BookingOps.gs','utf8')+'\n'+fs.readFileSync(root+'/GuestPortal.gs','utf8'),ctx);
  const id='a'.repeat(32),secret='b'.repeat(64),token=id+'.'+secret;
  props['YGP_TOKEN_'+id]=JSON.stringify({ref:'TEST-BOOKING',hash:ctx.ygpHash_(secret),expires:Date.now()+600000});
  data.record=changes=>props['YGP_TOKEN_'+id]=JSON.stringify({...JSON.parse(props['YGP_TOKEN_'+id]),...changes});
  data.props=props;return {ctx,data,token};
}
function people(n=4){return Array.from({length:n},(_,i)=>({number:i+1,name:'Synthetic Guest '+(i+1),age:'25',gender:'F',nationality:'Test nationality',allergies:'None',dietary:'None',requests:''}));}
function payload(e,extra={}){return {revision:e.ctx.yohakGuestLoad(e.token).data.revision,requestId:crypto.randomUUID(),acknowledged:true,submit:true,guests:people(),...extra};}

test('token required; guessing a booking reference gives no access',()=>{const e=environment();assert.equal(e.ctx.yohakGuestLoad('TEST-BOOKING').ok,false);});
test('unknown token gives no access',()=>{const e=environment();assert.equal(e.ctx.yohakGuestLoad('c'.repeat(32)+'.'+'b'.repeat(64)).ok,false);});
test('wrong secret gives no access',()=>{const e=environment();assert.equal(e.ctx.yohakGuestLoad('a'.repeat(32)+'.'+'c'.repeat(64)).ok,false);});
for(const [label,change] of [['expired',{expires:1}],['revoked',{revoked:true}],['manifest-locked',{locked:true}]]){
  test(label+' token blocks reads and writes',()=>{const e=environment();const p=payload(e);e.data.record(change);assert.equal(e.ctx.yohakGuestLoad(e.token).ok,false);assert.equal(e.ctx.yohakGuestSave(e.token,p).ok,false);assert.equal(e.data.writes,0);});
}
test('disabled gate blocks intake',()=>{const e=environment();e.data.props.YGP_ENABLED='false';assert.equal(e.ctx.yohakGuestLoad(e.token).ok,false);});
test('public workbook blocked',()=>{const e=environment();e.data.private=false;assert.equal(e.ctx.yohakGuestLoad(e.token).ok,false);});
test('privacy notice required',()=>{const e=environment();delete e.data.props.YGP_PRIVACY_NOTICE;assert.equal(e.ctx.yohakGuestLoad(e.token).ok,false);});
test('non-staging workbook blocked',()=>{const e=environment();e.data.ss.getName=()=> 'Production';assert.equal(e.ctx.yohakGuestLoad(e.token).ok,false);});
test('anonymous visitor cannot use staff functions',()=>{const e=environment();e.data.email='';for(const fn of ['yohakInstallStaging','yohakSyncSelectedBooking','yohakPrepareGuestPortal','yohakCreateGuestLink','yohakRevokeGuestLink','yohakLockGuestDetails'])assert.throws(()=>e.ctx[fn](),/Staff access/);});
test('unlisted signed-in visitor cannot use staff functions',()=>{const e=environment();e.data.email='visitor@example.test';assert.throws(()=>e.ctx.ygpStaff_(),/Staff access/);});
test('four pax exposes only four assigned guest slots, not finances',()=>{const e=environment();const m=e.ctx.yohakGuestLoad(e.token).data;assert.equal(m.guests.length,4);assert.equal(m.guests[0].name,'');assert.equal('payment' in m,false);assert.equal('row' in m.guests[0],false);});
test('successful submission updates existing four rows and audit atomically',()=>{const e=environment();const p=payload(e);const r=e.ctx.yohakGuestSave(e.token,p);assert.equal(r.ok,true);assert.equal(e.data.writes,1);assert.equal(e.data.g.grid.length,7);assert.equal(e.data.audit.length,1);assert.equal(e.data.audit[0][4],4);assert.equal(r.data.guests[3].name,'Synthetic Guest 4');});
test('retry does not create rows or duplicate receipts',()=>{const e=environment();const p=payload(e);assert.equal(e.ctx.yohakGuestSave(e.token,p).ok,true);assert.equal(e.ctx.yohakGuestSave(e.token,p).duplicate,true);assert.equal(e.data.writes,1);});
test('partial save is permitted; final submit requires completion',()=>{const e=environment();const guests=people();guests[3].name='';assert.equal(e.ctx.yohakGuestSave(e.token,payload(e,{guests})).ok,false);assert.equal(e.ctx.yohakGuestSave(e.token,payload(e,{guests,submit:false})).ok,true);});
test('stale revision blocks overwriting a staff change',()=>{const e=environment();const p=payload(e);e.data.g.grid[3][6]='Staff correction';assert.equal(e.ctx.yohakGuestSave(e.token,p).ok,false);assert.equal(e.data.writes,0);});
test('pax increase without slots requires synchronization',()=>{const e=environment();e.data.b.grid[3][2]=5;assert.equal(e.ctx.yohakGuestLoad(e.token).ok,false);});
test('pax decrease rejects previously loaded form',()=>{const e=environment();const p=payload(e);e.data.b.grid[3][2]=3;assert.equal(e.ctx.yohakGuestSave(e.token,p).ok,false);});
test('inactive slot and duplicate slot block intake',()=>{const e=environment();e.data.g.grid[3][2]='EXCESS - REVIEW';assert.equal(e.ctx.yohakGuestLoad(e.token).ok,false);e.data.g.grid[3][2]='ACTIVE';e.data.g.grid[4][1]=1;assert.equal(e.ctx.yohakGuestLoad(e.token).ok,false);});
test('duplicate booking reference blocks access',()=>{const e=environment();e.data.b.grid.push([...e.data.b.grid[3]]);assert.equal(e.ctx.yohakGuestLoad(e.token).ok,false);});
for(const status of ['PENCIL','CANCELLED','COMPLETED'])test(status+' booking blocks guest access',()=>{const e=environment();e.data.b.grid[3][1]=status;assert.equal(e.ctx.yohakGuestLoad(e.token).ok,false);});
test('wrong product/date or departed trip blocked',()=>{const e=environment();e.data.departure[2]='OTHER';assert.equal(e.ctx.yohakGuestLoad(e.token).ok,false);e.data.departure[2]='P1';e.data.departure[5]='DEPARTED';assert.equal(e.ctx.yohakGuestLoad(e.token).ok,false);});
test('server rejects fields outside the passenger allowlist',()=>{const e=environment();const p=payload(e);p.guests[0].bookingStatus='CONFIRMED';assert.equal(e.ctx.yohakGuestSave(e.token,p).ok,false);assert.equal(e.data.writes,0);});
test('foreign passenger number rejected',()=>{const e=environment();const p=payload(e);p.guests[3].number=99;assert.equal(e.ctx.yohakGuestSave(e.token,p).ok,false);});
test('age zero accepted; fractions, negative and >120 rejected',()=>{const e=environment();for(const age of ['-1','1.5','121']){const p=payload(e);p.guests[0].age=age;assert.equal(e.ctx.yohakGuestSave(e.token,p).ok,false);}const p=payload(e);p.guests[0].age='0';assert.equal(e.ctx.yohakGuestSave(e.token,p).ok,true);});
test('formula-like strings are written as stringValue, never formulaValue',()=>{const e=environment();const p=payload(e);p.guests[0].name='=IMPORTXML("https://example.test","x")';assert.equal(e.ctx.yohakGuestSave(e.token,p).ok,true);assert(e.data.requests.every(r=>!r.updateCells||!('formulaValue' in r.updateCells.rows[0].values[0].userEnteredValue)));assert.equal(e.data.g.grid[3][6],p.guests[0].name);});
test('missing acknowledgement blocked',()=>{const e=environment();assert.equal(e.ctx.yohakGuestSave(e.token,payload(e,{acknowledged:false})).ok,false);});
test('concurrent script save blocked',()=>{const e=environment();const p=payload(e);e.data.locked=true;assert.equal(e.ctx.yohakGuestSave(e.token,p).ok,false);});
test('provider failure returns no secret and no success receipt',()=>{const e=environment();const p=payload(e);e.data.failBatch=true;const r=e.ctx.yohakGuestSave(e.token,p);assert.equal(r.ok,false);assert(!r.message.includes('confidential'));assert.equal(e.data.audit.length,0);});
test('all source files parse under JavaScript syntax',()=>{for(const f of ['BookingOps.gs','GuestPortal.gs'])new vm.Script(fs.readFileSync(root+'/'+f,'utf8'));});
test('trip match keeps a valid explicit selection among multiple departures',()=>{const e=environment();assert.equal(e.ctx.yohakResolveTrip_('B',[['A'],['B']]),'B');});
test('trip match clears an old unmatched trip and never guesses among departures',()=>{const e=environment();assert.equal(e.ctx.yohakResolveTrip_('OLD',[['A'],['B']]),'');assert.equal(e.ctx.yohakResolveTrip_('OLD',[]),'');assert.equal(e.ctx.yohakResolveTrip_('OLD',[['NEW']]),'NEW');});
test('clearing trip preserves intended tour and date',()=>{const e=environment();const writes=[];const b={getRange:(r,c)=>({setValue:v=>writes.push([c,v]),clearContent:()=>writes.push([c,''])})};e.ctx.yohakClearTrip_(b,4,{'TOUR DATE':2,TOUR:4,'SELECT TRIP':1},['ref','old','2099-11-20','contact','New tour']);assert.deepEqual(writes,[[3,'2099-11-20'],[5,'New tour'],[2,'']]);});
