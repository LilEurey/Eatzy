-- Migration: seed_everything_vendor
-- Dev-testing aid: gives pochvasin.p@gmail.com a vendor stall that carries
-- every item from the full mock catalog (same 10 items as the other 4 seeded
-- vendors combined), so a student order can be placed and its status flipped
-- from the vendor dashboard without juggling multiple stalls/carts. Resolves
-- the owner by email at migration time rather than a hardcoded id — this
-- account must have already signed in once via Google (student or vendor
-- auth) so its auth.users/public.users row exists, same precondition every
-- other owner_user_id in this seed history relies on.
--
-- vendors.owner_user_id is unique (one stall per owner), and this account
-- already owns one (created outside migration history, presumably via the
-- real vendor-apply/approve flow) — so this reuses that existing stall
-- rather than inserting a second one, which would violate the constraint.

do $$
declare
  v_user_id uuid;
  v_vendor_id uuid;
begin
  select id into v_user_id from auth.users where email = 'pochvasin.p@gmail.com';

  if v_user_id is null then
    raise exception 'No auth.users row for pochvasin.p@gmail.com yet — sign in with that Google account once (student or vendor login), then re-run this migration.';
  end if;

  perform set_config('app.bypass_role_guard', 'on', true);

  update public.users set role = 'vendor' where id = v_user_id;

  select id into v_vendor_id from public.vendors where owner_user_id = v_user_id;

  if v_vendor_id is null then
    v_vendor_id := '277bffad-3537-4f9d-bdb4-ae111fbab8b7';
    insert into public.vendors (id, name, stall_number, is_halal_certified, open_time, close_time, is_open, bio, cuisine_tags, estimated_wait_min, current_queue_count, owner_user_id)
    values
      (v_vendor_id, 'Everything Kitchen', 'X1', true, '00:00', '23:59', true,
       'Dev test stall — carries the full menu for order-status testing.',
       array['Thai','Isaan','Noodles','Soup','Vegan','Vegetarian'], 3, 0, v_user_id);
  else
    update public.vendors
       set name = 'Everything Kitchen',
           is_open = true,
           bio = 'Dev test stall — carries the full menu for order-status testing.',
           cuisine_tags = array['Thai','Isaan','Noodles','Soup','Vegan','Vegetarian']
     where id = v_vendor_id;
  end if;

  insert into public.menu_items (id, vendor_id, name, description, price, category, spice_level, is_halal, is_vegetarian, is_jay, allergens, tags, ingredients, calories, preparation_time_min, is_featured, available_time_segment)
  values
    ('05aca1d8-7622-440f-9f8f-b1fa270bd5af', v_vendor_id, 'Pad Thai',
     'Stir-fried rice noodles with egg, tofu, bean sprouts, and crushed peanuts in a classic tamarind sauce.',
     55, 'Noodles', 1, true, false, false, array['peanuts','eggs','shellfish'], array['popular','noodles'],
     array['rice noodles','egg','tofu','bean sprouts','peanuts','tamarind sauce'], 420, 8, true, 'all'),
    ('aeea4754-e55e-4dd5-b471-5a403d369ac5', v_vendor_id, 'Green Curry with Rice',
     'Creamy coconut green curry with Thai eggplant, basil leaves, and jasmine rice.',
     65, 'Curry', 3, true, false, false, array['shellfish'], array['spicy','curry'],
     array['coconut milk','green curry paste','chicken','Thai eggplant','basil','jasmine rice'], 560, 10, false, 'lunch'),
    ('cd7c6574-1f85-4179-a991-5705ba6e8bd9', v_vendor_id, 'Khao Man Gai',
     'Tender poached chicken on fragrant ginger rice with sliced cucumber and a savory dipping sauce.',
     50, 'Rice Dishes', 0, true, false, false, array['soy'], array['mild','halal','popular'],
     array['chicken','jasmine rice','ginger','garlic','cucumber','soy sauce'], 480, 5, false, 'all'),
    ('a9aee6af-17de-4e44-bce5-d501e9ccf540', v_vendor_id, 'Thai Milk Tea',
     'Rich Thai-style iced tea brewed from orange pekoe, sweetened with condensed milk.',
     35, 'Drinks', 0, true, true, false, array['dairy'], array['drink','popular','cold'],
     array['Thai tea leaves','condensed milk','evaporated milk','sugar','ice'], 240, 3, false, 'all'),
    ('b4a9f776-50c4-4e04-863f-78d76145f4a9', v_vendor_id, 'Som Tam Thai',
     'Classic green papaya salad with cherry tomatoes, green beans, peanuts, dried shrimp, and a fiery lime dressing.',
     45, 'Salads', 4, false, false, false, array['peanuts','shellfish'], array['spicy','isaan','salad'],
     array['green papaya','tomatoes','green beans','peanuts','dried shrimp','fish sauce','lime','chili'], 180, 6, false, 'lunch'),
    ('d9ed05f8-dd98-43ba-b25f-c8f5e86b695c', v_vendor_id, 'Gai Yang Set',
     'Marinated charcoal-grilled chicken with sticky rice and spicy nam jim jeaw dipping sauce.',
     70, 'Grilled', 2, false, false, false, array[]::text[], array['grilled','isaan','hearty'],
     array['chicken','lemongrass','garlic','turmeric','sticky rice','fish sauce'], 620, 15, false, 'lunch'),
    ('8bfa81f0-9c22-486c-878d-01e1ad42b836', v_vendor_id, 'Tom Yum Noodles',
     'Spicy lemongrass broth with rice noodles, mushrooms, shrimp, and fresh herbs.',
     60, 'Soup', 3, true, false, false, array['shellfish'], array['spicy','soup','noodles','popular'],
     array['rice noodles','shrimp','mushrooms','lemongrass','galangal','kaffir lime leaves','chili'], 340, 7, false, 'all'),
    ('39aff125-393d-4ca8-906a-1d38ce33570f', v_vendor_id, 'Wonton Noodle Soup',
     'Clear pork broth with handmade wontons, springy egg noodles, and fresh bok choy.',
     55, 'Soup', 0, false, false, false, array['gluten','eggs'], array['mild','soup','noodles'],
     array['egg noodles','pork wonton','bok choy','pork broth','garlic','soy sauce'], 380, 8, false, 'breakfast'),
    ('dbb19d5c-b6d6-4a07-b49c-a8dc34b263ad', v_vendor_id, 'Buddha Bowl',
     'Quinoa base with roasted sweet potato, broccoli, avocado, chickpeas, and creamy tahini dressing.',
     85, 'Bowls', 0, false, true, true, array['sesame'], array['vegan','healthy','bowls'],
     array['quinoa','broccoli','sweet potato','avocado','chickpeas','tahini','lemon'], 490, 10, false, 'all'),
    ('2d588bfe-1e38-4316-b410-9a7ba0ef0116', v_vendor_id, 'Tropical Smoothie',
     'Mango, pineapple, and banana blended fresh with coconut milk. No added sugar.',
     40, 'Drinks', 0, false, true, true, array[]::text[], array['vegan','drink','healthy'],
     array['mango','pineapple','banana','coconut milk'], 220, 3, false, 'all')
  on conflict (id) do update set vendor_id = excluded.vendor_id;
end $$;
