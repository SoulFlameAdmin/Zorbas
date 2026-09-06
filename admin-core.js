const Z=window.Zorbas;
let snapshot=null,activeView='adminStats',selectedArea=null,selectedTable=null,orderType='dine_in',orderCategory='all',cart=[],editingProduct=null,dirtyPrices=new Map();
Z.registerPwa();document.querySelectorAll('[data-install-pwa]').forEach(b=>b.onclick=Z.installPwa);
const $=id=>document.getElementById(id);

function finishBoot(){
  clearTimeout(window.__zorbasBootTimer);
  const boot=$('zorbasBoot');
  document.documentElement.classList.remove('zorbas-booting');
  document.documentElement.classList.add('zorbas-ready');
  if(boot){boot.classList.add('done');setTimeout(()=>boot.remove(),220);}
}

async function init(){
  try{
    const session=await Z.requireSession();
    if(!session)return showLogin();
    $('loginView').classList.add('hidden');
    $('appView').classList.remove('hidden');
    $('sessionName').textContent=`${session.display_name} · ${session.role}`;
    await refresh();
    await loadShift();
    const requested=new URLSearchParams(location.search).get('view');
    const allowed=['tables','order','orders','manager','archive','reservations','menuAdmin','adminStats','ops'];
    switchView(allowed.includes(requested)?requested:'adminStats');
    finishBoot();
  }catch(error){
    console.error('Zorbas init failed',error);
    showLogin('Неуспешно зареждане. Провери връзката и опитай отново.');
  }
}
function showLogin(message=''){
  $('loginView').classList.remove('hidden');
  $('appView').classList.add('hidden');
  if(message)$('loginMessage').textContent=message;
  finishBoot();
  setTimeout(()=>$('loginForm')?.elements?.password?.focus({preventScroll:true}),80);
}
$('loginForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);$('loginMessage').textContent='Влизане…';try{const data=await Z.rpc('zorbas_staff_login',{p_username:f.get('username'),p_password:f.get('password'),p_display_name:f.get('display_name'),p_device_id:Z.deviceId()});Z.setToken(data.token);location.reload();}catch(error){$('loginMessage').textContent=error.message;}};
$('logoutButton').onclick=Z.logout;

async function refresh(){try{snapshot=await Z.rpc('zorbas_staff_snapshot',{p_token:Z.token()});selectedArea=selectedArea||snapshot.areas[0]?.id;renderAll();}catch(error){Z.toast(error.message,'error');if(error.message.includes('сесия'))Z.logout();}}
document.querySelectorAll('[data-refresh]').forEach(b=>b.onclick=refresh);$('refreshButton').onclick=refresh;
function renderAll(){renderAreaTabs();renderMap();renderCategoryTabs();renderProducts();renderCart();renderOrders();renderReservations();renderMenuAdmin();fillProductSelects();}

function switchView(name){activeView=name;document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id===`view-${name}`));document.querySelectorAll('.nav [data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===name));const next=new URL(location.href);next.searchParams.set('view',name);history.replaceState(null,'',next);if(name==='orders'||name==='reservations')refresh();}
document.querySelectorAll('.nav [data-view]').forEach(b=>b.onclick=()=>switchView(b.dataset.view));

async function loadShift(){try{const s=await Z.rpc('zorbas_shift_status_v3',{p_token:Z.token()});const active=Boolean(s.id);$('shiftText').textContent=active?`🟢 На работа от ${Z.formatDate(s.started_at)}`:'⚪ Извън работа';$('shiftButton').textContent=active?'Приключвам смяна':'Започвам смяна';$('shiftButton').className=`btn ${active?'red':'green'} full`;$('shiftButton').dataset.active=String(active);}catch{}}
$('shiftButton').onclick=async()=>{try{await Z.rpc('zorbas_toggle_shift_v3',{p_token:Z.token(),p_start:$('shiftButton').dataset.active!=='true'});loadShift();}catch(error){Z.toast(error.message,'error');}};

function renderAreaTabs(){const root=$('tableAreaTabs');root.innerHTML=snapshot.areas.map(a=>`<button class="tab ${a.id===selectedArea?'active':''}" data-area="${a.id}">${Z.esc(a.name)}</button>`).join('');root.querySelectorAll('[data-area]').forEach(b=>b.onclick=()=>{selectedArea=b.dataset.area;selectedTable=null;renderAreaTabs();renderMap();});}
function chairs(seats){const p=['t','b','l','r','t','b','l','r'];return Array.from({length:Math.min(Number(seats||4),8)},(_,i)=>`<i class="chair ${p[i]}" style="${i>3?`transform:${p[i]==='t'||p[i]==='b'?'translateX(12px)':'translateY(12px)'}`:''}"></i>`).join('');}
function tableHasActiveOrder(id){return snapshot.orders.some(o=>o.table_id===id&&!['cancelled','completed','returned'].includes(o.status));}
function renderMap(){const map=$('staffMap'),area=snapshot.areas.find(a=>a.id===selectedArea),tables=snapshot.tables.filter(t=>t.area_id===selectedArea);map.style.aspectRatio=`${Number(area?.map_width||100)}/${Number(area?.map_height||70)}`;map.innerHTML=tables.map(t=>{const state=t.status==='blocked'?'blocked':tableHasActiveOrder(t.id)||t.status==='occupied'?'occupied':'';return `<button class="table-node ${state} ${selectedTable===t.id?'selected':''}" data-table="${t.id}" style="left:${t.x}%;top:${t.y}%;width:${t.width}%;height:${t.height}%;transform:rotate(${t.rotation||0}deg)">${chairs(t.seats)}<span>${Z.esc(t.table_number)}<small>${t.seats} места</small></span></button>`;}).join('');map.querySelectorAll('[data-table]').forEach(b=>b.onclick=()=>{selectedTable=b.dataset.table;renderMap();renderTableInfo();});}
function renderTableInfo(){const t=snapshot.tables.find(x=>x.id===selectedTable),area=snapshot.areas.find(a=>a.id===t?.area_id),orders=snapshot.orders.filter(o=>o.table_id===selectedTable&&!['completed'].includes(o.status));if(!t)return $('tableInfo').innerHTML='<p class="empty">Натисни маса.</p>';$('tableInfo').innerHTML=`<h3 style="margin-top:0">${Z.esc(area?.name)} · Маса ${Z.esc(t.table_number)}</h3><div class="form-grid"><label class="field">Номер<input id="tableNumber" value="${Z.esc(t.table_number)}"></label><label class="field">Столове<input id="tableSeats" type="number" value="${t.seats}"></label><label class="field">X %<input id="tableX" type="number" value="${t.x}"></label><label class="field">Y %<input id="tableY" type="number" value="${t.y}"></label></div><div class="toolbar"><button class="btn primary" id="orderForTable">НОВА ПОРЪЧКА</button><button class="btn" id="saveTable">ЗАПАЗИ МАСАТА</button></div>${orders.length?`<hr style="border-color:var(--line)"><p>${orders.length} активни поръчки.</p>`:''}`;$('orderForTable').onclick=()=>{orderType='dine_in';updateOrderType();switchView('order');};$('saveTable').onclick=async()=>{try{await Z.rpc('zorbas_save_table_v3',{p_token:Z.token(),p_table:{...t,table_number:$('tableNumber').value,seats:Number($('tableSeats').value),x:Number($('tableX').value),y:Number($('tableY').value)}});Z.toast('Масата е запазена.','success');refresh();}catch(error){Z.toast(error.message,'error');}};}