/**
 * Staff booking entry, private STAGING only.
 * One atomic Sheets batch creates the booking, blank passenger slots and receipt.
 * No payment verification, capacity promise, guest message or official submission.
 */
var YBE_FORM='NEW BOOKING',YBE_AUDIT='Booking Intake Audit';
var YBE_LABELS=['BOOKING CONTACT','BOOKER EMAIL','WHATSAPP / PHONE','TOUR','TOUR DATE',
  'PAX (EDIT HERE)','SOURCE','CHANNEL','BOOKING STATUS','TOTAL PRICE (PHP)','PAID (RECORDED)',
  'PARTNER','SELECT TRIP','BOOKING / SERVICE NOTES'];
function yohakBookingFormName_() {
  return YBE_FORM+' '+ygpHash_(ygpStaff_()).slice(0,10);
}

function yohakBookingWorkbook_() {
  ygpStaff_();
  var ss=SpreadsheetApp.getActive(),cfg=ygpConfig_();
  if(!ss||ss.getId()!==cfg.spreadsheetId||ss.getName().toUpperCase().indexOf('STAGING')<0)
    throw Error('Exact configured STAGING workbook required.');
  if(ss.getSpreadsheetTimeZone()!=='Asia/Manila')throw Error('Use Asia/Manila timezone.');
  if(DriveApp.getFileById(ss.getId()).getSharingAccess()!==DriveApp.Access.PRIVATE)
    throw Error('Booking intake requires a private workbook.');
  if(PropertiesService.getDocumentProperties().getProperty('YOH_BOOKING_OPS_ENABLED')!=='true')
    throw Error('Install and verify staging automation first.');
  return ss;
}
function yohakBookingInput_(input) {
  var x={},textFields=['contact','email','phone','tour','date','source','channel','status','partner','trip','notes','requestId'];
  textFields.forEach(function(k){x[k]=ygpText_(input[k],k==='notes'?1000:160);});
  if(!x.contact||!x.tour)throw Error('Booker and tour are required.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(x.date)||isNaN(Date.parse(x.date+'T00:00:00Z'))||
    new Date(x.date+'T00:00:00Z').toISOString().slice(0,10)!==x.date)throw Error('Use a valid tour date.');
  if(x.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x.email))throw Error('Check the email address.');
  if(x.phone&&!/^\+[1-9]\d{6,14}$/.test(x.phone))throw Error('Phone must include +country code and digits only.');
  if(!x.email&&!x.phone)throw Error('Supply a usable email or WhatsApp/phone contact.');
  if(['DIRECT','PARTNER'].indexOf(x.source)<0)throw Error('Manual entry supports DIRECT or PARTNER; website uses its own adapter.');
  if(!x.channel||(x.source==='PARTNER'&&!x.partner))throw Error('Channel and applicable partner are required.');
  if(['PENCIL','UNVERIFIED'].indexOf(x.status)<0)throw Error('New entries remain PENCIL or UNVERIFIED until reservations checks capacity and payment.');
  if(!Number.isInteger(input.pax)||input.pax<1||input.pax>100)throw Error('Pax must be a whole number from 1 to 100.');
  if(typeof input.total!=='number'||!isFinite(input.total)||input.total<0)throw Error('Enter a valid agreed total.');
  if(input.paid!==''&&(typeof input.paid!=='number'||!isFinite(input.paid)||input.paid<0||input.paid>input.total))
    throw Error('Recorded paid must be blank (unknown) or between zero and total.');
  if(!/^[a-zA-Z0-9-]{16,80}$/.test(x.requestId))throw Error('Open New booking form to generate a request ID.');
  x.pax=input.pax;x.total=Math.round(input.total*100)/100;x.paid=input.paid===''?'':Math.round(input.paid*100)/100;
  return x;
}
function yohakNewBookingForm() {
  var ss=yohakBookingWorkbook_(),name=yohakBookingFormName_(),s=ss.getSheetByName(name);
  if(!s){
    s=ss.insertSheet(name);
    s.getRange('A1').setValue('YOHAK | NEW BOOKING');
    s.getRange('A2').setValue('STAGING ONLY. Fill yellow cells, then Yohak Ops > Create booking + guest slots.');
    s.getRange(5,1,YBE_LABELS.length,1).setValues(YBE_LABELS.map(function(k){return [k];}));
    s.getRange('A19:A20').setValues([['REQUEST ID (KEEP)'],['RESULT']]);
    s.getRange('B5:B18').setBackground('#fff4cc');
    s.getRange('B6:B7').setNumberFormat('@');
    s.getRange('B9').setNumberFormat('dd mmm yyyy');
    s.setColumnWidth(1,250);s.setColumnWidth(2,380);s.setFrozenRows(2);
    s.getRange('B11').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['DIRECT','PARTNER'],true).setAllowInvalid(false).build());
    s.getRange('B13').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['PENCIL','UNVERIFIED'],true).setAllowInvalid(false).build());
    s.getRange('B8').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInRange(ss.getSheetByName('10 Products').getRange('B2:B7'),true).setAllowInvalid(false).build());
    s.getRange('B17').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInRange(ss.getSheetByName('11 Departures').getRange('A2:A101'),true).setAllowInvalid(false).build());
  }
  // Completed entries are already safely in Bookings; opening again starts the next form.
  if(s.getRange('B20').getValue())s.getRange('B5:B20').clearContent();
  if(!s.getRange('B19').getValue()){
    s.getRange('B19').setValue(Utilities.getUuid());
    s.getRange('B11').setValue('DIRECT');s.getRange('B13').setValue('PENCIL');
  }
  ss.setActiveSheet(s);s.getRange('B5').activate();
}
function yohakCreateBookingFromForm() {
  var ss=yohakBookingWorkbook_(),actor=ygpStaff_(),f=ss.getSheetByName(yohakBookingFormName_());
  if(!f)throw Error('Open New booking form first.');
  var vals=f.getRange('B5:B19').getValues().map(function(r){return r[0];});
  var input={contact:vals[0],email:vals[1],phone:vals[2],tour:vals[3],
    date:vals[4] instanceof Date?Utilities.formatDate(vals[4],'Asia/Manila','yyyy-MM-dd'):vals[4],
    pax:vals[5],source:vals[6],channel:vals[7],status:vals[8],total:vals[9],paid:vals[10],
    partner:vals[11],trip:vals[12],notes:vals[13],requestId:vals[14]};
  var clean=yohakBookingInput_(input),fingerprint=ygpHash_(JSON.stringify(clean));
  var lock=LockService.getScriptLock();lock.waitLock(10000);
  try{
    var audit=ss.getSheetByName(YBE_AUDIT);
    if(!audit){
      audit=ss.insertSheet(YBE_AUDIT);
      audit.getRange('A1:F1').setValues([['REQUEST ID','BOOKING REF','PAYLOAD HASH','TIME PHT','STAFF','PAX']]);
    }
    var receipts=audit.getLastRow()>1?audit.getRange(2,1,audit.getLastRow()-1,6).getValues():[];
    var prior=receipts.filter(function(r){return r[0]===clean.requestId;});
    if(prior.length){
      if(prior.length!==1||prior[0][2]!==fingerprint)throw Error('Request already used with different data. Open New booking form for a new entry.');
      ss.toast('Already created: '+prior[0][1]);return {reference:prior[0][1],duplicate:true};
    }
    var b=ss.getSheetByName('Bookings'),g=ss.getSheetByName('All Guests'),bm=yohakHeaderMap_(b),gm=yohakHeaderMap_(g);
    yohakNeed_(bm,YBE_LABELS.concat(['BOOKING LINK (KEEP)','PENCIL STARTED AT (PHT)','PAYMENT CHECK','ASSISTED BY','BOOKED ON']));
    yohakNeed_(gm,['BOOKING LINK (KEEP)','GUEST','STATUS','INTERNAL NOTE','SERVICE INFO STATUS']);
    var bv=b.getRange(YOH.bookingStart,1,YOH.bookingEnd-YOH.bookingStart+1,b.getLastColumn()).getValues();
    var bform=b.getRange(YOH.bookingStart,1,bv.length,b.getLastColumn()).getFormulas();
    var freeBooking=-1,refs=[];
    bv.forEach(function(r,i){
      if(r[bm['BOOKING LINK (KEEP)']])refs.push(String(r[bm['BOOKING LINK (KEEP)']]));
      if(freeBooking<0&&r.every(function(v,c){return bform[i][c]!==''||v===''||v===null;}))freeBooking=i+YOH.bookingStart;
    });
    if(freeBooking<0)throw Error('No unused booking row in the tested range.');
    var gv=g.getRange(YOH.guestStart,1,YOH.guestEnd-YOH.guestStart+1,g.getLastColumn()).getValues();
    var gf=g.getRange(YOH.guestStart,1,gv.length,g.getLastColumn()).getFormulas(),freeGuests=[];
    gv.forEach(function(r,i){if(r.every(function(v,c){return gf[i][c]!==''||v===''||v===null;}))freeGuests.push(i+YOH.guestStart);});
    if(freeGuests.length<clean.pax)throw Error('Not enough unused guest slots. Expand and test the whole workbook first.');
    var products=ss.getSheetByName('10 Products').getRange('A2:B7').getValues().filter(function(r){return r[1]===clean.tour;});
    if(products.length!==1)throw Error('Tour must match exactly one configured product.');
    var deps=ss.getSheetByName('11 Departures').getRange('A2:F101').getValues().filter(function(r){
      return r[0]&&r[2]===products[0][0]&&r[3] instanceof Date&&
        Utilities.formatDate(r[3],'Asia/Manila','yyyy-MM-dd')===clean.date&&
        ['CANCELLED','COMPLETED','DEPARTED'].indexOf(r[5])<0;
    });
    if(clean.trip&&!deps.some(function(d){return d[0]===clean.trip;}))throw Error('Selected trip does not match tour/date.');
    var trip=yohakResolveTrip_(clean.trip,deps);
    if(!trip)throw Error('No unique trip. Operations must configure/select the exact departure; no trip or boat is invented.');
    var ref=yohakNextRef_(refs,Utilities.formatDate(new Date(),'Asia/Manila','yyyy'));
    if(gv.some(function(r){return String(r[gm['BOOKING LINK (KEEP)']])===ref;}))throw Error('Generated reference conflicts with orphan guest records. Staff review needed.');
    var guestFormulaHeaders=['BOOKING CONTACT / GROUP','TRIP (AUTO)','CHECK (AUTO)','GUEST KEY (AUTO)','BOOKING STATUS (AUTO)','DETAILS STATUS (AUTO)','SERVICE CHECK (AUTO)'];
    guestFormulaHeaders.forEach(function(h){if(gm[h]===undefined||!gf[0][gm[h]])throw Error('Missing guest formula template: '+h);});
    ['BALANCE (AUTO)','PAYMENT STATUS','PASSENGERS COMPLETE','NEXT ACTION'].forEach(function(h){if(bm[h]===undefined||!bform[0][bm[h]])throw Error('Missing booking formula template: '+h);});
    var now=new Date(),serial=function(d){return (d.getTime()+8*3600000)/86400000+25569;};
    var values={};
    YBE_LABELS.forEach(function(h,i){values[h]=vals[i];});
    values['BOOKING LINK (KEEP)']=ref;values['SELECT TRIP']=trip;
    values['BOOKING CONTACT']=clean.contact;values['BOOKER EMAIL']=clean.email;values['WHATSAPP / PHONE']=clean.phone;
    values['TOUR DATE']=Date.parse(clean.date+'T00:00:00Z')/86400000+25569;
    values['TOTAL PRICE (PHP)']=clean.total;values['PAID (RECORDED)']=clean.paid;
    values['PAYMENT CHECK']='TO CHECK';values['ASSISTED BY']=actor;values['BOOKED ON']=serial(now);
    values['PENCIL STARTED AT (PHT)']=clean.status==='PENCIL'?serial(now):'';
    var plan={bookingSheet:b.getSheetId(),guestSheet:g.getSheetId(),auditSheet:audit.getSheetId(),formSheet:f.getSheetId(),
      bookingRow:freeBooking,guestRows:freeGuests.slice(0,clean.pax),bm:bm,gm:gm,bookingFormulaCols:[],
      guestFormulaCols:guestFormulaHeaders.map(function(h){return gm[h];}),values:values,ref:ref,
      requestId:clean.requestId,fingerprint:fingerprint,time:Utilities.formatDate(now,'Asia/Manila','yyyy-MM-dd HH:mm:ss'),actor:actor,pax:clean.pax};
    bform[0].forEach(function(formula,col){if(formula)plan.bookingFormulaCols.push(col);});
    Sheets.Spreadsheets.batchUpdate({requests:yohakBookingRequests_(plan)},ss.getId());
    ss.toast('Created '+ref+' and '+clean.pax+' blank passenger slots. Capacity/payment still require review.');
    return {reference:ref,pax:clean.pax,row:freeBooking};
  }finally{lock.releaseLock();}
}
function yohakCopyFormulaRequest_(sheet,col,target,source) {
  return {copyPaste:{source:{sheetId:sheet,startRowIndex:source-1,endRowIndex:source,startColumnIndex:col,endColumnIndex:col+1},
    destination:{sheetId:sheet,startRowIndex:target-1,endRowIndex:target,startColumnIndex:col,endColumnIndex:col+1},
    pasteType:'PASTE_FORMULA'}};
}
function yohakBookingRequests_(p) {
  var req=[];
  p.bookingFormulaCols.forEach(function(c){req.push(yohakCopyFormulaRequest_(p.bookingSheet,c,p.bookingRow,YOH.bookingStart));});
  Object.keys(p.values).forEach(function(k){req.push(ygpCellRequest_(p.bookingSheet,p.bookingRow,p.bm[k],p.values[k]));});
  p.guestRows.forEach(function(row,i){
    p.guestFormulaCols.forEach(function(c){req.push(yohakCopyFormulaRequest_(p.guestSheet,c,row,YOH.guestStart));});
    var init={'BOOKING LINK (KEEP)':p.ref,'GUEST':i+1,'STATUS':'ACTIVE','SERVICE INFO STATUS':'NOT COLLECTED',
      'INTERNAL NOTE':'Passenger details required; booker is not automatically a passenger.'};
    Object.keys(init).forEach(function(k){req.push(ygpCellRequest_(p.guestSheet,row,p.gm[k],init[k]));});
  });
  req.push({appendCells:{sheetId:p.auditSheet,rows:[{values:[p.requestId,p.ref,p.fingerprint,p.time,p.actor,p.pax].map(function(v){
    return {userEnteredValue:typeof v==='number'?{numberValue:v}:{stringValue:String(v)}};
  })}],fields:'userEnteredValue'}});
  req.push(ygpCellRequest_(p.formSheet,20,1,'CREATED '+p.ref+' | '+p.pax+' guest slots. Use New booking form for the next booking.'));
  return req;
}
