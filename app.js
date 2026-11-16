// V2.2 階段 2.2.2：信用卡消費修改、隱藏系統異動紀錄、排除總覽 NT$0 提醒。
'use strict';
// V2.2 Stage 1. Never open or touch the V2.0 database.
const DB_NAME='payment-tax-v22', DB_VERSION=1;
const STORES=['installmentPlans','installments','installmentPayments','taxTemplates','taxBills','taxPayments','cards','cardPeriods','cardTransactions','cardRefunds','attachments','audit','historyCleanup','meta'];
let db;
const $=id=>document.getElementById(id);
const uid=()=>crypto.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const money=n=>'NT$'+new Intl.NumberFormat('zh-TW',{maximumFractionDigits:0,minimumFractionDigits:0}).format(Math.round(n));
const cents=v=>Math.round(Number(v))*100; // V2.2 新輸入金額以整數元儲存；舊測試資料不自動改寫
const fmtDate=d=>`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
function monthDue(first,offset){const [y,m,d]=first.split('-').map(Number);const target=new Date(Date.UTC(y,m-1+offset,1));const last=new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate();target.setUTCDate(Math.min(d,last));return fmtDate(target)}
function openDb(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB_NAME,DB_VERSION);r.onupgradeneeded=()=>{for(const name of STORES){if(!r.result.objectStoreNames.contains(name))r.result.createObjectStore(name,{keyPath:'id'})}};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(new Error('資料庫被其他頁面占用'))})}
function all(store){return new Promise((resolve,reject)=>{const t=db.transaction(store,'readonly');const r=t.objectStore(store).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
function saveMany(data){return new Promise((resolve,reject)=>{const names=[...new Set(data.map(x=>x.store)),'audit'];const tx=db.transaction(names,'readwrite');for(const {store,value} of data){tx.objectStore(store).put(value);tx.objectStore('audit').put({id:uid(),at:new Date().toISOString(),action:'create',store,entityId:value.id,after:value})}tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})}
function message(s){$('message').textContent=s;window.scrollTo({top:0,behavior:'smooth'})}
function textNode(tag,text,cls){const e=document.createElement(tag);e.textContent=text;if(cls)e.className=cls;return e}
function addItem(root,title,lines,chip){const el=document.createElement('article');el.className='item';el.append(textNode('strong',title));for(const line of lines)el.append(textNode('small',line));if(chip)el.append(textNode('span',chip,'chip'));root.append(el)}
async function renderStage1Unused(){const [plans,inst,tax,periods]=await Promise.all(['installmentPlans','installments','taxBills','cardPeriods'].map(all));$('nPlans').textContent=plans.length;$('nTax').textContent=tax.length;$('nPeriods').textContent=periods.length;for(const id of ['planList','taxList','cardList','recent'])$(id).replaceChildren();for(const p of plans.sort((a,b)=>b.createdAt.localeCompare(a.createdAt))){const related=inst.filter(x=>x.planId===p.id);addItem($('planList'),p.name,[`共 ${p.count} 期｜總額 ${money(p.totalCents/100)}`,`第一期 ${p.firstDue}｜最後一期 ${related.at(-1)?.due??''}`],'未開始繳款紀錄');addItem($('recent'),`分期｜${p.name}`,[p.createdAt.slice(0,10)])}for(const t of tax.sort((a,b)=>b.createdAt.localeCompare(a.createdAt))){addItem($('taxList'),`${t.year} 年｜${t.name}`,[`截止日 ${t.due}`,t.amountCents===null?'待確認稅額':`應繳 ${money(t.amountCents/100)}`],t.amountCents===null?'待確認稅額':'尚未建立繳款紀錄');addItem($('recent'),`稅務｜${t.name}`,[t.createdAt.slice(0,10)])}for(const p of periods.sort((a,b)=>b.createdAt.localeCompare(a.createdAt))){addItem($('cardList'),p.cardName,[`${{monthly:'每月',single:'單月',bimonthly:'雙月'}[p.mode]}｜${p.start}～${p.end}`,`最低消費 ${money(p.thresholdCents/100)}`],'尚未建立消費紀錄');addItem($('recent'),`信用卡｜${p.cardName}`,[p.createdAt.slice(0,10)])}if(!plans.length&&!tax.length&&!periods.length)$('recent').append(textNode('p','尚無測試資料。'))}
function formData(form){return Object.fromEntries(new FormData(form))}
function validMoney(v,allowZero=false){return v!==''&&Number.isFinite(Number(v))&&(allowZero?Math.round(Number(v))>=0:Math.round(Number(v))>0)&&Number.isSafeInteger(cents(v))}
async function createPlan(e){e.preventDefault();const f=e.currentTarget,v=formData(f);try{const count=Number(v.count);if(!Number.isInteger(count)||count<1||count>600)throw Error('期數需介於 1～600');if(!/^\d{4}-\d{2}-\d{2}$/.test(v.firstDue))throw Error('請填寫第一期到期日');const hasTotal=v.total!=='',hasPer=v.per!=='';if(hasTotal===hasPer)throw Error('總金額與每期金額請擇一填寫');const raw=hasTotal?v.total:v.per;if(!validMoney(raw))throw Error('金額必須大於零');const total=hasTotal?cents(raw):cents(raw)*count;if(!Number.isSafeInteger(total)||total<count)throw Error('金額或期數超出有效範圍');const base=hasTotal?Math.floor((total/100)/count)*100:cents(raw);const planId=uid(),at=new Date().toISOString();const plan={id:planId,name:v.name.trim(),count,totalCents:total,firstDue:v.firstDue,createdAt:at,status:'active',archived:false};if(!plan.name)throw Error('請輸入計畫名稱');const entries=[{store:'installmentPlans',value:plan}];for(let i=0;i<count;i++)entries.push({store:'installments',value:{id:uid(),planId,number:i+1,due:monthDue(v.firstDue,i),amountCents:i===0?total-base*(count-1):base,paidCents:0,reconciled:false,status:'active'}});await saveMany(entries);f.reset();await render();message('分期計畫已建立（階段 1 測試資料）')}catch(err){message(`無法建立：${err.message}`)}}
async function createTax(e){e.preventDefault();const f=e.currentTarget,v=formData(f);try{if(!Number.isInteger(Number(v.year))||Number(v.year)<1900||Number(v.year)>2200)throw Error('年度不正確');if(v.amount!==''&&!validMoney(v.amount,true))throw Error('稅額不正確');const record={id:uid(),sourceTemplateId:null,year:Number(v.year),name:v.name.trim(),due:v.due,amountCents:v.amount===''?null:cents(v.amount),paidCents:0,status:v.amount===''?'amount-pending':'unpaid',createdAt:new Date().toISOString()};if(!record.name||!record.due)throw Error('請填寫名稱及截止日');await saveMany([{store:'taxBills',value:record}]);f.reset();f.elements.year.value=new Date().getFullYear();await render();message('稅單已建立（階段 1 測試資料）')}catch(err){message(`無法建立：${err.message}`)}}
async function createCard(e){e.preventDefault();const f=e.currentTarget,v=formData(f);try{if(!validMoney(v.threshold,true))throw Error('最低消費門檻不正確');if(!v.start||!v.end||v.start>v.end)throw Error('結束日期不可早於開始日期');const cardId=uid(),periodId=uid(),at=new Date().toISOString();const card={id:cardId,name:v.name.trim(),mode:v.mode,createdAt:at};if(!card.name)throw Error('請輸入信用卡名稱');const period={id:periodId,cardId,cardName:card.name,mode:v.mode,start:v.start,end:v.end,thresholdCents:cents(v.threshold),createdAt:at};await saveMany([{store:'cards',value:card},{store:'cardPeriods',value:period}]);f.reset();await render();message('信用卡期間已建立（階段 1 測試資料）')}catch(err){message(`無法建立：${err.message}`)}}
async function exportData(){try{const out={format:'payment-tax-v22-stage2-test-export',exportedAt:new Date().toISOString(),stores:{}};for(const s of STORES)out.stores[s]=await all(s);const blob=new Blob([JSON.stringify(out,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`payment-tax-v22-stage2-test-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);message('測試資料已匯出，請確認檔案已儲存。')}catch(err){message(`匯出失敗：${err.message}`)}}

