-- Migration: seed_menu_items_thai_name
-- Populates name_th for the seeded menu_items rows so Thai-language
-- search (src/app/search.tsx) has real data to match against, matching
-- the dish names already used in src/lib/mock-data.ts.

update public.menu_items set name_th = 'ผัดไทย' where id = '05aca1d8-7622-440f-9f8f-b1fa270bd5af';
update public.menu_items set name_th = 'แกงเขียวหวานราดข้าว' where id = 'aeea4754-e55e-4dd5-b471-5a403d369ac5';
update public.menu_items set name_th = 'ข้าวมันไก่' where id = 'cd7c6574-1f85-4179-a991-5705ba6e8bd9';
update public.menu_items set name_th = 'ชาไทย' where id = 'a9aee6af-17de-4e44-bce5-d501e9ccf540';
update public.menu_items set name_th = 'ส้มตำไทย' where id = 'b4a9f776-50c4-4e04-863f-78d76145f4a9';
update public.menu_items set name_th = 'ไก่ย่างชุด' where id = 'd9ed05f8-dd98-43ba-b25f-c8f5e86b695c';
update public.menu_items set name_th = 'บะหมี่ต้มยำ' where id = '8bfa81f0-9c22-486c-878d-01e1ad42b836';
update public.menu_items set name_th = 'บะหมี่เกี๊ยว' where id = '39aff125-393d-4ca8-906a-1d38ce33570f';
update public.menu_items set name_th = 'บุดด้าโบวล์' where id = 'dbb19d5c-b6d6-4a07-b49c-a8dc34b263ad';
update public.menu_items set name_th = 'สมูทตี้ผลไม้เขตร้อน' where id = '2d588bfe-1e38-4316-b410-9a7ba0ef0116';
