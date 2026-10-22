/**
 * Yohak booking operations candidate. NOT INSTALLED / NOT PRODUCTION-VERIFIED.
 * Bound spreadsheet booking module. GuestPortal.gs adds separate guarded intake.
 * No email, payment or website-inventory writes.
 * Current workbook pilot limits intentionally exclude the sample rows.
 */
var YOH = {bookingStart:4, bookingEnd:304, guestStart:4, guestEnd:503, header:3};

function yohakHeaderMap_(sheet) {
  var row=sheet.getRange(YOH.header,1,1,sheet.getLastColumn()).getDisplayValues()[0], map={};
  row.forEach(function(v,i){if(v){if(map[v]!==undefined)throw Error('Duplicate header: '+v);map[v]=i;}});
  return map;
}
function yohakNeed_(map,names) {
  names.forEach(function(n){if(map[n]===undefined)throw Error('Missing column: '+n);});
}
function yohakPlanSlots_(ref,pax,guests) {
  if(!ref||!Number.isInteger(pax)||pax<1||pax>100)throw Error('Invalid booking reference or pax');
  var byNumber={},missing=[],excess=[],review=[];
  guests.filter(function(g){return g.ref===ref;}).forEach(function(g){
    if(!Number.isInteger(g.number)||g.number<1)throw Error('Invalid existing guest number');
    if(byNumber[g.number])throw Error('Duplicate guest number: '+g.number);
    byNumber[g.number]=g;
  });
  for(var n=1;n<=pax;n++){
    if(!byNumber[n])missing.push(n);
    else if(byNumber[n].status!=='ACTIVE')review.push(n);
  }
  Object.keys(byNumber).forEach(function(n){
    if(+n>pax && byNumber[n].status==='ACTIVE')excess.push(byNumber[n].row);
  });
  return {missing:missing,excess:excess,review:review};
}
function yohakEffectiveStatus_(status,start,proof,now) {
  if(status!=='PENCIL')return status;
  if(proof==='VERIFIED')return 'PAYMENT REVIEW';
  if(!(start instanceof Date)||isNaN(start.getTime()))return 'PENCIL - SET START';
  return now.getTime()>=start.getTime()+48*60*60*1000?'EXPIRED':'PENCIL';
}
function yohakNextRef_(refs,year) {
  var prefix='YHK-'+year+'-',max=0;
  refs.forEach(function(ref){
    if(ref.indexOf(prefix)===0 && /^\d+$/.test(ref.slice(prefix.length)))max=Math.max(max,+ref.slice(prefix.length));
  });
  return prefix+String(max+1).padStart(4,'0');
}

function yohakOpsOnEdit(e) {
  if(!e||!e.range||!e.source||typeof e.range.getSheet!=='function')return;
  if(PropertiesService.getDocumentProperties().getProperty('YOH_BOOKING_OPS_ENABLED')!=='true')return;
  var b=e.source.getSheetByName('Bookings');
  if(!b||e.range.getSheet().getSheetId()!==b.getSheetId())return;
  var first=Math.max(e.range.getRow(),YOH.bookingStart);
  var last=Math.min(e.range.getLastRow(),YOH.bookingEnd);
  if(first>last)return;
  var lock=LockService.getScriptLock();
  if(!lock.tryLock(5000)){e.source.toast('Booking sync busy. Use Yohak Ops > Sync selected booking.');return;}
  try{
    var bm=yohakHeaderMap_(b);
    yohakNeed_(bm,['BOOKING LINK (KEEP)','BOOKING CONTACT','PAX (EDIT HERE)','BOOKING STATUS',
      'PENCIL STARTED AT (PHT)','NEXT ACTION','SELECT TRIP','TOUR DATE','TOUR']);
    // Never silently change an existing stable reference.
    if(e.range.getNumRows()===1 && e.range.getNumColumns()===1 &&
       e.range.getColumn()===bm['BOOKING LINK (KEEP)']+1 && e.oldValue && e.value!==e.oldValue){
      e.range.setValue(e.oldValue);e.source.toast('Booking reference is immutable. Original restored.');return;
    }
    // A pasted range touching reference cells can overwrite existing links; no safe old-value history.
    if(e.range.getColumn()<=bm['BOOKING LINK (KEEP)']+1 &&
       e.range.getLastColumn()>=bm['BOOKING LINK (KEEP)']+1 &&
       (e.range.getNumRows()>1 || e.range.getNumColumns()>1)){
      e.source.toast('Paste must exclude BOOKING LINK. Review references before running sync.');return;
    }
    for(var row=first;row<=last;row++){
      var statusCol=bm['BOOKING STATUS']+1;
      var touchedStatus=e.range.getColumn()<=statusCol && e.range.getLastColumn()>=statusCol;
      var touched=function(name){var col=bm[name]+1;return e.range.getColumn()<=col&&e.range.getLastColumn()>=col;};
      if(touched('SELECT TRIP')&&!touched('TOUR DATE')&&!touched('TOUR'))yohakApplySelectedTrip_(e.source,row,bm);
      yohakSyncBooking_(e.source,row,touchedStatus);
    }
  }finally{lock.releaseLock();}
}

