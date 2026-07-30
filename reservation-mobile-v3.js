(()=>{
  const API=window.Zorbas;
  const dialog=document.getElementById('reserveDialog');
  const modal=dialog?.querySelector('.modal');
  if(!API||!dialog||!modal)return;

  const css=document.createElement('link');
  css.rel='stylesheet';css.href='/reservation-mobile-v3.css?v=20260730-1';css.dataset.crv3='1';document.head.appendChild(css);
  dialog.classList.add('crv3');
  const app=document.createElement('section');app.className='crv3-app';modal.appendChild(app);
  const state={catalog:{areas:[]},tables:[],area:null,table:null,view:'tables',loading:false,date:'',time:'',guests:2,reservation:null};
  const labels={available:'СВОБОДНА',reserved:'РЕЗЕРВИРАНА',occupied:'ЗАЕТА'};

  const esc=value=>API.esc(String(value??''));
  const slot=()=>{const d=new Date();d.setSeconds(0,0);d.setMinutes(Math.ceil(d.getMinutes()/15)*15);return{date:API.localDate(d),time:`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`}};
  async function ensureCatalog(){if(state.catalog.areas.length)return;state.catalog=await API.rpc('zorbas_public_catalog');state.area=state.catalog.areas[0]?.id||null;}
  async function open(){
    const d=slot();state.date=d.date;state.time=d.time;state.guests=2;state.table=null;state.view='tables';state.reservation=null;
    try{await ensureCatalog();render();await loadTables();}catch(error){API.toast(error.message,'error');}
  }
  async function loadTables(){
    state.loading=true;render();
    try{state.tables=await API.rpc('zorbas_public_availability',{p_date:state.date,p_time:state.time,p_duration_minutes:120});}
    catch(error){API.toast(error.message,'error');}
    finally{state.loading=false;render();}
  }
  function head(kicker='РЕЗЕРВАЦИЯ',right=''){return `<header class="crv3-head"><div class="crv3-brand"><small>${kicker}</small><strong>ZORBAS</strong></div>${right?`<span>${right}</span>`:''}</header>`;}
  function render(){state.view==='details'?renderDetails():state.view==='success'?renderSuccess():renderTables();}
  function renderTables(){
    const area=state.catalog.areas.find(x=>x.id===state.area);
    const tables=state.tables.filter(x=>x.area_id===state.area).sort((a,b)=>String(a.table_number).localeCompare(String(b.table_number),'bg',{numeric:true}));
    app.innerHTML=head('РЕЗЕРВАЦИЯ',`${state.date.split('-').reverse().join('.')} · ${state.time}`)+`<main class="crv3-main"><div class="crv3-title"><div><small>ИЗБЕРИ МАСА</small><h2>${esc(area?.name||'Маси')}</h2></div><span class="crv3-count">${tables.length} маси</span></div><div class="crv3-legend"><span><i class="free"></i>Свободна</span><span><i class="reserved"></i>Резервирана</span><span><i class="occupied"></i>Заета</span></div><div class="crv3-areas">${state.catalog.areas.map(x=>`<button type="button" class="crv3-area ${x.id===state.area?'active':''}" data-area="${x.id}">${esc(x.name)}</button>`).join('')}</div><div class="crv3-grid">${state.loading?'<div class="crv3-loading">Проверявам масите…</div>':tables.map(t=>{const s=t.state||(t.available?'available':'reserved');const cls=s==='available'?'free':s;return `<button type="button" class="crv3-table ${cls}" data-table="${t.id}" ${s==='available'?'':'disabled'}><span class="crv3-state">${labels[s]||'НЕСВОБОДНА'}</span><span><b class="crv3-num">${esc(t.table_number)}</b><small class="crv3-seats">${t.seats} места</small></span></button>`;}).join('')}</div></main>`;
    app.querySelectorAll('[data-area]').forEach(b=>b.onclick=()=>{state.area=b.dataset.area;state.table=null;renderTables();});
    app.querySelectorAll('[data-table]').forEach(b=>b.onclick=()=>{state.table=b.dataset.table;state.view='details';render();});
  }
  function renderDetails(){
    const table=state.tables.find(x=>x.id===state.table);if(!table){state.view='tables';render();return;}
    app.innerHTML=head('СТЪПКА 2',`Маса ${esc(table.table_number)}`)+`<main class="crv3-main"><button class="crv3-back" type="button" data-back>← Към масите</button><div class="crv3-summary"><div><small>ИЗБРАНА МАСА</small><strong>Маса ${esc(table.table_number)}</strong></div><span>${table.seats} места</span></div><form class="crv3-form" id="crv3Form"><div class="crv3-fields"><label class="crv3-label"><span>За коя дата</span><input class="crv3-input" type="date" name="date" min="${API.localDate(new Date())}" value="${state.date}" required></label><label class="crv3-label"><span>В колко часа</span><input class="crv3-input" type="time" name="time" step="900" value="${state.time}" required></label><label class="crv3-label"><span>Колко човека</span><input class="crv3-input" type="number" name="guests" min="1" max="${table.seats}" value="${Math.min(state.guests,table.seats)}" required></label><label class="crv3-label"><span>Име</span><input class="crv3-input" name="name" autocomplete="name" placeholder="Вашето име" required></label><label class="crv3-label crv3-full"><span>Телефон</span><input class="crv3-input" type="tel" name="phone" autocomplete="tel" placeholder="08…" required></label><label class="crv3-label crv3-full"><span>Бележка по желание</span><textarea class="crv3-input crv3-note" name="note" placeholder="Детско столче, повод…"></textarea></label></div><div class="crv3-slot" id="crv3Slot">Проверявам избрания час…</div><button class="crv3-primary" id="crv3Submit" type="submit">РЕЗЕРВИРАЙ МАСА ${esc(table.table_number)}</button></form></main>`;
    app.querySelector('[data-back]').onclick=async()=>{state.view='tables';state.table=null;render();await loadTables();};
    const form=app.querySelector('#crv3Form');let timer;
    form.querySelectorAll('[name=date],[name=time],[name=guests]').forEach(i=>i.onchange=()=>{clearTimeout(timer);timer=setTimeout(()=>checkSlot(false),120);});
    form.onsubmit=submit;checkSlot(false);
  }
  function values(){const f=app.querySelector('#crv3Form');if(!f)return null;const d=new FormData(f);return{date:d.get('date'),time:d.get('time'),guests:Number(d.get('guests')),name:String(d.get('name')||'').trim(),phone:String(d.get('phone')||'').trim(),note:String(d.get('note')||'').trim()};}
  async function checkSlot(showToast=true){
    const v=values(),status=app.querySelector('#crv3Slot'),button=app.querySelector('#crv3Submit');if(!v)return false;
    state.date=v.date;state.time=v.time;state.guests=v.guests;if(status){status.className='crv3-slot';status.textContent='Проверявам избрания час…';}if(button)button.disabled=true;
    try{const fresh=await API.rpc('zorbas_public_availability',{p_date:v.date,p_time:v.time,p_duration_minutes:120});const t=fresh.find(x=>x.id===state.table);const ok=Boolean(t&&t.state==='available'&&Number(t.seats)>=v.guests);if(status){status.className=`crv3-slot ${ok?'ok':'bad'}`;status.textContent=ok?'✓ Масата е свободна за този час.':!t||t.state!=='available'?'Масата е резервирана или заета за този час.':'Масата няма достатъчно места.';}if(button)button.disabled=!ok;if(showToast&&!ok)API.toast('Избери друг час или друга маса.','error');return ok;}catch(error){if(status){status.className='crv3-slot bad';status.textContent='Не успях да проверя часа.';}if(showToast)API.toast(error.message,'error');return false;}
  }
  async function submit(event){
    event.preventDefault();const v=values(),table=state.tables.find(x=>x.id===state.table);if(!v||!table)return;if(!await checkSlot(true))return;const button=app.querySelector('#crv3Submit');button.disabled=true;button.textContent='ЗАПИСВАМ…';
    try{const result=await API.rpc('zorbas_public_reserve',{p_name:v.name,p_phone:v.phone,p_guests:v.guests,p_date:v.date,p_time:v.time,p_duration_minutes:120,p_table_id:state.table,p_note:v.note||null});state.reservation={...result,phone:v.phone,table_number:table.table_number,date:v.date,time:v.time};reservationContext=state.reservation;state.view='success';render();API.toast('Масата е резервирана.','success');}catch(error){API.toast(error.message,'error');button.disabled=false;button.textContent=`РЕЗЕРВИРАЙ МАСА ${table.table_number}`;}
  }
  function renderSuccess(){const r=state.reservation;if(!r){state.view='tables';render();return;}app.innerHTML=head('ГОТОВО')+`<main class="crv3-main crv3-success"><div class="crv3-check">✓</div><h2>Масата е резервирана.</h2><p>Маса ${esc(r.table_number)} · ${r.date.split('-').reverse().join('.')} · ${r.time}<br>Покажи кода при пристигане.</p><div class="crv3-code">${esc(r.code)}</div><button class="crv3-primary" type="button" data-food>🍽 ИЗБЕРИ ХРАНА ЗА ПРИСТИГАНЕТО</button><button class="crv3-secondary" type="button" data-done>ГОТОВО, БЕЗ ХРАНА</button></main>`;app.querySelector('[data-food]').onclick=()=>openPreorder();app.querySelector('[data-done]').onclick=()=>dialog.close();}

  new MutationObserver(()=>{if(dialog.open)open();}).observe(dialog,{attributes:true,attributeFilter:['open']});
  if(dialog.open)open();
})();
