const Z = window.Zorbas;
let catalog = {categories:[],items:[],areas:[]};
let menuCategory = 'all';
let pickupCategory = 'all';
let availability = [];
let selectedArea = null;
let selectedTable = null;
let reservationContext = null;
let pickupCart = [];
let preorderCart = [];

Z.registerPwa();
const pageLoader = document.getElementById('pageLoader');
let pageTransitionBusy = false;
function runPageTransition(action){
  if(pageTransitionBusy)return;
  pageTransitionBusy=true;
  pageLoader.classList.remove('is-hidden');
  pageLoader.classList.add('is-visible');
  document.body.classList.add('page-transitioning');
  setTimeout(action,320);
  setTimeout(()=>{
    pageLoader.classList.remove('is-visible');
    pageLoader.classList.add('is-hidden');
    document.body.classList.remove('page-transitioning');
    pageTransitionBusy=false;
  },700);
}
window.addEventListener('load',()=>setTimeout(()=>pageLoader.classList.add('is-hidden'),700));

document.querySelectorAll('[data-install-pwa]').forEach(b => b.addEventListener('click', Z.installPwa));
document.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => {
  const destination = b.dataset.open === 'menuDialog'
    ? '/menu.html'
    : b.dataset.open === 'pickupDialog'
      ? '/order.html'
      : null;
  runPageTransition(() => {
    if (destination) {
      location.href = destination;
      return;
    }
    document.getElementById(b.dataset.open).showModal();
  });
}));
document.querySelectorAll('dialog .close').forEach(b => b.addEventListener('click', () => runPageTransition(() => b.closest('dialog').close())));
document.querySelectorAll('dialog').forEach(d => d.addEventListener('click', e => { if (e.target === d) runPageTransition(() => d.close()); }));
document.querySelectorAll('a[href^="/"]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); runPageTransition(() => { location.href = a.href; }); }));

async function boot() {
  try {
    catalog = await Z.rpc('zorbas_public_catalog');
    selectedArea = catalog.areas[0]?.id || null;
    renderMenuTabs();
    renderMenu();
    renderPickupTabs();
    renderPickupMenu();
    renderAreaTabs();
  } catch (error) {
    Z.toast(error.message, 'error');
  }
  const now = new Date();
  document.querySelector('#reserveSearch [name=date]').min = Z.localDate(now);
  document.querySelector('#reserveSearch [name=date]').value = Z.localDate(now);
  now.setMinutes(now.getMinutes() + 60);
  document.querySelector('#reserveSearch [name=time]').value = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  const pickupTime = new Date(Date.now() + 60 * 60 * 1000);
  document.querySelector('#pickupForm [name=ready]').min = Z.localDateTimeValue(new Date());
  document.querySelector('#pickupForm [name=ready]').value = Z.localDateTimeValue(pickupTime);
  loadPoll();
}

function categoryTabs(container, active, callback) {
  container.innerHTML = `<button class="tab ${active==='all'?'active':''}" data-cat="all">Всичко</button>` + catalog.categories.map(c => `<button class="tab ${active===c.id?'active':''}" data-cat="${c.id}">${Z.esc(c.name)}</button>`).join('');
  container.querySelectorAll('[data-cat]').forEach(btn => btn.addEventListener('click', () => callback(btn.dataset.cat)));
}
function renderMenuTabs(){ categoryTabs(document.getElementById('menuTabs'), menuCategory, cat => {menuCategory=cat;renderMenuTabs();renderMenu();}); }
function renderPickupTabs(){ categoryTabs(document.getElementById('pickupTabs'), pickupCategory, cat => {pickupCategory=cat;renderPickupTabs();renderPickupMenu();}); }
function filteredItems(category, pickupOnly=false){ return catalog.items.filter(i => (category==='all'||i.category_id===category) && (!pickupOnly||i.available_for_pickup)); }
function photoStyle(item){ return item.image_url ? `style="background-image:linear-gradient(#0002,#0004),url('${Z.esc(item.image_url)}');color:white"` : ''; }
function priceText(item){ return item.price_pending ? 'Цена в заведението' : Z.money(item.price); }
function dishHtml(item, mode='menu') {
  const action = mode==='menu' ? `<button class="mini-btn primary" data-add-pickup="${item.id}">ПОРЪЧАЙ</button>` : `<button class="mini-btn primary" data-add-${mode}="${item.id}">ДОБАВИ</button>`;
  return `<article class="dish-card"><div class="dish-photo" ${photoStyle(item)}>${item.image_url?'':Z.esc(item.name)}</div><div class="dish-body"><h3>${Z.esc(item.name)}</h3><p>${Z.esc(item.description||'')}</p><div><span class="ar-badge">AR · COMING SOON</span></div><div class="dish-foot"><span class="price">${priceText(item)}</span><div class="mini-actions"><button class="mini-btn" data-ar>AR</button>${action}</div></div></div></article>`;
}
function bindDishActions(root) {
  root.querySelectorAll('[data-ar]').forEach(b => b.addEventListener('click', () => Z.toast('AR визуализацията е Coming Soon.')));
  root.querySelectorAll('[data-add-pickup]').forEach(b => b.addEventListener('click', () => addCart(pickupCart,b.dataset.addPickup,renderPickupCart)));
  root.querySelectorAll('[data-add-preorder]').forEach(b => b.addEventListener('click', () => addCart(preorderCart,b.dataset.addPreorder,renderPreorderCart)));
}
function renderMenu(){ const root=document.getElementById('menuGrid');root.innerHTML=filteredItems(menuCategory).map(i=>dishHtml(i,'menu')).join('')||'<p>Няма продукти.</p>';bindDishActions(root); }
function renderPickupMenu(){ const root=document.getElementById('pickupMenu');root.innerHTML=filteredItems(pickupCategory,true).map(i=>dishHtml(i,'pickup')).join('')||'<p>Няма продукти.</p>';bindDishActions(root); }

function addCart(cart,id,render){ const item=catalog.items.find(i=>i.id===id);if(!item)return;const row=cart.find(x=>x.menu_item_id===id);row?row.quantity++:cart.push({menu_item_id:id,quantity:1,note:'',meta:{mode:item.quantity_mode==='piece'?'piece':'portion'}});render();Z.toast(`${item.name} е добавено.`,'success'); }
function cartHtml(cart,prefix){ if(!cart.length)return '<p class="status">Няма добавени продукти.</p>';return cart.map((row,index)=>{const item=catalog.items.find(i=>i.id===row.menu_item_id);return `<div class="cart-row"><div><h4>${Z.esc(item?.name||'Продукт')}</h4><p>${priceText(item||{})}</p>${item?.quantity_mode==='portion_or_piece'?`<select data-cart-mode="${prefix}:${index}" style="margin-top:7px;min-height:32px"><option value="portion" ${row.meta.mode==='portion'?'selected':''}>Порция</option><option value="piece" ${row.meta.mode==='piece'?'selected':''}>Бройки</option></select>`:''}</div><div class="qty"><button data-cart-minus="${prefix}:${index}">−</button><b>${row.quantity}</b><button data-cart-plus="${prefix}:${index}">+</button></div></div>`;}).join(''); }
function bindCart(root,cart,prefix,render){root.querySelectorAll('[data-cart-minus]').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.cartMinus.split(':')[1]);cart[i].quantity--;if(cart[i].quantity<=0)cart.splice(i,1);render();});root.querySelectorAll('[data-cart-plus]').forEach(b=>b.onclick=()=>{cart[Number(b.dataset.cartPlus.split(':')[1])].quantity++;render();});root.querySelectorAll('[data-cart-mode]').forEach(s=>s.onchange=()=>{cart[Number(s.dataset.cartMode.split(':')[1])].meta.mode=s.value;});}
function renderPickupCart(){const root=document.getElementById('pickupCart');root.innerHTML=cartHtml(pickupCart,'pickup');bindCart(root,pickupCart,'pickup',renderPickupCart);const total=pickupCart.reduce((s,r)=>s+(catalog.items.find(i=>i.id===r.menu_item_id)?.price||0)*r.quantity,0);document.getElementById('pickupTotal').textContent=Z.money(total);}
function renderPreorderCart(){const root=document.getElementById('preorderCart');root.innerHTML=cartHtml(preorderCart,'preorder');bindCart(root,preorderCart,'preorder',renderPreorderCart);}

