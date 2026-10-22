const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function env(){const c={Date,console};vm.createContext(c);for(const f of ['BookingOps.gs','GuestPortal.gs','BookingEntry.gs'])vm.runInContext(fs.readFileSync(__dirname+'/'+f,'utf8'),c);return c;}
const input=()=>({contact:'Test Booker',email:'test@example.test',phone:'',tour:'Test Tour',date:'2099-11-20',pax:4,source:'DIRECT',channel:'WHATSAPP',status:'PENCIL',total:10000,paid:'',partner:'',trip:'',notes:'',requestId:'a1234567-b123-c123-d123-abcdefghijkl'});
test('valid four pax preserves unknown paid, not zero',()=>{assert.equal(env().yohakBookingInput_(input()).paid,'');});
test('confirmed is not an accepted intake status',()=>{assert.throws(()=>env().yohakBookingInput_({...input(),status:'CONFIRMED'}));});
test('at least one contact route is required',()=>{assert.throws(()=>env().yohakBookingInput_({...input(),email:''}));});
test('country-coded phone can replace email',()=>{assert.equal(env().yohakBookingInput_({...input(),email:'',phone:'+639000000000'}).phone,'+639000000000');});
test('local phone without country code is rejected',()=>{assert.throws(()=>env().yohakBookingInput_({...input(),phone:'09000000000'}));});
test('bad email rejected',()=>{assert.throws(()=>env().yohakBookingInput_({...input(),email:'invalid'}));});
test('invalid dates rejected rather than normalised',()=>{assert.throws(()=>env().yohakBookingInput_({...input(),date:'2099-02-31'}));});
test('invalid pax rejected',()=>{for(const pax of [0,-1,1.5,101,'4'])assert.throws(()=>env().yohakBookingInput_({...input(),pax}));});
test('partner attribution required',()=>{assert.throws(()=>env().yohakBookingInput_({...input(),source:'PARTNER'}));});
test('manual form cannot spoof website source',()=>{assert.throws(()=>env().yohakBookingInput_({...input(),source:'WEBSITE'}));});
test('paid zero remains explicit zero',()=>{assert.equal(env().yohakBookingInput_({...input(),paid:0}).paid,0);});
test('overpayment, negative and nonnumeric amounts rejected',()=>{for(const paid of [-1,10001,'paid',NaN])assert.throws(()=>env().yohakBookingInput_({...input(),paid}));});
test('request identity required',()=>{assert.throws(()=>env().yohakBookingInput_({...input(),requestId:''}));});
test('anonymous staff actions blocked',()=>{const c=env();c.Session={getActiveUser:()=>({getEmail:()=>''})};for(const f of ['yohakNewBookingForm','yohakCreateBookingFromForm'])assert.throws(()=>c[f](),/Staff access/);});
test('atomic plan links four distinct blank slots to same reference and one receipt',()=>{
  const c=env(),p={bookingSheet:1,guestSheet:2,auditSheet:3,formSheet:4,bookingRow:10,guestRows:[20,21,22,23],
    bm:{'BOOKING LINK (KEEP)':0,'BOOKING CONTACT':3},gm:{'BOOKING LINK (KEEP)':1,GUEST:2,STATUS:8,'INTERNAL NOTE':14,'SERVICE INFO STATUS':25},
    bookingFormulaCols:[10],guestFormulaCols:[0,9],values:{'BOOKING LINK (KEEP)':'TEST-1','BOOKING CONTACT':'=1+1'},
    ref:'TEST-1',requestId:'test',fingerprint:'hash',time:'time',actor:'operator@example.test',pax:4};
  const r=JSON.parse(JSON.stringify(c.yohakBookingRequests_(p))),writes=r.filter(x=>x.updateCells).map(x=>x.updateCells);
  assert.equal(r.filter(x=>x.appendCells).length,1);
  assert.deepEqual(writes.filter(x=>x.range.sheetId===2&&x.range.startColumnIndex===2).map(x=>x.rows[0].values[0].userEnteredValue.numberValue),[1,2,3,4]);
  assert.equal(writes.filter(x=>x.range.sheetId===2&&x.range.startColumnIndex===1).length,4);
  assert.equal(writes.find(x=>x.range.sheetId===1&&x.range.startColumnIndex===3).rows[0].values[0].userEnteredValue.stringValue,'=1+1');
  assert.equal(writes.filter(x=>x.range.sheetId===2&&x.range.startColumnIndex===3).length,0);
  assert.equal(writes.filter(x=>x.range.sheetId===4).length,1);
});
function replayEnv(conflict=false){
  const c=env(),x=input(),clean=c.yohakBookingInput_(x);
  const vals=[x.contact,x.email,x.phone,x.tour,x.date,x.pax,x.source,x.channel,x.status,x.total,x.paid,x.partner,x.trip,x.notes,x.requestId];
  let released=false;
  c.ygpStaff_=()=> 'operator@example.test';c.ygpHash_=s=>s;c.yohakBookingFormName_=()=> 'FORM';
  c.yohakBookingWorkbook_=()=>({getSheetByName:n=>{
    if(n==='FORM')return {getRange:()=>({getValues:()=>vals.map(v=>[v])})};
    if(n==='Booking Intake Audit')return {getLastRow:()=>2,getRange:()=>({getValues:()=>[[x.requestId,'TEST-EXISTING',conflict?'different':JSON.stringify(clean),'time','staff',4]]})};
    throw Error('Replay must not allocate booking/guest rows.');
  },toast:()=>{}});
  c.LockService={getScriptLock:()=>({waitLock:()=>{},releaseLock:()=>{released=true;}})};
  c.Sheets={Spreadsheets:{batchUpdate:()=>{throw Error('Replay must never write.');}}};
  return {c,released:()=>released};
}
test('same request replay returns original booking without allocating or writing',()=>{const e=replayEnv();const r=e.c.yohakCreateBookingFromForm();assert.equal(r.reference,'TEST-EXISTING');assert.equal(r.duplicate,true);assert(e.released());});
test('changed payload under old request identity is rejected',()=>{const e=replayEnv(true);assert.throws(()=>e.c.yohakCreateBookingFromForm(),/different data/);assert(e.released());});
