// Generates additive Sheets formatting + values plans. Does NOT call Google.
// Usage: node tools/sheet-views.cjs metadata.json output-prefix
// Keep all metadata and generated plans in .local, never in the public repository.
const fs=require('node:fs');
const [metaPath,prefix]=process.argv.slice(2);
if(!metaPath||!prefix)throw Error('Supply metadata file and output prefix.');
const meta=JSON.parse(fs.readFileSync(metaPath,'utf8'));
const ids=Object.fromEntries(meta.sheets.map(x=>[x.properties.title,x.properties.sheetId]));
for(const name of ['BOOKING DESK','AUTO OPS MANIFEST','WEB BOOKINGS','Bookings','All Guests','Calendar','CG Manifest'])if(ids[name]===undefined)throw Error('Missing '+name);
const link=(sheet,label,cell='A1')=>`=HYPERLINK("#gid=${ids[sheet]}&range=${cell}","${label}")`;
const headers=['Booking reference','Trip ID','Tour date','Booker','Tour','Pax','Booking status','Total PHP','Paid recorded','Calculated balance','Payment check','Payment calculation','Guest details','Email','WhatsApp / phone','Source','Channel','Partner','Next action','Open booking'];
const validPax=`IFERROR(ISNUMBER(Bookings!F4:F342)*(Bookings!F4:F342>=1)*(Bookings!F4:F342<=100)*(MOD(Bookings!F4:F342,1)=0),FALSE)`;
const validAmounts=`IFERROR(ISNUMBER(Bookings!H4:H342)*ISNUMBER(Bookings!J4:J342)*(Bookings!H4:H342>=0)*(Bookings!J4:J342>=0),FALSE)`;
const balance=`IF(${validAmounts},ROUND(Bookings!H4:H342-Bookings!J4:J342,2),"")`;
const payCalc=`IF(${validAmounts},IF(ROUND(Bookings!H4:H342-Bookings!J4:J342,2)=0,"RECORDED PAID",IF(Bookings!H4:H342>Bookings!J4:J342,"BALANCE REMAINS","OVERPAID - REVIEW")),"AMOUNT UNKNOWN / CHECK")`;
const discrepancy=`IFERROR(REGEXMATCH(Bookings!L4:L342,"^PAID")*(Bookings!H4:H342>Bookings!J4:J342)*${validAmounts},FALSE)`;
const raw=`HSTACK(IF(Bookings!A4:A342="","MISSING REF",Bookings!A4:A342),Bookings!B4:B342,Bookings!C4:C342,Bookings!D4:D342,Bookings!E4:E342,IF(${validPax},Bookings!F4:F342,"CHECK PAX"),Bookings!G4:G342,Bookings!H4:H342,Bookings!J4:J342,${balance},Bookings!N4:N342,${payCalc},Bookings!U4:U342,Bookings!P4:P342,Bookings!Q4:Q342,Bookings!R4:R342,Bookings!S4:S342,Bookings!T4:T342,Bookings!W4:W342&IF(${validPax},""," | CHECK PAX")&IF(${discrepancy}," | PAID LABEL / AMOUNTS CONFLICT",""),HYPERLINK("#gid=${ids.Bookings}&range=D"&ROW(Bookings!A4:A342),"OPEN"))`;
const deskFormula=`=ARRAYFORMULA(LET(x,${raw},s,Bookings!C4:C342,e,IF(Bookings!B4:B342="",s+1,IFERROR(VLOOKUP(Bookings!B4:B342,'11 Departures'!A2:E101,5,FALSE),s+1)),hay,LOWER(Bookings!A4:A342&" "&Bookings!B4:B342&" "&Bookings!D4:D342&" "&Bookings!E4:E342&" "&Bookings!M4:M342&" "&Bookings!P4:P342&" "&Bookings!Q4:Q342&" "&Bookings!T4:T342),IFNA(SORT(FILTER(x,Bookings!D4:D342<>"",IF($B$4="",ROW(s)^0,(ISNUMBER(s))*(s<=$B$4)*($B$4<IF(ISNUMBER(e)*(e>s),e,s+1))),IF($B$5="",ROW(s)^0,ISNUMBER(SEARCH(LOWER($B$5),hay))),IF(OR($B$6="",$B$6="ALL"),ROW(s)^0,Bookings!R4:R342=$B$6),IF(OR($B$7="",$B$7="ALL"),ROW(s)^0,Bookings!G4:G342=$B$7)),3,FALSE),"No matching bookings.")))`;
const webFormula=`=ARRAYFORMULA(IFNA(SORT(FILTER(${raw},Bookings!D4:D342<>"",Bookings!R4:R342="WEBSITE"),3,FALSE),"No WEBSITE-source bookings in the master yet. This is a view, not a website sync."))`;
const opsFormula=`=IF(OR(B3="",B4=""),"Choose the exact trip and boat in Calendar.",IFNA(LET(x,SORT(FILTER(HSTACK('All Guests'!D4:D504,'All Guests'!B4:B504,'All Guests'!E4:H504,IF('All Guests'!T4:T504="","NOT PROVIDED",'All Guests'!T4:T504),IF('All Guests'!U4:U504="","NOT PROVIDED",'All Guests'!U4:U504),'All Guests'!V4:Y504,'All Guests'!AA4:AA504,'All Guests'!M4:M504,'All Guests'!C4:C504),'All Guests'!J4:J504=B3,'All Guests'!K4:K504=B4,'All Guests'!I4:I504="ACTIVE",'All Guests'!N4:N504="CONFIRMED"),2,TRUE,15,TRUE),HSTACK(SEQUENCE(ROWS(x)),CHOOSECOLS(x,1,2,3,4,5,6,7,8,9,10,11,12,13,14))),"No linked confirmed passengers for this trip and boat. Reconcile All Guests; do not type over this output."))`;
const readiness=`=IF(OR(B3="",B4=""),"CHOOSE TRIP + ASSIGNED BOAT",IF(OR(B3<>'CG Manifest'!B5,B4<>'CG Manifest'!B6),"BLOCKED - USE CALENDAR SELECTION",IF(COUNTIF(C11:C511,"?*")=0,"NO LINKED CONFIRMED PASSENGERS",IF(LEFT('CG Manifest'!B8,5)<>"READY","PREPARATION DRAFT - "&'CG Manifest'!B8,IF(COUNTIFS(C11:C511,"?*",N11:N511,"<>COMPLETE")>0,"PREPARATION DRAFT - SERVICE DETAILS MISSING",IF(COUNTIFS('All Guests'!J4:J504,B3,'All Guests'!K4:K504,B4,'All Guests'!I4:I504,"ACTIVE",'All Guests'!N4:N504,"CONFIRMED",'All Guests'!AD4:AD504,"CHECKED BEFORE DEPARTURE",'All Guests'!AB4:AB504,"<>",'All Guests'!AC4:AC504,">0",'All Guests'!AC4:AC504,"<="&NOW())<>COUNTIF(C11:C511,"?*"),"PREPARATION DRAFT - GUIDE HANDOFF NEEDED","READY FOR OPERATIONS REVIEW"))))))`;
const data=[];
const add=(sheet,cell,values)=>data.push({range:`'${sheet}'!${cell}`,values});
add('BOOKING DESK','A1',[['YOHAK | BOOKING DESK'],['One master record. Search here; edit the original booking using OPEN. No guest records are copied.'],['Recorded paid is not receipt verification. Automatic entry/guest-slot script still requires Google installation.']]);
add('BOOKING DESK','A4',[['TOUR DATE',''],['SEARCH',''],['SOURCE','ALL'],['STATUS','ALL']]);
const addBooking=`=IFERROR(HYPERLINK("#gid=${ids.Bookings}&range=D"&(MATCH(TRUE,BYROW(Bookings!A4:BM342,LAMBDA(r,SUM(ARRAYFORMULA(LEN(r)))=0)),0)+3),"ADD NEW BOOKING"),"NO UNUSED BOOKING ROW - ASK RESERVATIONS")`;
add('BOOKING DESK','D4',[[addBooking],[link('All Guests','OPEN ALL GUESTS','B4')],[link('Calendar','SELECT TRIP / BOAT','B3')],[link('CG Manifest','CG MANIFEST - GATED')],[link('AUTO OPS MANIFEST','AUTO OPS MANIFEST')]]);
add('BOOKING DESK','A10',[['MATCHING BOOKINGS','=COUNTIF(D13:D900,"?*")','VALID PAX','=SUM(F13:F900)','NET CALC. BALANCE','=IF(COUNTIFS(D13:D900,"?*",J13:J900,"")>0,TEXT(SUM(J13:J900),"#,##0.00")&" + UNKNOWN",SUM(J13:J900))','Balance = total minus recorded paid, not receipt verification. Review refunds, fees and unknown amounts before collection.']]);
add('BOOKING DESK','A12',[headers,[deskFormula]]);
add('WEB BOOKINGS','A1',[['YOHAK | WEBSITE BOOKINGS'],['Filtered from the master Bookings tab. No manual duplication and no live website receiver implied.'],[link('BOOKING DESK','OPEN BOOKING DESK')],[],headers,[webFormula]]);
add('AUTO OPS MANIFEST','A1',[['YOHAK | AUTOMATIC OPERATIONS MANIFEST'],['INTERNAL ONLY. Preparation output until readiness checks pass. Never send the full roster to guests.']]);
add('AUTO OPS MANIFEST','A3',[
  ['EXACT TRIP',"='CG Manifest'!B5",link('Calendar','SELECT TRIP / BOAT','B3')],
  ['ASSIGNED BOAT',"='CG Manifest'!B6",link('CG Manifest','OPEN OFFICIAL CG LAYOUT')],
  ['DATE',"='CG Manifest'!B4"],
  ['READINESS',readiness],
  ['PASSENGER SLOTS','=COUNTIF(C11:C511,"?*")'],
  ['RULE','Generated from All Guests, not typed historical copies. Blank service details remain NOT PROVIDED.'],
  ['PRINT','Landscape, fit to width; repeat headers as needed. Review every page and trip/boat.'],
  ['No.','Guest name','Booking ref','Age','Gender','Nationality','ETDF','Allergies','Dietary','Requests','Pickup','Campsite','Ops notes','Service check','Guest key'],
  [opsFormula]
]);
fs.writeFileSync(prefix+'-values.json',JSON.stringify({valueInputOption:'USER_ENTERED',data},null,2));
const r=[],color=h=>({red:parseInt(h.slice(0,2),16)/255,green:parseInt(h.slice(2,4),16)/255,blue:parseInt(h.slice(4,6),16)/255});
const range=(id,a,b,c,d)=>({sheetId:id,startRowIndex:a,endRowIndex:b,startColumnIndex:c,endColumnIndex:d});
for(const [name,head,cols] of [['BOOKING DESK',11,20],['WEB BOOKINGS',4,20],['AUTO OPS MANIFEST',9,15]]){
  const id=ids[name];
  r.push({repeatCell:{range:range(id,0,1,0,cols),cell:{userEnteredFormat:{backgroundColor:color('123F3C'),textFormat:{bold:true,fontSize:15,foregroundColor:color('FFFFFF')}}},fields:'userEnteredFormat'}});
  r.push({mergeCells:{range:range(id,0,1,0,cols),mergeType:'MERGE_ALL'}});
  r.push({repeatCell:{range:range(id,head,head+1,0,cols),cell:{userEnteredFormat:{backgroundColor:color('25635C'),textFormat:{bold:true,foregroundColor:color('FFFFFF')},wrapStrategy:'WRAP'}},fields:'userEnteredFormat'}});
  r.push({repeatCell:{range:range(id,head+1,900,0,cols),cell:{userEnteredFormat:{textFormat:{fontSize:10},wrapStrategy:'CLIP',verticalAlignment:'MIDDLE'}},fields:'userEnteredFormat'}});
  r.push({updateDimensionProperties:{range:{sheetId:id,dimension:'COLUMNS',startIndex:0,endIndex:cols},properties:{pixelSize:145},fields:'pixelSize'}});
  r.push({updateDimensionProperties:{range:{sheetId:id,dimension:'ROWS',startIndex:0,endIndex:1},properties:{pixelSize:34},fields:'pixelSize'}});
  r.push({updateDimensionProperties:{range:{sheetId:id,dimension:'ROWS',startIndex:head,endIndex:head+1},properties:{pixelSize:35},fields:'pixelSize'}});
  r.push({updateSheetProperties:{properties:{sheetId:id,gridProperties:{frozenRowCount:head+1,hideGridlines:true}},fields:'gridProperties.frozenRowCount,gridProperties.hideGridlines'}});
  r.push({addProtectedRange:{protectedRange:{range:range(id,head+1,900,0,cols),warningOnly:true,description:'Generated view. Edit source records, not these formulas.'}}});
}
const desk=ids['BOOKING DESK'];
r.push({repeatCell:{range:range(desk,3,7,1,2),cell:{userEnteredFormat:{backgroundColor:color('FFF4CC')}},fields:'userEnteredFormat.backgroundColor'}});
r.push({repeatCell:{range:range(desk,3,4,1,2),cell:{userEnteredFormat:{numberFormat:{type:'DATE',pattern:'dd mmm yyyy'}}},fields:'userEnteredFormat.numberFormat'}});
r.push({setDataValidation:{range:range(desk,3,4,1,2),rule:{condition:{type:'DATE_IS_VALID'},strict:true,showCustomUi:true}}});
for(const [row,values] of [[5,['ALL','WEBSITE','DIRECT','PARTNER']],[6,['ALL','PENCIL','UNVERIFIED','CONFIRMED','CANCELLED','COMPLETED']]]){
  r.push({setDataValidation:{range:range(desk,row,row+1,1,2),rule:{condition:{type:'ONE_OF_LIST',values:values.map(userEnteredValue=>({userEnteredValue}))},strict:true,showCustomUi:true}}});
}
for(const [name,start] of [['BOOKING DESK',12],['WEB BOOKINGS',5]]){
  r.push({repeatCell:{range:range(ids[name],start,900,2,3),cell:{userEnteredFormat:{numberFormat:{type:'DATE',pattern:'dd mmm yyyy'}}},fields:'userEnteredFormat.numberFormat'}});
  r.push({repeatCell:{range:range(ids[name],start,900,7,10),cell:{userEnteredFormat:{numberFormat:{type:'NUMBER',pattern:'#,##0.00'}}},fields:'userEnteredFormat.numberFormat'}});
}
r.push({repeatCell:{range:range(ids['AUTO OPS MANIFEST'],4,5,1,2),cell:{userEnteredFormat:{numberFormat:{type:'DATE',pattern:'dd mmm yyyy'}}},fields:'userEnteredFormat.numberFormat'}});
fs.writeFileSync(prefix+'-format.json',JSON.stringify({requests:r},null,2));
console.log('Generated view plans; no Google writes performed.');
