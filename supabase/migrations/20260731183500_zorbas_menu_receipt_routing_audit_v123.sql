-- Canonical receipt routing for the current Zorbas menu.
-- Food categories are kitchen items; drink categories are bar-only items.
with restaurant as (
  select id from public.sf_restaurants where code='sf-zorbas' limit 1
), classified as (
  select mi.id,
         case
           when c.code in (
             'salads','appetizers','sauces','fish_dishes','meat_dishes','portions',
             'lunch_menu','sides','seafood','main','grill','fried','fish'
           ) then true
           when c.code in (
             'soft_drinks','beer','draft_wine','rakia','ouzo','vodka','whisky','gin','drinks'
           ) then false
           else mi.send_to_kitchen
         end as expected_kitchen
  from public.zorbas_menu_items mi
  join public.zorbas_menu_categories c on c.id=mi.category_id
  where mi.restaurant_id=(select id from restaurant)
)
update public.zorbas_menu_items mi
set send_to_kitchen=classified.expected_kitchen,
    updated_at=now()
from classified
where mi.id=classified.id
  and mi.send_to_kitchen is distinct from classified.expected_kitchen;

-- Bar-only products must not keep stale kitchen-station assignments.
delete from public.zorbas_menu_item_stations mis
using public.zorbas_menu_items mi
where mis.menu_item_id=mi.id
  and mi.restaurant_id=(select id from public.sf_restaurants where code='sf-zorbas' limit 1)
  and not coalesce(mi.send_to_kitchen,false);