function yohakResolveTrip_(current,matches) {
  if(matches.length===1)return matches[0][0];
  return matches.some(function(d){return d[0]===current;})?current:'';
}
function yohakApplySelectedTrip_(ss,row,bm) {
  var b=ss.getSheetByName('Bookings'),id=b.getRange(row,bm['SELECT TRIP']+1).getValue();
  if(!id)return;
  var dep=ss.getSheetByName('11 Departures').getRange('A2:F101').getValues().filter(function(d){return d[0]===id;});
  if(dep.length!==1||['CANCELLED','DEPARTED','COMPLETED'].indexOf(dep[0][5])>=0)throw Error('Select an eligible exact trip.');
  var product=ss.getSheetByName('10 Products').getRange('A2:B7').getValues().filter(function(p){return p[0]===dep[0][2];});
  if(product.length!==1||!(dep[0][3] instanceof Date))throw Error('Selected trip has invalid product/date.');
  b.getRange(row,bm['TOUR DATE']+1).setValue(dep[0][3]);
  b.getRange(row,bm.TOUR+1).setValue(product[0][1]);
}
function yohakClearTrip_(b,row,bm,br) {
  // Preserve the intended tour/date before clearing a link they may currently depend on.
  b.getRange(row,bm['TOUR DATE']+1).setValue(br[bm['TOUR DATE']]);
  b.getRange(row,bm.TOUR+1).setValue(br[bm.TOUR]);
  b.getRange(row,bm['SELECT TRIP']+1).clearContent();
}
function yohakSyncBooking_(ss,row,stampPencil) {
  var b=ss.getSheetByName('Bookings'),g=ss.getSheetByName('All Guests');
  if(!b||!g)throw Error('Missing Bookings or All Guests tab.');
  var bm=yohakHeaderMap_(b),gm=yohakHeaderMap_(g);
  yohakNeed_(bm,['BOOKING LINK (KEEP)','BOOKING CONTACT','PAX (EDIT HERE)','BOOKING STATUS',
    'PENCIL STARTED AT (PHT)','SELECT TRIP','TOUR DATE','TOUR']);
  yohakNeed_(gm,['BOOKING LINK (KEEP)','GUEST','STATUS','PASSENGER FULL NAME','INTERNAL NOTE','SERVICE INFO STATUS']);
  var br=b.getRange(row,1,1,b.getLastColumn()).getValues()[0];
  var ref=String(br[bm['BOOKING LINK (KEEP)']]||'').trim(),pax=br[bm['PAX (EDIT HERE)']];
  if(ref&&!/^[A-Za-z0-9][A-Za-z0-9_-]{2,79}$/.test(ref))throw Error('Invalid booking reference format');
  // Stamp the status edit even when contact/pax entry has not been completed yet.
  if(stampPencil && br[bm['BOOKING STATUS']]==='PENCIL' && !br[bm['PENCIL STARTED AT (PHT)']]){
    b.getRange(row,bm['PENCIL STARTED AT (PHT)']+1).setValue(new Date());
  }
  if(!br[bm['BOOKING CONTACT']] || !Number.isInteger(pax)||pax<1||pax>100)return;
  var allRefs=b.getRange(YOH.bookingStart,bm['BOOKING LINK (KEEP)']+1,YOH.bookingEnd-YOH.bookingStart+1,1)
    .getDisplayValues().map(function(r){return r[0];});
  if(ref && allRefs.filter(function(r){return r===ref;}).length!==1)throw Error('Duplicate booking reference');
  if(!ref){
    ref=yohakNextRef_(allRefs,Utilities.formatDate(new Date(),'Asia/Manila','yyyy'));
    b.getRange(row,bm['BOOKING LINK (KEEP)']+1).setValue(ref);
  }
  if(['CANCELLED','COMPLETED'].indexOf(br[bm['BOOKING STATUS']])>=0)return;
  var gv=g.getRange(YOH.guestStart,1,YOH.guestEnd-YOH.guestStart+1,g.getLastColumn()).getValues();
  var gf=g.getRange(YOH.guestStart,1,gv.length,g.getLastColumn()).getFormulas();
  var guests=[],free=[];
  gv.forEach(function(r,i){
    var guestRef=String(r[gm['BOOKING LINK (KEEP)']]||'').trim();
    if(guestRef)guests.push({ref:guestRef,number:r[gm.GUEST],status:r[gm.STATUS],row:i+YOH.guestStart});
    else if(r.every(function(v,c){return gf[i][c]!==''||v===''||v===null;}))free.push(i+YOH.guestStart);
  });
  var plan=yohakPlanSlots_(ref,pax,guests);
  if(plan.missing.length>free.length)throw Error('Guest capacity exceeded. Expand tested ranges before continuing.');
  var formulaHeaders=['BOOKING CONTACT / GROUP','TRIP (AUTO)','CHECK (AUTO)','GUEST KEY (AUTO)',
    'BOOKING STATUS (AUTO)','DETAILS STATUS (AUTO)','SERVICE CHECK (AUTO)'];
  var template=g.getRange(YOH.guestStart,1,1,g.getLastColumn()).getFormulasR1C1()[0];
  formulaHeaders.forEach(function(h){if(gm[h]===undefined||!template[gm[h]])throw Error('Formula template missing: '+h);});
  plan.missing.forEach(function(n,i){
    var gr=free[i];
    // Only identity linkage and blank-slot status are initialized. Personal data is never copied.
    g.getRange(gr,gm['BOOKING LINK (KEEP)']+1).setValue(ref);
    g.getRange(gr,gm.GUEST+1).setValue(n);
    g.getRange(gr,gm.STATUS+1).setValue('ACTIVE');
    g.getRange(gr,gm['INTERNAL NOTE']+1).setValue('Passenger details required. Do not assume the booker is travelling.');
    g.getRange(gr,gm['SERVICE INFO STATUS']+1).setValue('NOT COLLECTED');
    formulaHeaders.forEach(function(h){g.getRange(gr,gm[h]+1).setFormulaR1C1(template[gm[h]]);});
  });
  // Reductions retain names and notes. The team must review which people are removed.
  plan.excess.forEach(function(gr){g.getRange(gr,gm.STATUS+1).setValue('EXCESS - REVIEW');});
  if(plan.review.length||plan.excess.length)ss.toast(ref+': review excess/inactive passenger slots; no records deleted.');
  // Resolve only an exact, unique approved product/date mapping; do not invent departures or vessels.
  var products=ss.getSheetByName('10 Products').getRange('A2:B7').getValues();
  var product=products.filter(function(p){return p[1]===br[bm.TOUR];});
  var date=br[bm['TOUR DATE']];
  if(product.length===1 && date instanceof Date){
    var day=Utilities.formatDate(date,'Asia/Manila','yyyy-MM-dd');
    var departures=ss.getSheetByName('11 Departures').getRange('A2:F101').getValues();
    var matches=departures.filter(function(d){
      return d[0]&&d[2]===product[0][0]&&d[3] instanceof Date&&
        Utilities.formatDate(d[3],'Asia/Manila','yyyy-MM-dd')===day&&
        ['CANCELLED','COMPLETED','DEPARTED'].indexOf(d[5])<0;
    });
    var resolved=yohakResolveTrip_(br[bm['SELECT TRIP']],matches);
    if(resolved)b.getRange(row,bm['SELECT TRIP']+1).setValue(resolved);
    else {
      yohakClearTrip_(b,row,bm,br);
      ss.toast(ref+': select the exact trip manually. No unique match.');
    }
  } else if(br[bm['SELECT TRIP']]) {
    yohakClearTrip_(b,row,bm,br);
    ss.toast(ref+': tour or date is invalid. Select the exact trip again.');
  }
}