function renderAreaTabs(){const root=document.getElementById('areaTabs');root.innerHTML=catalog.areas.map(a=>`<button class="tab ${selectedArea===a.id?'active':''}" data-area="${a.id}">${Z.esc(a.name)}</button>`).join('');root.querySelectorAll('[data-area]').forEach(b=>b.onclick=()=>{selectedArea=b.dataset.area;selectedTable=null;renderAreaTabs();renderPublicMap();});}
function chairNodes(seats){const count=Math.min(Number(seats||4),8);const positions=['t','b','l','r','t','b','l','r'];return Array.from({length:count},(_,i)=>`<i class="chair ${positions[i]}" style="${i>3?`transform:${positions[i]==='t'||positions[i]==='b'?'translateX(12px)':'translateY(12px)'}`:''}"></i>`).join('');}
function tableShapeRadius(shape){return shape==='circle'?'50%':shape==='square'?'4px':'12px';}
function renderPublicMap(){const map=document.getElementById('publicTableMap');const area=catalog.areas.find(a=>a.id===selectedArea);const tables=availability.filter(t=>t.area_id===selectedArea);map.style.aspectRatio=`${Number(area?.map_width||100)}/${Number(area?.map_height||70)}`;map.innerHTML=`<span class="area-title">${Z.esc(area?.name||'Зона')}</span>`+tables.map(t=>`<button class="table-node ${t.available?'':'busy'} ${selectedTable===t.id?'selected':''}" ${t.available?'':'disabled'} data-table="${t.id}" style="left:${t.x}%;top:${t.y}%;width:${t.width}%;height:${t.height}%;border-radius:${tableShapeRadius(t.shape)};transform:rotate(${t.rotation||0}deg)">${chairNodes(t.seats)}<span>${Z.esc(t.table_number)}<small>${t.seats} места</small></span></button>`).join('');map.querySelectorAll('[data-table]').forEach(b=>b.onclick=()=>{selectedTable=b.dataset.table;renderPublicMap();const table=availability.find(t=>t.id===selectedTable);document.getElementById('selectedTableText').textContent=`Избрана: ${area?.name} · Маса ${table.table_number} · ${table.seats} места`;document.getElementById('reserveDetails').classList.remove('hidden');});}