function txWrite(stores,callback){return new Promise((resolve,reject)=>{const tx=db.transaction([...new Set([...stores,'audit'])],'readwrite');let failed=false;try{callback(tx)}catch(err){failed=true;try{tx.abort()}catch{};reject(err)}if(!failed){tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error||new Error('資料庫交易失敗'));tx.onabort=()=>reject(tx.error||new Error('資料庫交易取消'))}})}
function audit(tx,action,store,entityId,after){tx.objectStore('audit').put({id:uid(),at:new Date().toISOString(),action,store,entityId,after})}
function safeDate(v){return /^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v}
function today(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function element(tag,attrs={},children=[]){const e=document.createElement(tag);for(const [k,v] of Object.entries(attrs)){if(k==='class')e.className=v;else if(k==='text')e.textContent=v;else e.setAttribute(k,v)}for(const child of children)e.append(child);return e}
function formField(label,name,type,attrs={}){const input=element('input',{name,type,...attrs});return element('label',{text:label},[input])}
function actionForm(kind,parentId,remaining){const form=element('form',{class:'inline-form'});form.dataset.kind=kind;form.dataset.parent=parentId;const amount=formField('本次繳款金額','amount','number',{required:'',min:'1',max:String(Math.floor(remaining/100)),step:'1',placeholder:'輸入金額'});const date=formField('實際付款日','paidAt','date',{required:'',value:today()});const note=formField('備註（選填）','note','text',{maxlength:'120'});form.append(amount,date,note,element('button',{type:'submit',class:'primary',text:'記錄付款'}));form.addEventListener('submit',recordPayment);return form}
function reconciliationButton(kind,payment){const b=element('button',{type:'button',text:payment.reconciled?'已核對':'核對這筆付款'});b.disabled=!!payment.reconciled;b.addEventListener('click',()=>reconcilePayment(kind,payment.id));return b}
async function recordPayment(e){e.preventDefault();const f=e.currentTarget,kind=f.dataset.kind,recordId=f.dataset.parent,v=formData(f);try{if(!validMoney(v.amount)||!safeDate(v.paidAt))throw Error('請填寫有效的付款金額及日期');const amount=cents(v.amount);const isInst=kind==='installment';const parentStore=isInst?'installments':'taxBills',payStore=isInst?'installmentPayments':'taxPayments';let result='';await txWrite([parentStore,payStore],tx=>{const parentReq=tx.objectStore(parentStore).get(recordId);parentReq.onsuccess=()=>{const p=parentReq.result;if(!p){tx.abort();return}if(!isInst&&(p.amountCents===null||p.status==='exempt')){tx.abort();return}if(isInst&&p.status==='cancelled'){tx.abort();return}const due=p.amountCents-p.paidCents;if(amount<=0||amount>due){tx.abort();return}const payment={id:uid(),[isInst?'installmentId':'taxBillId']:recordId,amountCents:amount,paidAt:v.paidAt,note:(v.note||'').trim(),reconciled:false,createdAt:new Date().toISOString()};p.paidCents+=amount;if(!isInst&&p.amountCents!==null)p.status=p.paidCents>=p.amountCents?'paid':'unpaid';tx.objectStore(parentStore).put(p);tx.objectStore(payStore).put(payment);audit(tx,'create',payStore,payment.id,payment);audit(tx,'update',parentStore,p.id,p);result='付款已記錄，尚待核對'};parentReq.onerror=()=>tx.abort()});await render();f.reset();message(result||'付款已記錄')}catch(err){message('無法記錄付款：請確認金額未超過剩餘應繳金額，且稅額已確定。')}}
async function reconcilePayment(kind,paymentId){if(!confirm('確認已核對這筆付款？'))return;const payStore=kind==='installment'?'installmentPayments':'taxPayments';try{await txWrite([payStore],tx=>{const req=tx.objectStore(payStore).get(paymentId);req.onsuccess=()=>{const p=req.result;if(!p||p.reconciled){tx.abort();return}p.reconciled=true;p.reconciledAt=new Date().toISOString();tx.objectStore(payStore).put(p);audit(tx,'reconcile',payStore,p.id,p)};req.onerror=()=>tx.abort()});await render();message('已核對付款')}catch{message('核對失敗，資料未變更')}}
async function setTaxAmount(id){const input=prompt('請輸入已確認的稅額（元），可以填 0；取消則不修改');if(input===null)return;if(!validMoney(input,true)){message('稅額不正確');return}try{await txWrite(['taxBills'],tx=>{const r=tx.objectStore('taxBills').get(id);r.onsuccess=()=>{const p=r.result;if(!p||p.paidCents>cents(input)){tx.abort();return}p.amountCents=cents(input);p.status=p.paidCents>=p.amountCents?'paid':'unpaid';tx.objectStore('taxBills').put(p);audit(tx,'update','taxBills',id,p)};r.onerror=()=>tx.abort()});await render();message('稅額已更新')}catch{message('稅額修改失敗，請確認金額不少於已付款金額')}}
// Stage 2.1: presentation-only navigation; no schema changes or rewriting existing records.
const planView={search:'',filter:'active',page:1,selectedId:null,pageSize:10};
function planOutstanding(plan,inst){return inst.filter(x=>x.planId===plan.id&&x.status!=='cancelled').reduce((sum,x)=>sum+Math.max(0,x.amountCents-x.paidCents),0)}
function planState(plan,inst){return planOutstanding(plan,inst)>0?'active':'closed'}
function planNextDue(plan,inst){return inst.filter(x=>x.planId===plan.id&&x.status!=='cancelled'&&x.amountCents>x.paidCents).map(x=>x.due).sort()[0]||null}
function renderPlanBrowser(plans,inst,ip){
  const browser=$('planBrowser'),detail=$('planDetailView');
  const selected=plans.find(p=>p.id===planView.selectedId);
  if(planView.selectedId&&!selected)planView.selectedId=null;
  const inDetail=!!planView.selectedId;
  browser.hidden=inDetail;detail.hidden=!inDetail;$('planForm').hidden=inDetail;
  $('planList').replaceChildren();$('installmentDetails').replaceChildren();$('planDetailHeader').replaceChildren();
  if(inDetail){
    const p=plans.find(x=>x.id===planView.selectedId),related=inst.filter(x=>x.planId===p.id).sort((a,b)=>a.number-b.number);
    const left=planOutstanding(p,inst),state=planState(p,inst);
    $('planDetailHeader').append(element('h3',{text:p.name}),textNode('p',`總金額 ${money(p.totalCents/100)}｜剩餘待繳 ${money(left/100)}｜${state==='closed'?'已結清':'進行中'}`,'plan-summary'));
    for(const x of related){
      const remaining=Math.max(0,x.amountCents-x.paidCents),paidFor=ip.filter(y=>y.installmentId===x.id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
      const card=element('article',{class:'item'},[element('strong',{text:`第 ${x.number} 期`}),textNode('small',`到期日 ${x.due}｜應繳 ${money(x.amountCents/100)}｜已繳 ${money(x.paidCents/100)}｜剩餘 ${money(remaining/100)}`)]);
      if(remaining>0&&x.status!=='cancelled')card.append(actionForm('installment',x.id,remaining));
      for(const pay of paidFor){const line=element('div',{class:'payment-line'},[textNode('small',`付款 ${pay.paidAt}｜${money(pay.amountCents/100)}｜${pay.reconciled?'已核對':'待核對'}${pay.note?'｜'+pay.note:''}`)]);if(!pay.reconciled){line.append(reconciliationButton('installment',pay),editPaymentButton('installment',pay))}card.append(line)}
      $('installmentDetails').append(card);
    }
    if(!related.length)$('installmentDetails').append(textNode('p','這筆計畫尚無期數資料。'));
    return;
  }
  const t=today();
  const matching=plans.filter(p=>(planView.filter==='all'||planState(p,inst)===planView.filter)&&p.name.toLocaleLowerCase('zh-TW').includes(planView.search.toLocaleLowerCase('zh-TW')));
  matching.sort((a,b)=>{
    const aDue=planNextDue(a,inst),bDue=planNextDue(b,inst);
    const aLate=aDue!==null&&aDue<t,bLate=bDue!==null&&bDue<t;
    if(aLate!==bLate)return aLate?-1:1;
    if(aDue!==bDue)return (aDue||'9999-12-31').localeCompare(bDue||'9999-12-31');
    return (b.createdAt||'').localeCompare(a.createdAt||'')||a.id.localeCompare(b.id);
  });
  const pages=Math.max(1,Math.ceil(matching.length/planView.pageSize));planView.page=Math.min(Math.max(1,planView.page),pages);
  const start=(planView.page-1)*planView.pageSize;
  $('planCount').textContent=`符合條件 ${matching.length} 筆｜第 ${planView.page} / ${pages} 頁`;
  for(const p of matching.slice(start,start+planView.pageSize)){
    const due=planNextDue(p,inst),remaining=planOutstanding(p,inst),late=due!==null&&due<t;
    const button=element('button',{type:'button',class:'plan-row', 'aria-label':`查看 ${p.name} 的分期明細`});
    const title=element('div',{class:'plan-row-head'},[element('strong',{text:p.name}),element('span',{class:late?'plan-badge overdue':'plan-badge',text:late?'逾期':remaining>0?'進行中':'已結清'})]);
    const values=element('div',{class:'plan-row-values'},[element('span',{text:`剩餘待繳 ${money(remaining/100)}`}),element('span',{text:`最近到期 ${due||'無待繳期數'}`})]);
    button.append(title,values);button.addEventListener('click',()=>{planView.selectedId=p.id;renderPlanBrowser(plans,inst,ip);$('plans').scrollIntoView({block:'start'})});
    $('planList').append(button);
  }
  if(!matching.length)$('planList').append(textNode('p','找不到符合條件的分期計畫。'));
  const pager=$('planPagination');pager.replaceChildren();
  if(pages>1){for(const [label,target,disabled] of [['上一頁',planView.page-1,planView.page===1],['下一頁',planView.page+1,planView.page===pages]]){const b=element('button',{type:'button',text:label});b.disabled=disabled;b.addEventListener('click',()=>{planView.page=target;renderPlanBrowser(plans,inst,ip)});pager.append(b)}}
}
async function render(){const [plans,inst,tax,periods,ip,tp]=await Promise.all(['installmentPlans','installments','taxBills','cardPeriods','installmentPayments','taxPayments'].map(all));const totalDue=inst.filter(x=>x.status!=='cancelled').reduce((s,x)=>s+Math.max(0,x.amountCents-x.paidCents),0)+tax.reduce((s,x)=>s+(x.amountCents===null||x.status==='exempt'?0:Math.max(0,x.amountCents-x.paidCents)),0);const paid=[...ip,...tp];$('dueAmount').textContent=money(totalDue/100);$('netPaid').textContent=money(paid.reduce((s,p)=>s+p.amountCents,0)/100);$('unreconciled').textContent=money(paid.filter(p=>!p.reconciled).reduce((s,p)=>s+p.amountCents,0)/100);$('unknownTax').textContent=`${tax.filter(t=>t.amountCents===null&&t.status!=='exempt').length} 筆`;
for(const id of ['planList','cardList','installmentDetails','taxDetails','upcoming'])$(id).replaceChildren();const t=today(),cutoff=new Date(t+'T00:00:00Z');cutoff.setUTCDate(cutoff.getUTCDate()+7);const near=cutoff.toISOString().slice(0,10);const upcoming=[];
renderPlanBrowser(plans,inst,ip);
for(const p of plans){for(const x of inst.filter(i=>i.planId===p.id)){const remaining=x.amountCents-x.paidCents;if(remaining>0&&Math.round(remaining/100)>0&&x.status!=='cancelled'&&x.due<=near)upcoming.push({date:x.due,title:`${p.name} 第 ${x.number} 期（分期）`,amount:remaining})}}
for(const bill of tax.sort((a,b)=>b.createdAt.localeCompare(a.createdAt))){const card=element('article',{class:'item'},[element('strong',{text:`${bill.year} 年｜${bill.name}`}),textNode('small',`截止日 ${bill.due}｜${bill.amountCents===null?'待確認稅額':`剩餘 ${money(Math.max(0,bill.amountCents-bill.paidCents)/100)}`}`)]);if(bill.amountCents===null){const b=element('button',{type:'button',text:'填寫稅額'});b.addEventListener('click',()=>setTaxAmount(bill.id));card.append(b)}else if(bill.status!=='exempt'&&bill.amountCents>bill.paidCents)card.append(actionForm('tax',bill.id,bill.amountCents-bill.paidCents));for(const pay of tp.filter(y=>y.taxBillId===bill.id)){const line=element('div',{class:'payment-line'},[textNode('small',`付款 ${pay.paidAt}｜${money(pay.amountCents/100)}｜${pay.reconciled?'已核對':'待核對'}`)]);if(!pay.reconciled){line.append(reconciliationButton('tax',pay),editPaymentButton('tax',pay))}card.append(line)}$('taxDetails').append(card);if(bill.amountCents===null&&bill.due<t)upcoming.push({date:bill.due,title:`${bill.name}（待確認稅額）`,amount:null});else if(bill.amountCents!==null&&bill.amountCents>bill.paidCents&&Math.round((bill.amountCents-bill.paidCents)/100)>0&&bill.due<=near&&bill.status!=='exempt')upcoming.push({date:bill.due,title:`${bill.name}（稅務）`,amount:bill.amountCents-bill.paidCents})}
await renderCardSection(periods);for(const u of upcoming.sort((a,b)=>a.date.localeCompare(b.date))){const line=element('div',{class:'upcoming-row'});line.append(textNode('span',u.title,'upcoming-name'));const right=element('div',{class:'upcoming-right'});right.append(textNode('time',u.date,'upcoming-date'),textNode('span',u.amount===null?'金額未確定':money(u.amount/100),'upcoming-amount'),textNode('span',u.date<t?'已逾期':'即將到期',u.date<t?'chip upcoming-status overdue':'chip upcoming-status'));line.append(right);$('upcoming').append(line)}if(!upcoming.length)$('upcoming').append(textNode('p','目前沒有 7 天內到期或已逾期的項目。'));await renderHistory(plans,inst,tax,ip,tp);await renderTaxTemplates()}

// Stage 2.2. All changes are confined to payment-tax-v22; no automatic data migration.
function editPaymentButton(kind,payment){const b=element('button',{type:'button',text:'修改'});b.addEventListener('click',()=>editPayment(kind,payment.id));return b}
async function editPayment(kind,id){
 const isInst=kind==='installment',payStore=isInst?'installmentPayments':'taxPayments',parentStore=isInst?'installments':'taxBills';
 const current=(await all(payStore)).find(x=>x.id===id);if(!current||current.reconciled){message('這筆付款已核對，不能直接修改');return}
 const amount=prompt('修改付款金額（整數元）',String(Math.round(current.amountCents/100)));if(amount===null)return;
 const date=prompt('修改付款日期（YYYY-MM-DD）',current.paidAt);if(date===null)return;
 const note=prompt('修改備註',current.note||'');if(note===null)return;
 if(!validMoney(amount)||!safeDate(date)){message('請輸入有效的整數金額及日期');return}
 const next=cents(amount);try{
 await txWrite([payStore,parentStore],tx=>{
  const r=tx.objectStore(payStore).get(id);r.onsuccess=()=>{const pay=r.result;if(!pay||pay.reconciled){tx.abort();return}
   const parentId=pay[isInst?'installmentId':'taxBillId'];const q=tx.objectStore(parentStore).get(parentId);
   q.onsuccess=()=>{const parent=q.result;if(!parent||parent.status==='cancelled'||parent.status==='exempt'||parent.amountCents===null){tx.abort();return}
    const total=parent.paidCents-pay.amountCents+next;if(next<=0||total>parent.amountCents||total<0){tx.abort();return}
    parent.paidCents=total;if(!isInst)parent.status=total>=parent.amountCents?'paid':'unpaid';
    pay.amountCents=next;pay.paidAt=date;pay.note=note.trim();tx.objectStore(payStore).put(pay);tx.objectStore(parentStore).put(parent);
    audit(tx,'update',payStore,pay.id,pay);audit(tx,'update',parentStore,parent.id,parent)};q.onerror=()=>tx.abort()};r.onerror=()=>tx.abort()});await render();message('繳款資料已修改，相關餘額已更新')
 }catch{message('修改失敗，請確認付款仍未核對，且金額沒有超過應繳總額。原資料未變更。')}
}
function templateDue(year,month,day){const d=new Date(Date.UTC(year,month,0)).getUTCDate();return `${year}-${String(month).padStart(2,'0')}-${String(Math.min(day,d)).padStart(2,'0')}`}
async function createTaxTemplate(e){e.preventDefault();const v=formData(e.currentTarget),month=Number(v.month),day=Number(v.day);if(!v.name.trim()||!Number.isInteger(month)||month<1||month>12||!Number.isInteger(day)||day<1||day>31){message('請輸入有效的稅務名稱、月份及日期');return}
 const rec={id:uid(),name:v.name.trim(),month,day,active:true,createdAt:new Date().toISOString()};await saveMany([{store:'taxTemplates',value:rec}]);e.currentTarget.reset();await render();message('年度稅務設定已建立，請選擇年度產生稅單')}
async function renderTaxTemplates(){const templates=await all('taxTemplates');const root=$('taxTemplateList');root.replaceChildren();for(const t of templates)addItem(root,t.name,[`每年 ${t.month} 月 ${t.day} 日｜${t.active===false?'停用':'啟用'}`]);if(!templates.length)root.append(textNode('p','尚未建立年度稅務設定。','hint'))}
async function generateYearTaxes(){const year=Number($('generateTaxYear').value);if(!Number.isInteger(year)||year<1900||year>2200){message('請輸入有效年度');return}const templates=(await all('taxTemplates')).filter(t=>t.active!==false);if(!templates.length){message('請先新增年度稅務設定');return}if(!confirm(`依 ${templates.length} 筆設定檢查並建立 ${year} 年稅單？既有稅單不會覆寫。`))return;
 let count=0;try{await txWrite(['taxBills'],tx=>{const store=tx.objectStore('taxBills');const req=store.getAll();req.onsuccess=()=>{const existing=req.result;for(const t of templates){if(existing.some(b=>b.sourceTemplateId===t.id&&b.year===year))continue;const b={id:uid(),sourceTemplateId:t.id,year,name:t.name,due:templateDue(year,t.month,t.day),amountCents:null,paidCents:0,status:'amount-pending',createdAt:new Date().toISOString()};store.put(b);audit(tx,'create','taxBills',b.id,b);existing.push(b);count++}};req.onerror=()=>tx.abort()});await render();message(`年度稅單檢查完成，新增 ${count} 筆，原有資料保留。`)}catch{message('年度稅單建立失敗，資料未變更')}}
async function createCardTransaction(e){e.preventDefault();const f=e.currentTarget,v=formData(f);if(!validMoney(v.amount)||!safeDate(v.spentAt)){message('請輸入有效消費日期及金額');return}const amount=cents(v.amount);
 try{await txWrite(['cardPeriods','cardTransactions'],tx=>{const r=tx.objectStore('cardPeriods').get(v.periodId);r.onsuccess=()=>{const p=r.result;if(!p||v.spentAt<p.start||v.spentAt>p.end){tx.abort();return}const t={id:uid(),cardId:p.cardId,periodId:p.id,spentAt:v.spentAt,amountCents:amount,note:(v.note||'').trim(),createdAt:new Date().toISOString()};tx.objectStore('cardTransactions').put(t);audit(tx,'create','cardTransactions',t.id,t)};r.onerror=()=>tx.abort()});f.reset();await render();message('信用卡消費已記錄') }catch{message('消費日期必須在選擇的期間內，原資料未變更')}}
// 信用卡消費修改：只更新原交易；不建立修改前快照或 audit 紀錄。
async function updateCardTransaction(transactionId,period,form){
 const v=formData(form);
 if(!safeDate(v.spentAt)||!validMoney(v.amount)||!/^\d+$/.test(String(v.amount))){message('請輸入有效日期與大於 0 的整數金額');return}
 if(v.spentAt<period.start||v.spentAt>period.end){message(`消費日期必須介於 ${period.start} 至 ${period.end}，原資料未變更`);return}
 const amount=cents(v.amount);
 try{
  await txWrite(['cardTransactions'],tx=>{
   const store=tx.objectStore('cardTransactions'),req=store.get(transactionId);
   req.onsuccess=()=>{
    const current=req.result;
    if(!current||current.periodId!==period.id){tx.abort();return}
    current.spentAt=v.spentAt;current.amountCents=amount;current.note=(v.note||'').trim();
    store.put(current);
   };
   req.onerror=()=>tx.abort();
  });
  await render();message('信用卡消費已修改，最低消費金額已重新計算');
 }catch{message('信用卡消費修改失敗，原資料未變更')}
}
function cardTransactionItem(t,p){
 const card=element('article',{class:'item'});
 const info=element('div');
 info.append(textNode('strong',`${p.cardName}｜${t.spentAt}｜消費`),textNode('small',`${money(t.amountCents/100)}${t.note?'｜'+t.note:''}`));
 const button=element('button',{type:'button',text:'修改'});
 button.addEventListener('click',()=>{
  button.hidden=true;
  const form=element('form',{class:'card-edit-form'});
  const dateLabel=element('label',{text:'消費日期'}),date=element('input',{type:'date',name:'spentAt',required:'required',min:p.start,max:p.end});date.value=t.spentAt;dateLabel.append(date);
  const amountLabel=element('label',{text:'金額（整數元）'}),amount=element('input',{type:'number',name:'amount',min:'1',step:'1',required:'required'});amount.value=String(Math.round(t.amountCents/100));amountLabel.append(amount);
  const noteLabel=element('label',{text:'備註'}),note=element('input',{name:'note',maxlength:'120'});note.value=t.note||'';noteLabel.append(note);
  const save=element('button',{type:'submit',text:'儲存修改',class:'primary'}),cancel=element('button',{type:'button',text:'取消'});
  cancel.addEventListener('click',()=>{form.remove();button.hidden=false});
  form.addEventListener('submit',async e=>{e.preventDefault();save.disabled=true;await updateCardTransaction(t.id,p,form);save.disabled=false});
  form.append(dateLabel,amountLabel,noteLabel,save,cancel);card.append(form);
 });
 card.append(info,button);return card;
}
async function renderCardSection(periods){
 const transactions=await all('cardTransactions'),refunds=await all('cardRefunds'),select=$('cardPeriodSelect');
 const prior=select.value;select.replaceChildren();$('cardTransactionList').replaceChildren();
 for(const p of [...periods].sort((a,b)=>b.start.localeCompare(a.start))){
  const o=element('option',{value:p.id,text:`${p.cardName}｜${p.start}～${p.end}`});select.append(o);
  const txs=transactions.filter(t=>t.periodId===p.id);
  const sum=txs.reduce((n,t)=>n+t.amountCents,0)-refunds.filter(r=>r.periodId===p.id).reduce((n,r)=>n+r.amountCents,0);
  const left=Math.max(0,p.thresholdCents-sum),status=sum>=p.thresholdCents?'已達標':p.end<today()?'逾期未達標':'未達標';
  addItem($('cardList'),`${p.cardName}｜${p.start}～${p.end}`,[`最低消費 ${money(p.thresholdCents/100)}｜淨消費 ${money(sum/100)}`,`尚差 ${money(left/100)}｜${status}`]);
  for(const t of txs.sort((a,b)=>b.spentAt.localeCompare(a.spentAt)))$('cardTransactionList').append(cardTransactionItem(t,p));
 }
 if([...select.options].some(o=>o.value===prior))select.value=prior;
 if(!periods.length)$('cardTransactionList').append(textNode('p','請先建立信用卡消費期間。','hint'));
}

let historyRows=[];
async function renderHistory(plans,inst,tax,ip,tp){const cards=await all('cards'),periods=await all('cardPeriods'),txs=await all('cardTransactions'),refunds=await all('cardRefunds');const planById=new Map(plans.map(x=>[x.id,x])),instById=new Map(inst.map(x=>[x.id,x])),billById=new Map(tax.map(x=>[x.id,x])),cardById=new Map(cards.map(x=>[x.id,x])),periodById=new Map(periods.map(x=>[x.id,x]));const rows=[];
 for(const p of ip){const i=instById.get(p.installmentId),plan=i&&planById.get(i.planId);rows.push({category:'installment',date:p.paidAt,name:`${plan?.name||'分期'} 第 ${i?.number||'?'} 期`,type:'付款',amount:p.amountCents,note:p.note||'',status:p.reconciled?'已核對':'待核對',id:p.id})}
 for(const p of tp){const b=billById.get(p.taxBillId);rows.push({category:'tax',date:p.paidAt,name:`${b?.year||''} 年｜${b?.name||'稅務'}`,type:'付款',amount:p.amountCents,note:p.note||'',status:p.reconciled?'已核對':'待核對',id:p.id})}
 for(const t of txs){const p=periodById.get(t.periodId);rows.push({category:'card',date:t.spentAt||t.date||'',name:cardById.get(t.cardId)?.name||p?.cardName||'信用卡',type:'消費',amount:t.amountCents||0,note:t.note||'',status:'已記錄',id:t.id})}
 for(const r of refunds){const original=txs.find(t=>t.id===r.transactionId||t.id===r.cardTransactionId);rows.push({category:'card',date:r.refundedAt||r.date||'',name:cardById.get(original?.cardId)?.name||'信用卡',type:'退款',amount:r.amountCents||0,note:r.note||'',status:'已記錄',id:r.id})}
 const cat=$('historyCategory').value,q=$('historySearch').value.trim().toLocaleLowerCase('zh-TW');historyRows=rows.filter(r=>(cat==='all'||cat===r.category)&&[r.date,r.name,r.note,r.type,r.status].join(' ').toLocaleLowerCase('zh-TW').includes(q)).sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id));const root=$('historyList');root.replaceChildren();for(const r of historyRows){const line=element('article',{class:'history-row'}),left=element('div');left.append(element('strong',{text:`${r.date}｜${r.name}｜${r.type}`}),textNode('small',`${r.status}${r.note?'｜'+r.note:''}`));line.append(left,element('strong',{class:'history-money',text:money(r.amount/100)}));root.append(line)}if(!historyRows.length)root.append(textNode('p','沒有符合條件的交易紀錄。','hint'))}
