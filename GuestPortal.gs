/**
 * Guest intake pilot. Disabled by default; private STAGING workbook only.
 * Public RPCs: yohakGuestLoad / yohakGuestSave. Every other portal helper is private.
 * No emails, payments, booking creation or availability changes.
 */
var YGP_FIELDS = {
  name: 'PASSENGER FULL NAME', age: 'AGE AT TOUR', gender: 'GENDER',
  nationality: 'NATIONALITY', allergies: 'ALLERGIES',
  dietary: 'DIETARY REQUIREMENTS', requests: 'SPECIAL REQUESTS'
};
var YGP_AUDIT = ['TIME PHT', 'BOOKING REF', 'ACTION', 'REQUEST ID', 'COMPLETE', 'PAX'];

function ygpConfig_() {
  var p = PropertiesService.getScriptProperties();
  return {
    enabled: p.getProperty('YGP_ENABLED') === 'true',
    spreadsheetId: p.getProperty('YGP_SPREADSHEET_ID') || '',
    staff: (p.getProperty('YGP_STAFF_EMAILS') || '').toLowerCase().split(',').map(function(s){return s.trim();}).filter(Boolean),
    url: p.getProperty('YGP_WEBAPP_URL') || '',
    notice: p.getProperty('YGP_PRIVACY_NOTICE') || '',
    hours: Math.min(24 * 30, Math.max(1, Number(p.getProperty('YGP_LINK_HOURS')) || 168))
  };
}
function ygpStaff_() {
  var email = Session.getActiveUser().getEmail().toLowerCase();
  if (!email || ygpConfig_().staff.indexOf(email) < 0) throw Error('Staff access required. Configure YGP_STAFF_EMAILS in Script Properties.');
  return email;
}
function ygpSpreadsheet_() {
  var cfg = ygpConfig_();
  if (!cfg.enabled || !cfg.spreadsheetId || !cfg.notice) throw Error('Guest intake is not available. Please contact your Yohak booking agent.');
  var ss = SpreadsheetApp.openById(cfg.spreadsheetId);
  if (ss.getName().toUpperCase().indexOf('STAGING') < 0) throw Error('This pilot only supports STAGING.');
  if (ss.getSpreadsheetTimeZone() !== 'Asia/Manila') throw Error('Staging timezone must be Asia/Manila.');
  // Refuse public/domain sharing, including link sharing. Named staff access is owner-managed.
  if (DriveApp.getFileById(ss.getId()).getSharingAccess() !== DriveApp.Access.PRIVATE) {
    throw Error('Guest intake requires a private workbook. Contact Yohak.');
  }
  return ss;
}
function ygpHash_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value), Utilities.Charset.UTF_8)
    .map(function(b){return ('0' + ((b + 256) % 256).toString(16)).slice(-2);}).join('');
}
function ygpEqual_(a,b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  var diff = 0; for (var i=0;i<a.length;i++) diff |= a.charCodeAt(i)^b.charCodeAt(i);
  return diff === 0;
}
function ygpTokenParts_(token) {
  if (typeof token !== 'string' || !/^[a-f0-9]{32}\.[a-f0-9]{64}$/.test(token)) throw Error('This link is invalid or no longer available. Please request a new link from Yohak.');
  return token.split('.');
}
function ygpAuthorize_(token) {
  var parts = ygpTokenParts_(token), p = PropertiesService.getScriptProperties();
  var raw = p.getProperty('YGP_TOKEN_' + parts[0]);
  var record = raw ? JSON.parse(raw) : null;
  if (!record || !ygpEqual_(record.hash,ygpHash_(parts[1])) ||
      record.revoked || record.locked || Date.now() >= record.expires) {
    throw Error('This link is invalid or no longer available. Please request a new link from Yohak.');
  }
  return {id:parts[0],record:record};
}
function ygpText_(value,max) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw Error('Please check the length and format of your answers.');
  return value.trim();
}
function ygpValidateGuests_(incoming,pax,submit) {
  if (!Array.isArray(incoming) || incoming.length !== pax) throw Error('Your guest count has changed. Reload this page before saving.');
  var seen={};
  return incoming.map(function(g){
    if (!g || !Number.isInteger(g.number) || g.number < 1 || g.number > pax || seen[g.number]) throw Error('Invalid or duplicate passenger slot.');
    seen[g.number]=true;
    if (Object.keys(g).some(function(k){return k!=='number' && !Object.prototype.hasOwnProperty.call(YGP_FIELDS,k);})) throw Error('Unexpected passenger field.');
    var clean={number:g.number};
    Object.keys(YGP_FIELDS).forEach(function(k){clean[k]=ygpText_(g[k],k==='requests'?500:(k==='allergies'||k==='dietary'?300:120));});
    if (clean.age !== '' && (!/^\d{1,3}$/.test(clean.age) || +clean.age>120)) throw Error('Age must be a whole number between 0 and 120.');
    if (['','M','F','X'].indexOf(clean.gender)<0) throw Error('Please choose a valid sex/manifest option.');
    if (submit && !ygpComplete_(clean)) throw Error('Complete the required details for every guest, or choose Save progress.');
    return clean;
  }).sort(function(a,b){return a.number-b.number;});
}
function ygpComplete_(g) {
  return !!(g.name && g.age!=='' && g.gender && g.nationality && g.allergies && g.dietary);
}
function ygpSnapshot_(ss,ref) {
  var b=ss.getSheetByName('Bookings'), g=ss.getSheetByName('All Guests');
  if (!b||!g) throw Error('Guest intake setup needs staff attention.');
  var bm=yohakHeaderMap_(b),gm=yohakHeaderMap_(g);
  yohakNeed_(bm,['BOOKING LINK (KEEP)','BOOKING STATUS','PAX (EDIT HERE)','TOUR','TOUR DATE','SELECT TRIP']);
  yohakNeed_(gm,['BOOKING LINK (KEEP)','GUEST','STATUS','SERVICE INFO STATUS','UPDATED BY (GUIDE)','UPDATED AT (PHT)'].concat(Object.keys(YGP_FIELDS).map(function(k){return YGP_FIELDS[k];})));
  var rows=b.getRange(YOH.bookingStart,1,YOH.bookingEnd-YOH.bookingStart+1,b.getLastColumn()).getValues();
  var found=[];
  rows.forEach(function(r,i){if(String(r[bm['BOOKING LINK (KEEP)']])===ref)found.push({row:i+YOH.bookingStart,values:r});});
  if(found.length!==1)throw Error('Booking needs staff review.');
  var br=found[0].values,pax=br[bm['PAX (EDIT HERE)']],date=br[bm['TOUR DATE']],trip=br[bm['SELECT TRIP']];
  if(br[bm['BOOKING STATUS']]!=='CONFIRMED')throw Error('This booking is not open for guest details. Please contact Yohak.');
  if(!Number.isInteger(pax)||pax<1||pax>100||!(date instanceof Date)||isNaN(date.getTime())||!trip)throw Error('Booking needs staff review.');
  var dep=ss.getSheetByName('11 Departures').getRange('A2:F101').getValues().filter(function(r){return r[0]===trip;});
  var products=ss.getSheetByName('10 Products').getRange('A2:B7').getValues();
  var product=products.filter(function(r){return r[1]===br[bm.TOUR];});
  var dateKey=Utilities.formatDate(date,'Asia/Manila','yyyy-MM-dd');
  if(dep.length!==1 || dep[0][5]!=='READY_FOR_REVIEW' || product.length!==1 ||
     dep[0][2]!==product[0][0] || !(dep[0][3] instanceof Date) ||
     Utilities.formatDate(dep[0][3],'Asia/Manila','yyyy-MM-dd')!==dateKey ||
     dateKey<Utilities.formatDate(new Date(),'Asia/Manila','yyyy-MM-dd'))throw Error('Tour details need staff review.');
  var all=g.getRange(YOH.guestStart,1,YOH.guestEnd-YOH.guestStart+1,g.getLastColumn()).getValues(),slots=[];
  all.forEach(function(r,i){
    if(String(r[gm['BOOKING LINK (KEEP)']])!==ref)return;
    // Retained excess rows are excluded; duplicate active/in-range slots fail closed below.
    var number=r[gm.GUEST];
    if(r[gm.STATUS]!=='ACTIVE'||number>pax)return;
    var item={number:number,row:i+YOH.guestStart};
    Object.keys(YGP_FIELDS).forEach(function(k){item[k]=String(r[gm[YGP_FIELDS[k]]]===undefined?'':r[gm[YGP_FIELDS[k]]]);});
    slots.push(item);
  });
  slots.sort(function(a,b){return a.number-b.number;});
  if(slots.length!==pax||slots.some(function(s,i){return s.number!==i+1;}))throw Error('Passenger slots need staff review. Ask your agent to synchronize this booking.');
  var publicGuests=slots.map(function(s){var x={number:s.number};Object.keys(YGP_FIELDS).forEach(function(k){x[k]=s[k];});return x;});
  var model={reference:ref,tour:String(br[bm.TOUR]),date:dateKey,pax:pax,guests:publicGuests};
  model.revision=ygpHash_(JSON.stringify({model:model,trip:trip,rows:slots.map(function(s){return s.row;})}));
  return {model:model,slots:slots,guestSheet:g,gm:gm,bookingSheet:b,bm:bm,bookingRow:found[0].row};
}
function ygpCellRequest_(sheetId,row,col,value) {
  // Explicit stringValue prevents spreadsheet formula injection, including '=...', '+', '-' and '@'.
  var entered = typeof value==='number'?{numberValue:value}:{stringValue:String(value)};
  return {updateCells:{range:{sheetId:sheetId,startRowIndex:row-1,endRowIndex:row,startColumnIndex:col,endColumnIndex:col+1},
    rows:[{values:[{userEnteredValue:entered}]}],fields:'userEnteredValue'}};
}
function ygpRate_(id) {
  var cache=CacheService.getScriptCache(),key='ygp-rate-'+id,n=Number(cache.get(key)||0);
  if(n>=40)throw Error('Please wait a minute before trying again.');
  cache.put(key,String(n+1),60);
}
function doGet() {
  // No data or bearer token is rendered into HTML. Token lives in URL fragment.
  return HtmlService.createHtmlOutputFromFile('GuestPortal')
    .setTitle('Yohak | Guest details')
    .addMetaTag('viewport','width=device-width, initial-scale=1');
}
function yohakGuestLoad(token) {
  try {
    var auth=ygpAuthorize_(token);ygpRate_(auth.id);
    var ss=ygpSpreadsheet_(),snapshot=ygpSnapshot_(ss,auth.record.ref);
    snapshot.model.privacyNotice=ygpConfig_().notice;
    snapshot.model.expiresAt=new Date(auth.record.expires).toISOString();
    return {ok:true,data:snapshot.model};
  } catch(err) {return {ok:false,message:ygpPublicError_(err)};}
}
function ygpPublicError_(err) {
  // Never return raw provider errors, sheet IDs, stack traces or passenger data.
  var message=String(err&&err.message||'');
  var safe=/^(This link|This booking|Guest intake|Booking needs|Tour details|Passenger slots|Your guest count|Invalid or duplicate passenger|Unexpected passenger field|Please |Age must|Complete the required|Your details changed|The form is locked|Review the privacy|A save is already|Request ID)/;
  return safe.test(message)?message:'We could not save or load your details. Please retry or contact your Yohak booking agent.';
}
function yohakGuestSave(token,payload) {
  var lock=LockService.getScriptLock();
  if(!lock.tryLock(10000))return {ok:false,message:'A save is already in progress. Please retry shortly.'};
  try {
    var auth=ygpAuthorize_(token);ygpRate_(auth.id);
    var ss=ygpSpreadsheet_(),snap=ygpSnapshot_(ss,auth.record.ref);
    if(!payload || payload.acknowledged!==true)throw Error('Review the privacy notice and confirm your authority to provide these details.');
    if(typeof payload.requestId!=='string'||!/^[a-zA-Z0-9_-]{16,80}$/.test(payload.requestId))throw Error('Request ID is invalid. Reload and try again.');
    if(Object.keys(payload).some(function(k){return ['revision','requestId','acknowledged','submit','guests'].indexOf(k)<0;}))throw Error('Unexpected passenger field.');
    var clean=ygpValidateGuests_(payload.guests,snap.model.pax,payload.submit===true);
    var fingerprint=ygpHash_(JSON.stringify(clean));
    var audit=ss.getSheetByName('Guest Intake Audit');
    if(!audit)throw Error('Guest intake setup needs staff attention.');
    var auditRows=audit.getLastRow()>1?audit.getRange(2,1,audit.getLastRow()-1,6).getValues():[];
    var prior=auditRows.filter(function(r){return r[1]===auth.record.ref&&r[3]===payload.requestId;});
    if(prior.length){
      // A retry is acknowledged only if current stored data matches; never replay over subsequent edits.
      if(ygpHash_(JSON.stringify(snap.model.guests))!==fingerprint)throw Error('Your details changed since this save. Reload before making changes.');
      return {ok:true,data:snap.model,duplicate:true};
    }
    if(!ygpEqual_(payload.revision,snap.model.revision))throw Error('Your details changed in another session. Reload before making changes.');
    var requests=[],now=Utilities.formatDate(new Date(),'Asia/Manila','yyyy-MM-dd HH:mm:ss');
    clean.forEach(function(person,i){
      var gr=snap.slots[i].row;
      Object.keys(YGP_FIELDS).forEach(function(k){
        var val=k==='age'&&person[k]!==''?Number(person[k]):person[k];
        requests.push(ygpCellRequest_(snap.guestSheet.getSheetId(),gr,snap.gm[YGP_FIELDS[k]],val));
      });
      requests.push(ygpCellRequest_(snap.guestSheet.getSheetId(),gr,snap.gm['SERVICE INFO STATUS'],person.allergies&&person.dietary?'GUEST CONFIRMED':'NOT COLLECTED'));
      requests.push(ygpCellRequest_(snap.guestSheet.getSheetId(),gr,snap.gm['UPDATED BY (GUIDE)'],'GUEST PORTAL - REVIEW'));
      requests.push(ygpCellRequest_(snap.guestSheet.getSheetId(),gr,snap.gm['UPDATED AT (PHT)'],now));
      if(snap.gm['GUIDE REVIEW']!==undefined)requests.push(ygpCellRequest_(snap.guestSheet.getSheetId(),gr,snap.gm['GUIDE REVIEW'],''));
    });
    var count=clean.filter(ygpComplete_).length;
    requests.push({appendCells:{sheetId:audit.getSheetId(),rows:[{values:
      [now,auth.record.ref,payload.submit===true?'SUBMITTED':'PROGRESS SAVED',payload.requestId,count,clean.length].map(function(v){
        return {userEnteredValue:typeof v==='number'?{numberValue:v}:{stringValue:v}};
      })}],fields:'userEnteredValue'}});
    // One batch writes all passenger cells and receipt together. Audit contains no names or token.
    Sheets.Spreadsheets.batchUpdate({requests:requests},ss.getId());
    SpreadsheetApp.flush();
    return {ok:true,data:ygpSnapshot_(ss,auth.record.ref).model};
  } catch(err) {return {ok:false,message:ygpPublicError_(err)};}
  finally {lock.releaseLock();}
}
function yohakPrepareGuestPortal() {
  ygpStaff_();
  var ss=ygpSpreadsheet_();
  var audit=ss.getSheetByName('Guest Intake Audit');
  if(!audit){audit=ss.insertSheet('Guest Intake Audit');audit.getRange(1,1,1,6).setValues([YGP_AUDIT]);audit.setFrozenRows(1);}
  if(JSON.stringify(audit.getRange(1,1,1,6).getValues()[0])!==JSON.stringify(YGP_AUDIT))throw Error('Audit schema mismatch.');
  ss.toast('Guest intake audit ready. No messages sent. Create a link from a confirmed booking.');
}
function ygpSelected_() {
  ygpStaff_();
  var ss=ygpSpreadsheet_(),active=SpreadsheetApp.getActive(),range=active&&active.getActiveRange();
  if(!active||active.getId()!==ss.getId()||!range||range.getSheet().getName()!=='Bookings'||
      range.getRow()<YOH.bookingStart||range.getRow()>YOH.bookingEnd)throw Error('Select a booking in the configured staging workbook.');
  return {ss:ss,row:range.getRow()};
}
function yohakCreateGuestLink() {
  var selected=ygpSelected_(),lock=LockService.getScriptLock();lock.waitLock(10000);
  try {
    var ss=selected.ss,b=ss.getSheetByName('Bookings'),bm=yohakHeaderMap_(b);
    yohakNeed_(bm,['GUEST LINK (NOT LIVE)']);
    if(b.getRange(selected.row,bm['BOOKING STATUS']+1).getValue()!=='CONFIRMED')throw Error('Confirm the booking before requesting guest details.');
    yohakSyncBooking_(ss,selected.row,false);SpreadsheetApp.flush();
    var ref=String(b.getRange(selected.row,bm['BOOKING LINK (KEEP)']+1).getValue());
    ygpSnapshot_(ss,ref); // validates trip, slots, date; no guest identities inferred
    var cfg=ygpConfig_();
    if(!/^https:\/\/script\.google\.com\/(?:a\/macros\/[^/]+\/|macros\/)s\/[A-Za-z0-9_-]+\/exec$/.test(cfg.url))throw Error('Set YGP_WEBAPP_URL to the approved deployment URL.');
    var p=PropertiesService.getScriptProperties(),previous=p.getProperty('YGP_REF_'+ref);
    if(previous)throw Error('A guest link already exists. Use the existing link, or revoke it before generating another.');
    var id=Utilities.getUuid().replace(/-/g,''),secret=Utilities.getUuid().replace(/-/g,'')+Utilities.getUuid().replace(/-/g,'');
    p.setProperty('YGP_TOKEN_'+id,JSON.stringify({ref:ref,hash:ygpHash_(secret),expires:Date.now()+cfg.hours*3600000,locked:false,revoked:false}));
    p.setProperty('YGP_REF_'+ref,id);
    var url=cfg.url+'#token='+id+'.'+secret;
    b.getRange(selected.row,bm['GUEST LINK (NOT LIVE)']+1).setValue(url);
    ss.toast('Private link is in GUEST LINK (NOT LIVE). Copy it into WhatsApp. No email was sent.');
  } finally {lock.releaseLock();}
}
function yohakRevokeGuestLink() { ygpSetLinkState_('revoked'); }
function yohakLockGuestDetails() { ygpSetLinkState_('locked'); }
function ygpSetLinkState_(state) {
  var selected=ygpSelected_(),lock=LockService.getScriptLock();lock.waitLock(10000);
  try{
    var b=selected.ss.getSheetByName('Bookings'),bm=yohakHeaderMap_(b);
    var ref=String(b.getRange(selected.row,bm['BOOKING LINK (KEEP)']+1).getValue());
    var p=PropertiesService.getScriptProperties(),id=p.getProperty('YGP_REF_'+ref);
    if(!id)throw Error('No guest link exists for this booking.');
    var record=JSON.parse(p.getProperty('YGP_TOKEN_'+id));record[state]=true;p.setProperty('YGP_TOKEN_'+id,JSON.stringify(record));
    // Lock is deliberately irreversible through the guest page; revoke allows a reviewed replacement.
    if(state==='revoked'){p.deleteProperty('YGP_REF_'+ref);b.getRange(selected.row,bm['GUEST LINK (NOT LIVE)']+1).clearContent();}
    selected.ss.toast(state==='locked'?'Guest edits locked. Review and print the final manifest.':'Guest link revoked. A new link can now be issued.');
  }finally{lock.releaseLock();}
}
