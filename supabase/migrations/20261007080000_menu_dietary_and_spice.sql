-- Spice levels (0-5, shown as chili icons) were 0 on every dish. Set from the cleaned "spicy" tag
-- and description: 3 = Isan pounded salads, larb / nam tok / zaap, tom yum, "hot and sour",
-- bird's eye chili; 2 = described as spicy; 1 = only chilies or chili oil mentioned; 0 = not spicy.
update public.menu_items m set spice_level = v.lvl, updated_at = now()
from (values
  ('f8e5d9de-2dd8-47ec-942c-5e9c0a1e8ec8'::uuid, 1),
  ('cb4a21ea-313b-469c-8826-c83c405ac84b'::uuid, 1),
  ('cc519a9a-f7c4-40fa-a1d7-668aa3cf897e'::uuid, 1),
  ('b7607cc0-bcfa-4992-aa1f-ac4c485358a5'::uuid, 2),
  ('7961c391-694e-4259-a5e7-b05ffb15ec06'::uuid, 3),
  ('b25e460b-80fa-4e70-b707-02fd41fa4c45'::uuid, 2),
  ('bd390f6a-b3b6-4ca9-9986-f15873e7a5fb'::uuid, 3),
  ('9e32bcb4-3cdc-4ab8-ab0f-355ea51bec7a'::uuid, 3),
  ('b492f720-cc40-4d62-b77c-bff9cce027c1'::uuid, 2),
  ('7e33385f-d9d4-42d3-b35b-3e8aca4365ee'::uuid, 3),
  ('ea052ffd-91ed-4f4c-a6d9-b61c3c24440c'::uuid, 3),
  ('8fdb5b32-096c-4c80-961d-32efa46b0750'::uuid, 3),
  ('d6d0d788-d084-4cc8-a703-f45e18695409'::uuid, 3),
  ('2de9825e-be4f-4827-90af-d70f1367fb2d'::uuid, 3),
  ('62a8ae6e-6bf4-4a6c-9ce4-591b522dc474'::uuid, 3),
  ('220778c4-e3c8-4bb7-9038-dd1a5e72033f'::uuid, 3),
  ('51164392-0af0-4de5-bcf3-f1164c1b984f'::uuid, 3),
  ('311ef4dd-7ae4-4c58-88ff-d61b54fd21ef'::uuid, 3),
  ('828d3ed9-4910-407d-87e5-19563bfc4a2d'::uuid, 3),
  ('5a52260f-c35c-4ed4-b3b2-e833fa0a98e3'::uuid, 3),
  ('b9466741-bf08-4bca-8405-00aa7f428ff0'::uuid, 3),
  ('ee65262d-b947-4c4f-9e67-fc50f60392af'::uuid, 3),
  ('f8391026-4ffd-41a9-aa1e-3eaae0411adb'::uuid, 2),
  ('93300caa-897a-4520-b117-efb78a73c9ee'::uuid, 2),
  ('94188b46-73ff-4183-a1df-9fdca83daa03'::uuid, 2),
  ('f8ae92b7-eb91-4251-acf6-497afbfbc3ee'::uuid, 2),
  ('6f5301ff-6f7d-447c-911b-7813eeab2b45'::uuid, 2),
  ('c34b16c3-0b2f-4b43-9508-e83c7e35db87'::uuid, 2),
  ('5fd79ccb-191c-4560-8d6e-05546cd7bebd'::uuid, 2),
  ('57a4bc4e-654f-4be5-9211-c27a43ecc43f'::uuid, 2),
  ('50fa6f73-a14d-4aa0-9e89-721b24a0a0ee'::uuid, 2),
  ('a364e58c-33d7-49e1-aa19-0ba4b7010f36'::uuid, 2),
  ('c4c73d2d-8bce-4c4f-bd4c-d0effcc2ee1e'::uuid, 2),
  ('d93e8285-713f-4419-9d2a-908a4a9dc806'::uuid, 2),
  ('6ee8ab36-2e99-4c00-bbeb-48040b78e55a'::uuid, 2),
  ('fbc8e145-4b45-44af-8629-bd49f9ca5950'::uuid, 2),
  ('d2795cb5-469b-4707-bbb7-6d4e9b676c18'::uuid, 3),
  ('b30ebee2-a879-4053-a653-3fba822dac87'::uuid, 3),
  ('c0fcc39e-e6a5-4dbd-b829-2b12d3c0dd90'::uuid, 2),
  ('ed51bfad-afcc-44f7-9463-cb981bd99beb'::uuid, 2),
  ('2aa3ad20-5e45-475b-9b48-be6d123ba86a'::uuid, 2),
  ('044ac9bc-5862-4869-ab53-ccdd3cc5f8f0'::uuid, 2),
  ('77aabd9f-8916-41c0-a19c-0dbdac36e98a'::uuid, 3),
  ('f2143bc7-b62e-4e0c-a6da-454d35892f23'::uuid, 2),
  ('7aabc33a-ed65-436b-875f-cf19d5c36954'::uuid, 2),
  ('c966079c-dd1a-4fc7-a393-ca7cba14ff7f'::uuid, 3),
  ('f0f64b64-3f56-4688-9551-9ef268c32f47'::uuid, 2),
  ('03e43186-8bd5-4513-ae1d-472f1956f0df'::uuid, 2),
  ('87ed08ac-9934-4ce4-9d81-bf6efc4bb9bb'::uuid, 3),
  ('ed52c35f-7a16-4ff2-91f9-2adae067fc2c'::uuid, 3),
  ('19cb1899-c789-4b42-825d-c8e152185e83'::uuid, 2),
  ('4f4017b3-31ab-4b32-9289-17dc87e2ed08'::uuid, 2),
  ('1da786b5-7ea2-4415-988d-04e59f7780e3'::uuid, 3),
  ('761ee7b7-2268-46ce-ac35-ae5bac9110ae'::uuid, 2),
  ('de67696b-b8ad-4773-b705-cefbc63810cd'::uuid, 2),
  ('a426a234-ae41-4574-a687-87a6fbe7b665'::uuid, 2),
  ('85237ab5-aeba-42ae-97ad-125240bab2ee'::uuid, 2),
  ('9c73cfee-c757-4f23-8fef-8b52c0dc455f'::uuid, 2),
  ('3195172e-f262-4c24-9ab6-def8826606ca'::uuid, 3),
  ('36d097f0-b392-4a71-a1ec-830310b1bde0'::uuid, 2),
  ('fbf30999-9afd-4cdb-a264-0a36c50722e2'::uuid, 2),
  ('4745c6e1-a6c6-4b03-b2f9-bc26599261b2'::uuid, 2),
  ('85766395-62bb-403c-9afb-3e95deaaeab3'::uuid, 2),
  ('29e3255e-27f4-4e0e-be7c-328fa5083ed6'::uuid, 2),
  ('a9c42622-b90e-4e8e-890c-62793b7e5b13'::uuid, 2),
  ('7effa244-efc5-4da7-b172-08b1af116350'::uuid, 3),
  ('f72a8e8c-a7ea-4bd8-b775-19581b69903c'::uuid, 3),
  ('ef1b95a8-92fa-4449-b34c-9a5210bc5241'::uuid, 3),
  ('f24358d2-0a00-4403-bcbb-dd345dcb59c3'::uuid, 3),
  ('5a68aac4-af2c-4f88-a1a7-64a8503efa26'::uuid, 3),
  ('ca3a1ea8-24aa-4106-987d-758432d194ec'::uuid, 2),
  ('8a9d63cb-786a-4edc-a5fd-5a2f5ad2f6c4'::uuid, 3),
  ('ed3f2d2f-b7b9-449e-8cba-5faa0e79d4b3'::uuid, 3),
  ('beb6ce2a-0a8a-46ff-96ae-029345845b0c'::uuid, 3),
  ('1806d6f1-e4c7-4708-b5fb-46b962ca2106'::uuid, 2),
  ('abc27be4-b063-44e8-ae13-6da680af5ec6'::uuid, 2),
  ('bcbe4407-6563-484b-b3f4-9ffe0acc7acb'::uuid, 1),
  ('8a238aed-885a-458d-9b7c-846fb8c6e938'::uuid, 3)
) as v(id, lvl)
where m.id = v.id;

