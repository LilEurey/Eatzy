-- Clean up Nui Noodles' ingredients and tags, left over from the old auto-enrichment:
-- stray "tea"/"iced"/"salad", "noodles" on the no-noodle Gaolao, and MAMA OK tagged
-- korean + hot + mild at once. Values follow each dish's menu_items_4.csv description.
update public.menu_items m set
  ingredients = v.ingredients, tags = v.tags, updated_at = now()
from public.vendors s, (values
  ('Yentafo Wonton Soup', array['pork','wonton','fish balls','morning glory','noodles','yentafo sauce'], array['soup','sweet','mild','noodles']),
  ('Rice with Roasted Red Pork', array['roasted red pork','rice','red gravy','cucumber'], array['roasted','sweet','mild','main-dishes-rice']),
  ('Rice with Roasted Red Pork & Crispy Pork', array['roasted red pork','crispy pork','rice','red gravy'], array['roasted','crispy','sweet','mild','main-dishes-rice']),
  ('Plain Rice', array['rice'], array['steamed','mild','halal','vegetarian','jay','add-ons']),
  ('Boiled Egg', array['egg'], array['boiled','mild','halal','vegetarian','add-ons']),
  ('Egg Noodles with Roasted Red Pork', array['egg noodles','roasted red pork','egg'], array['roasted','soup','mild','noodles']),
  ('Tom Yum Instant Noodles', array['instant noodles','pork','egg','tom yum'], array['soup','spicy','sour','noodles']),
  ('Pork Clear Soup without Noodles (Gaolao)', array['pork','fish balls','morning glory'], array['soup','clear soup','mild']),
  ('Pork Wonton Soup (Kiew Nam)', array['pork','wonton'], array['soup','clear soup','mild']),
  ('Crispy Fried Wonton', array['pork','wonton'], array['fried','deep-fried','crispy','mild','appetizers']),
  ('MAMA OK Hot & Spicy Noodles', array['instant noodles'], array['stir-fried','spicy','korean','halal','vegetarian','jay','noodles'])
) as v(name, ingredients, tags)
where s.id = m.vendor_id and s.name = 'Nui Noodles' and m.name = v.name;