function yohakSyncSelectedBooking() {
  ygpStaff_();
  var ss=SpreadsheetApp.getActive(),range=ss.getActiveRange();
  if(range.getSheet().getName()!=='Bookings'||range.getRow()<YOH.bookingStart||range.getRow()>YOH.bookingEnd)
    throw Error('Select a live Bookings row (4-304).');
  if(PropertiesService.getDocumentProperties().getProperty('YOH_BOOKING_OPS_ENABLED')!=='true')
    throw Error('Automation disabled. Complete staging tests first.');
  var lock=LockService.getScriptLock();lock.waitLock(10000);
  try{yohakSyncBooking_(ss,range.getRow(),false);}finally{lock.releaseLock();}
}
function yohakOpsOnOpen() {
  ygpStaff_();
  SpreadsheetApp.getUi().createMenu('Yohak Ops')
    .addItem('Sync selected booking','yohakSyncSelectedBooking')
    .addSeparator()
    .addItem('Create guest details link','yohakCreateGuestLink')
    .addItem('Revoke guest details link','yohakRevokeGuestLink')
    .addItem('Lock guest details for manifest','yohakLockGuestDetails')
    .addToUi();
}
function yohakInstallStaging() {
  ygpStaff_();
  var ss=SpreadsheetApp.getActive();
  if(!ss||ss.getId()!==ygpConfig_().spreadsheetId)throw Error('Configure the exact staging spreadsheet ID first.');
  if(ss.getName().toUpperCase().indexOf('STAGING')<0)throw Error('Install and test in a STAGING workbook copy first.');
  if(ss.getSpreadsheetTimeZone()!=='Asia/Manila')throw Error('Set timezone to Asia/Manila.');
  var existing=ScriptApp.getProjectTriggers().some(function(t){return t.getHandlerFunction()==='yohakOpsOnEdit';});
  if(!existing)ScriptApp.newTrigger('yohakOpsOnEdit').forSpreadsheet(ss).onEdit().create();
  PropertiesService.getDocumentProperties().setProperty('YOH_BOOKING_OPS_ENABLED','true');
  yohakOpsOnOpen();
}
function onOpen() {
  // Menu only for signed-in allowlisted staff; no automatic guest data access.
  try {yohakOpsOnOpen();} catch(ignored) {}
}
// Production installer intentionally omitted: review test evidence and existing triggers first.