document.getElementById('reserveSearch').addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{availability=await Z.rpc('zorbas_public_availability',{p_date:f.get('date'),p_time:f.get('time'),p_duration_minutes:Number(f.get('duration'))});selectedTable=null;document.getElementById('reserveDetails').classList.add('hidden');renderAreaTabs();renderPublicMap();}catch(error){Z.toast(error.message,'error');}});
document.getElementById('reserveDetails').addEventListener('submit',async e=>{e.preventDefault();if(!selectedTable)return Z.toast('Изберете маса.','error');const search=new FormData(document.getElementById('reserveSearch'));const detail=new FormData(e.currentTarget);try{const result=await Z.rpc('zorbas_public_reserve',{p_name:detail.get('name'),p_phone:detail.get('phone'),p_guests:Number(search.get('guests')),p_date:search.get('date'),p_time:search.get('time'),p_duration_minutes:Number(search.get('duration')),p_table_id:selectedTable,p_note:detail.get('note')||null});reservationContext={...result,phone:detail.get('phone')};document.getElementById('reservationSuccess').innerHTML=`<div class="success-box"><h3>Масата е резервирана.</h3><p>Код: <b>${Z.esc(result.code)}</b></p><button class="action" id="addPreorder" type="button">ДОБАВИ ХРАНА ЗА ПРИСТИГАНЕТО</button></div>`;document.getElementById('addPreorder').onclick=openPreorder;Z.toast('Резервацията е записана.','success');}catch(error){Z.toast(error.message,'error');}});
function openPreorder(){preorderCart=[];const root=document.getElementById('preorderMenu');root.innerHTML=catalog.items.filter(i=>i.send_to_kitchen).map(i=>dishHtml(i,'preorder')).join('');bindDishActions(root);renderPreorderCart();document.getElementById('preorderDialog').showModal();}
document.getElementById('submitPreorder').onclick=async()=>{if(!reservationContext)return;if(!preorderCart.length)return Z.toast('Добавете храна.','error');try{const result=await Z.rpc('zorbas_public_preorder',{p_reservation_id:reservationContext.id,p_phone:reservationContext.phone,p_items:preorderCart,p_note:null});document.getElementById('preorderDialog').close();Z.toast(`Храната е запазена. Код ${result.code}`,'success');}catch(error){Z.toast(error.message,'error');}};

