-- Seed vendor bios from student-provided "Food Description.xlsx"
-- Cleaned of OCR/scan artifacts (stray leading digits/glyphs, broken line wraps).

UPDATE vendors SET bio = 'Dino Papa Express — Korean-style fried chicken with crispy batter and bold, flavorful sauce. Contact: 062-649-0675' WHERE name = 'Dino Papa';

UPDATE vendors SET bio = 'No.6 Fahsai Restaurant — single-dish meals and a variety of tasty snacks, quick and delicious. Contact: 094-378-7834' WHERE name = 'Fahsai Restaurant';

UPDATE vendors SET bio = 'Loong Noom Square — ice-blended drinks, smoothies, takoyaki, and freshly made crepes. Open Mon–Fri, 6:30 AM–6:00 PM. Facebook: ลุงหนุ่ม สแควร์ | Instagram: Loonghoom_Square | Line: lungnum2508 | Tel: 099-005-8225' WHERE name = 'Loong Noom Square';

UPDATE vendors SET bio = 'Uncle Chicky — made-to-order meals and noodles: clear broth, tom yum, and braised pork noodles. Contact: 095-192-8229' WHERE name = 'Uncle Chicky';

UPDATE vendors SET bio = 'P''Pom Stall — Thai curry, fried chicken salad, grilled chicken, and crispy fried snacks over rice, at student-friendly prices. Contact: 089-059-7454' WHERE name = 'P'' Pom';

UPDATE vendors SET bio = 'Krua Thai — steak and made-to-order meals, a satisfying bite between classes. Contact: 086-522-7767' WHERE name = 'Krua Thai';

UPDATE vendors SET bio = 'P''Mee Stall — fresh coffee, steamed buns (salapao), dim sum, and ice cream. Contact: 089-693-1415' WHERE name = 'P'' Mee';

UPDATE vendors SET bio = 'จำหน่ายก๋วยเตี๋ยวน้ำตก / ต้มยำ / เย็นตาโฟ / น้ำตกต้มยำ / เย็นตาโฟต้มยำ สอบถามเพิ่มเติม โทร. 089-086-2943 (หยุดทุกวันพุธ)' WHERE name = 'Pa Kaew';

UPDATE vendors SET bio = 'Som Tum — authentic Isan dishes: Thai papaya salad and single-plate meals packed with bold Northeastern flavor. Contact: 090-956-5244' WHERE name = 'Som Tum';

UPDATE vendors SET bio = 'Mae Nong Punch''s Kitchen — made-to-order and single-plate meals, pork blood soup, and rice porridge. Contact: 084-259-1676' WHERE name = 'Mae Nong Punch';

UPDATE vendors SET bio = 'Dormitory Drinks & Ice Cream — a variety of beverages and ice cream for a quick refresh between classes. Contact: 092-718-7186' WHERE name = 'Dormitory Drinks';

-- NOTE: source phone is 9 digits (one short) — kept verbatim, could not infer missing digit.
UPDATE vendors SET bio = 'Mr.Mouslache — made-to-order meals and noodles for a satisfying lunch or snack between classes. Contact: 098-851-897' WHERE name = 'Mr.Mouslache';

UPDATE vendors SET bio = 'Grandma Lamai''s Curry — hearty rice dishes and made-to-order meals, homestyle curry to satisfy your hunger between classes. Contact: 099-197-0565' WHERE name = 'Sai Nua Kitchen';

UPDATE vendors SET bio = 'Jirapan Drinks — refreshing blended drinks and fizzy Italian soda for any time of day. Contact: 085-125-4716' WHERE name = 'Jirapan Drinks';

UPDATE vendors SET bio = 'Nui Noodles & Wontons — pork noodles, yen ta fo (pink noodle soup), and red pork with crispy pork over rice, made fresh daily. Tel: 086-881-0426' WHERE name = 'Nui Noodles';

UPDATE vendors SET bio = 'Thanaporn Fresh Milk — beverage menu and bakery: fresh milk, cocoa, coffee, iced mint milk/cocoa, iced caramel milk, Milo, plus donut cake, chocolate cake, butter cake, and brownies.' WHERE name = 'Thanaporn Fresh Milk';
