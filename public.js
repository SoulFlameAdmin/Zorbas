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