document.getElementById('pickupForm').addEventListener('submit',async e=>{e.preventDefault();if(!pickupCart.length)return Z.toast('Добавете поне един продукт.','error');const f=new FormData(e.currentTarget);try{const result=await Z.rpc('zorbas_public_pickup',{p_name:f.get('name'),p_phone:f.get('phone'),p_ready_at:new Date(f.get('ready')).toISOString(),p_items:pickupCart,p_note:f.get('note')||null});document.getElementById('pickupSuccess').innerHTML=`<div class="success-box"><h3>Поръчката е приета.</h3><p>Код: <b>${Z.esc(result.code)}</b><br>Готова за: ${Z.formatDate(result.ready_at)}</p></div>`;pickupCart=[];renderPickupCart();e.currentTarget.reset();Z.toast('Поръчката е изпратена.','success');}catch(error){Z.toast(error.message,'error');}});

async function loadPoll(){try{const d=await Z.rpc('zorbas_poll_status');document.getElementById('pollPercent').textContent=d.percent||0;document.getElementById('pollVotes').textContent=d.votes||0;document.getElementById('pollGoal').textContent=d.goal||100;document.getElementById('pollBar').style.width=`${Math.min(100,d.percent||0)}%`;}catch{}}
document.getElementById('showPoll').onclick=()=>document.getElementById('pollBox').classList.toggle('hidden');
document.getElementById('voteDelivery').onclick=async()=>{try{const d=await Z.rpc('zorbas_vote_delivery',{p_device_id:Z.deviceId()});Z.toast(d.accepted?'Гласът е отчетен.':'От това устройство вече има глас.',d.accepted?'success':'info');loadPoll();}catch(error){Z.toast(error.message,'error');}};

boot();