-- Dietary flags the CSV got wrong. Jay is a hard filter, so dishes with milk (or ones whose
-- own description says the dough may contain milk or egg) fail closed to not-jay.
update public.menu_items m set is_jay = false, tags = array_remove(m.tags, 'jay'), updated_at = now()
from public.vendors s
where s.id = m.vendor_id and s.name = 'P'' Mee'
  and m.name in ('Caramel Macchiato (Hot)', 'Caramel Macchiato (Iced)', 'Mocha (Hot)', 'Mocha (Iced)',
                 'Black Bean Bun (1 Piece)', 'Steamed Chinese Bun - Mantou (1 Piece)');

-- Milk coffees: contain milk (dairy warning), and cappuccino is vegetarian like the latte.
update public.menu_items m set
  ingredients = case when 'milk' = any(m.ingredients) then m.ingredients else m.ingredients || 'milk'::text end,
  allergens = case when 'dairy' = any(m.allergens) then m.allergens else m.allergens || 'dairy'::text end,
  is_vegetarian = true,
  tags = case when 'vegetarian' = any(m.tags) then m.tags
              else array_append(array_remove(m.tags, 'beverages'), 'vegetarian') || 'beverages'::text end,
  updated_at = now()
from public.vendors s
where s.id = m.vendor_id and s.name = 'P'' Mee'
  and m.name in ('Cappuccino (Hot)', 'Cappuccino (Iced)', 'Caramel Macchiato (Hot)', 'Caramel Macchiato (Iced)',
                 'Mocha (Hot)', 'Mocha (Iced)');

-- Hand-adjusted: corn salads are milder than papaya salads; holy basil stir-fry is spicy.
update public.menu_items set spice_level = 2, updated_at = now()
where name in ('Corn Salad with Salted Egg (Tum Khao Pod Kai Khem)', 'Sweet Corn Salad (Tum Khao Pod)',
               'Stir-Fried Holy Basil on Rice');