function exportHistoryCsv(){const lines=[['日期','類別','名稱','交易類型','金額(元)','狀態','備註'],...historyRows.map(r=>[r.date,r.category,r.name,r.type,String(Math.round(r.amount/100)),r.status,r.note])];const csv='\ufeff'+lines.map(row=>row.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='V2.2-交易歷史.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000)}
function printHistory(){const rows=historyRows.map(r=>`<tr><td>${escapeHtml(r.date)}</td><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.type)}</td><td>${money(r.amount/100)}</td><td>${escapeHtml(r.status)}</td></tr>`).join('');const w=window.open('','_blank');if(!w){message('瀏覽器封鎖了列印視窗，請允許彈出視窗');return}w.document.write(`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><title>V2.2 交易歷史</title><style>body{font-family:sans-serif;padding:20px}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #ddd;padding:9px;text-align:left}</style><h2>付款與消費歷史</h2><table><tr><th>日期</th><th>名稱</th><th>類型</th><th>金額</th><th>狀態</th></tr>${rows}</table></html>`);w.document.close();w.focus();w.print()}
function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

async function init(){try{db=await openDb();document.querySelectorAll('nav button').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('nav button').forEach(x=>x.classList.toggle('active',x===b));document.querySelectorAll('.page').forEach(x=>x.classList.toggle('active',x.id===b.dataset.tab));$('message').textContent=''}));$('planSearch').addEventListener('input',e=>{planView.search=e.target.value;planView.page=1;render()});$('planFilter').addEventListener('change',e=>{planView.filter=e.target.value;planView.page=1;render()});$('backToPlans').addEventListener('click',()=>{planView.selectedId=null;render();$('plans').scrollIntoView({block:'start'})});$('planForm').addEventListener('submit',createPlan);$('taxForm').addEventListener('submit',createTax);$('cardForm').addEventListener('submit',createCard);$('cardTransactionForm').addEventListener('submit',createCardTransaction);$('taxTemplateForm').addEventListener('submit',createTaxTemplate);$('generateTaxBills').addEventListener('click',generateYearTaxes);$('generateTaxYear').value=new Date().getFullYear();$('historyCategory').addEventListener('change',()=>render());$('historySearch').addEventListener('input',()=>render());$('clearHistory').addEventListener('click',()=>{$('historyCategory').value='all';$('historySearch').value='';render()});$('historyCsv').addEventListener('click',exportHistoryCsv);$('historyPdf').addEventListener('click',printHistory);$('download').addEventListener('click',exportData);$('taxForm').elements.year.value=new Date().getFullYear();await render()}catch(err){message(`無法啟動資料庫：${err.message}`);document.querySelectorAll('form button').forEach(x=>x.disabled=true)}}init();