(() => {
  const stateLabels = {available:'СВОБОДНА', reserved:'РЕЗЕРВИРАНА', occupied:'ЗАЕТА'};
  const stateOrder = {available:0, reserved:1, occupied:2};
  const style = document.createElement('style');
  style.textContent = `
    .area-map.public-reservation-grid{display:grid;grid-template-columns:repeat(4,minmax(130px,1fr));gap:14px;min-height:0!important;aspect-ratio:auto!important;padding:112px 18px 22px;overflow:visible;background:#0b111b;border-radius:24px}
    .public-reservation-grid .reservation-map-head{position:absolute;inset:18px 18px auto;display:grid;gap:13px;color:#fff}
    .public-reservation-grid .reservation-map-title{display:flex;align-items:end;justify-content:space-between;gap:12px}
    .public-reservation-grid .reservation-map-title strong{font-family:Forum,serif;font-size:32px;font-weight:400}
    .public-reservation-grid .reservation-map-title small{color:#9ca7b7;font-size:11px}
    .public-reservation-grid .reserve-progress{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}
    .public-reservation-grid .reserve-step{display:flex;align-items:center;justify-content:center;gap:6px;min-height:34px;border:1px solid #263448;border-radius:999px;color:#8f9bab;font-size:10px;font-weight:800}
    .public-reservation-grid .reserve-step.done{border-color:#285842;background:#17392d;color:#a9ddbf}.public-reservation-grid .reserve-step.active{border-color:#708dc0;background:#516f9e;color:#fff}
    .public-reservation-grid .table-node{position:relative!important;inset:auto!important;left:auto!important;top:auto!important;width:auto!important;height:auto!important;min-height:148px!important;padding:18px 10px!important;border:1px solid transparent!important;border-radius:22px!important;transform:none!important;display:flex!important;flex-direction:column;justify-content:center;align-items:center;gap:14px;box-shadow:none!important;overflow:hidden;opacity:1!important}
    .public-reservation-grid .table-node .chair{display:none!important}.public-reservation-grid .table-node>span{display:grid;gap:8px;place-items:center}.public-reservation-grid .table-node strong{font-size:44px;font-weight:500;line-height:1}.public-reservation-grid .table-node small{font-size:12px;color:#aeb7c5;font-weight:500}
    .public-reservation-grid .table-state-pill{position:absolute;top:16px;padding:6px 11px;border-radius:999px;font-size:9px;font-weight:800;letter-spacing:.03em}
    .public-reservation-grid .state-available{background:linear-gradient(160deg,#142a29,#111b27)!important;border-color:#285947!important;color:#fff}.public-reservation-grid .state-available .table-state-pill{background:#1e4036;color:#aee0c4}
    .public-reservation-grid .state-reserved{background:linear-gradient(160deg,#403416,#211f25)!important;border-color:#806a27!important;color:#fff}.public-reservation-grid .state-reserved .table-state-pill{background:#5b491c;color:#ffe08a}
    .public-reservation-grid .state-occupied{background:linear-gradient(160deg,#3a2028,#1b1b25)!important;border-color:#6c3543!important;color:#fff}.public-reservation-grid .state-occupied .table-state-pill{background:#512a34;color:#f3aebd}
    .public-reservation-grid .table-node.selected{outline:4px solid #84a8e7!important;outline-offset:2px}.public-reservation-grid .table-node.capacity-blocked{filter:saturate(.45);opacity:.56!important}.public-reservation-grid .table-node:not(:disabled):active{transform:scale(.97)!important}
    .public-reservation-grid .reservation-legend{display:flex;flex-wrap:wrap;gap:10px;color:#aeb7c5;font-size:10px}.public-reservation-grid .reservation-legend span{display:inline-flex;align-items:center;gap:5px}.public-reservation-grid .reservation-legend i{width:9px;height:9px;border-radius:50%}.public-reservation-grid .reservation-legend .free{background:#45a879}.public-reservation-grid .reservation-legend .reserved{background:#d2aa37}.public-reservation-grid .reservation-legend .occupied{background:#c65a70}
    #reserveDetails:not(.hidden){margin-top:18px;padding:18px;border:1px solid #d2cdc4;border-radius:20px;background:#fff}#selectedTableText{font-weight:800;color:#335d94}#reservationSuccess .action{width:100%;margin-top:10px;border-radius:14px;min-height:58px}
    @media(max-width:760px){.area-map.public-reservation-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;padding:116px 10px 14px;border-radius:20px}.public-reservation-grid .reservation-map-head{inset:14px 12px auto}.public-reservation-grid .reservation-map-title strong{font-size:27px}.public-reservation-grid .table-node{min-height:139px!important;border-radius:19px!important;padding:16px 5px!important}.public-reservation-grid .table-node strong{font-size:39px}.public-reservation-grid .table-state-pill{top:13px;padding:5px 8px;font-size:8px}.public-reservation-grid .table-node small{font-size:10px}.public-reservation-grid .reserve-step{font-size:8px;gap:4px}.public-reservation-grid .reservation-legend{display:none}}
    @media(max-width:365px){.area-map.public-reservation-grid{grid-template-columns:repeat(2,minmax(0,1fr));padding-top:118px}.public-reservation-grid .table-node{min-height:145px!important}}
  `;
  document.head.appendChild(style);

  renderPublicMap = function renderPublicReservationCards() {
    const map = document.getElementById('publicTableMap');
    const area = catalog.areas.find(entry => entry.id === selectedArea);
    const guests = Math.max(1, Number(document.querySelector('#reserveSearch [name=guests]')?.value || 1));
    const tables = availability
      .filter(table => table.area_id === selectedArea)
      .map(table => ({...table, state: table.state || (table.available ? 'available' : 'reserved')}))
      .sort((a,b) => (stateOrder[a.state] ?? 9) - (stateOrder[b.state] ?? 9) || String(a.table_number).localeCompare(String(b.table_number), 'bg', {numeric:true}));

    map.className = 'area-map public-reservation-grid';
    map.style.aspectRatio = 'auto';
    map.innerHTML = `
      <div class="reservation-map-head">
        <div class="reservation-map-title"><div><small>ИЗБЕРИ МАСА</small><strong>${Z.esc(area?.name || 'Зона')}</strong></div><small>${tables.length} маси</small></div>
        <div class="reserve-progress"><span class="reserve-step done">✓ Час</span><span class="reserve-step active">2 Маса</span><span class="reserve-step">3 Храна</span></div>
        <div class="reservation-legend"><span><i class="free"></i>Свободна</span><span><i class="reserved"></i>Резервирана</span><span><i class="occupied"></i>Заета</span></div>
      </div>
      ${tables.map(table => {
        const state = table.state;
        const fits = Number(table.seats || 0) >= guests;
        const selectable = state === 'available' && fits;
        const label = state === 'available' && !fits ? `МАЛКА ЗА ${guests}` : (stateLabels[state] || 'НЕСВОБОДНА');
        return `<button type="button" class="table-node state-${state} ${selectedTable===table.id?'selected':''} ${!fits&&state==='available'?'capacity-blocked':''}" data-table="${table.id}" ${selectable?'':'disabled'} aria-label="Маса ${Z.esc(table.table_number)}, ${label}, ${table.seats} места"><span class="table-state-pill">${label}</span><span><strong>${Z.esc(table.table_number)}</strong><small>${table.seats} места</small></span></button>`;
      }).join('') || '<p class="status">Няма маси в тази зона.</p>'}`;

    map.querySelectorAll('[data-table]:not(:disabled)').forEach(button => button.onclick = () => {
      selectedTable = button.dataset.table;
      renderPublicMap();
      const table = availability.find(entry => entry.id === selectedTable);
      document.getElementById('selectedTableText').textContent = `Избрана: ${area?.name || ''} · Маса ${table.table_number} · ${table.seats} места`;
      const details = document.getElementById('reserveDetails');
      details.classList.remove('hidden');
      setTimeout(() => details.scrollIntoView({behavior:'smooth', block:'start'}), 80);
    });
  };

  const successRoot = document.getElementById('reservationSuccess');
  if (successRoot) new MutationObserver(() => {
    const addFood = document.getElementById('addPreorder');
    if (!addFood) return;
    addFood.textContent = '🍽 ИЗБЕРИ ХРАНА ЗА РЕЗЕРВАЦИЯТА';
    setTimeout(() => successRoot.scrollIntoView({behavior:'smooth', block:'center'}), 80);
  }).observe(successRoot, {childList:true, subtree:true});
})();