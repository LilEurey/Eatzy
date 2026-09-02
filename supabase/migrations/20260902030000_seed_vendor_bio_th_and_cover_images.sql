-- Seed vendor Thai bios and cover photos from student-provided
-- "Food Description.xlsx" (Thai description + storefront photo columns
-- added 2026-09-02). Photos uploaded to the "vendor-images" storage bucket
-- (20260902020000_vendor_bio_th_and_images.sql). Vendor name matching
-- mirrors 20260830160000_seed_vendor_bios.sql.

UPDATE vendors SET bio_th = 'Dino Papa Express — ไก่ทอดสไตล์เกาหลี แป้งกรอบ ซอสรสเข้มข้น ติดต่อ: 062-649-0675',
  cover_image_url = 'https://rxrxsgsxbuevclfqwhtu.supabase.co/storage/v1/object/public/vendor-images/vendor-images/dino-papa.jpg'
  WHERE name = 'Dino Papa';

UPDATE vendors SET bio_th = 'ร้านฟ้าใส (ร้านที่ 6) — อาหารจานเดียวและของว่างหลากหลาย รสชาติกลมกล่อม ติดต่อ: 094-378-7834',
  cover_image_url = 'https://rxrxsgsxbuevclfqwhtu.supabase.co/storage/v1/object/public/vendor-images/vendor-images/fahsai-restaurant.jpg'
  WHERE name = 'Fahsai Restaurant';

UPDATE vendors SET bio_th = 'ลุงหนุ่ม สแควร์ — เครื่องดื่มปั่น สมูทตี้ ทาโกะยากิ และเครปทำสดใหม่ เปิดจันทร์-ศุกร์ 06:30-18:00 น. Facebook: ลุงหนุ่ม สแควร์ | Instagram: Loonghoom_Square | Line: lungnum2508 | โทร: 099-005-8225',
  cover_image_url = 'https://rxrxsgsxbuevclfqwhtu.supabase.co/storage/v1/object/public/vendor-images/vendor-images/loong-noom-square.jpg'
  WHERE name = 'Loong Noom Square';

UPDATE vendors SET bio_th = 'ลุงชิกกี้ (Uncle Chicky) — อาหารตามสั่งและก๋วยเตี๋ยว ก๋วยเตี๋ยวน้ำใส ต้มยำ และหมูตุ๋น สอบถาม: 095-192-8229',
  cover_image_url = 'https://rxrxsgsxbuevclfqwhtu.supabase.co/storage/v1/object/public/vendor-images/vendor-images/uncle-chicky.jpg'
  WHERE name = 'Uncle Chicky';

UPDATE vendors SET bio_th = 'ร้านพี่ป้อม — แกงไทย ยำไก่แซ่บ ไก่ย่าง และของทอด ราคาสบายกระเป๋านักศึกษา ติดต่อ: 089-059-7454',
  cover_image_url = 'https://rxrxsgsxbuevclfqwhtu.supabase.co/storage/v1/object/public/vendor-images/vendor-images/p-pom.jpg'
  WHERE name = 'P'' Pom';

UPDATE vendors SET bio_th = 'สเต็กและอาหารตามสั่ง — มื้ออร่อยระหว่างคาบเรียน สอบถามเพิ่มเติม: 086-522-7767',
  cover_image_url = 'https://rxrxsgsxbuevclfqwhtu.supabase.co/storage/v1/object/public/vendor-images/vendor-images/krua-thai.jpg'
  WHERE name = 'Krua Thai';

UPDATE vendors SET bio_th = 'ร้านพี่หมี — กาแฟสด ซาลาเปา ติ่มซำ และไอศกรีม ติดต่อ: 089-693-1415',
  cover_image_url = 'https://rxrxsgsxbuevclfqwhtu.supabase.co/storage/v1/object/public/vendor-images/vendor-images/p-mee.jpg'
  WHERE name = 'P'' Mee';

UPDATE vendors SET bio_th = 'ก๋วยเตี๋ยวน้ำตก / ต้มยำ / เย็นตาโฟ / น้ำตกต้มยำ / เย็นตาโฟต้มยำ สอบถามเพิ่มเติม โทร. 089-086-2943 (หยุดทุกวันพุธ)',
  cover_image_url = 'https://rxrxsgsxbuevclfqwhtu.supabase.co/storage/v1/object/public/vendor-images/vendor-images/pa-kaew.jpg'
  WHERE name = 'Pa Kaew';

UPDATE vendors SET bio_th = 'ร้านส้มตำ — อาหารอีสานรสจัดจ้าน ส้มตำต้นตำรับและอาหารจานเดียว สอบถามเพิ่มเติม: 090-956-5244',
  cover_image_url = 'https://rxrxsgsxbuevclfqwhtu.supabase.co/storage/v1/object/public/vendor-images/vendor-images/som-tum.jpg'
  WHERE name = 'Som Tum';

UPDATE vendors SET bio_th = 'ครัวแม่น้องพั้นช์ — อาหารตามสั่งและอาหารจานเดียว ต้มเลือดหมู และข้าวต้ม สอบถามเพิ่มเติม: 084-250-1070',
  cover_image_url = 'https://rxrxsgsxbuevclfqwhtu.supabase.co/storage/v1/object/public/vendor-images/vendor-images/mae-nong-punch.jpg'
  WHERE name = 'Mae Nong Punch';

UPDATE vendors SET bio_th = 'ร้าน Dormitory Drinks — เครื่องดื่มและไอศกรีมหลากหลาย เติมความสดชื่นระหว่างคาบเรียน สอบถามเพิ่มเติม: 092-718-7186',
  cover_image_url = 'https://rxrxsgsxbuevclfqwhtu.supabase.co/storage/v1/object/public/vendor-images/vendor-images/dormitory-drinks.jpg'
  WHERE name = 'Dormitory Drinks';

UPDATE vendors SET bio_th = 'มิสเตอร์มัสแตช (Mr.Mouslache) — อาหารตามสั่งและก๋วยเตี๋ยว มื้อกลางวันอิ่มอร่อยระหว่างคาบเรียน สอบถามเพิ่มเติม: 098-851-897',
  cover_image_url = 'https://rxrxsgsxbuevclfqwhtu.supabase.co/storage/v1/object/public/vendor-images/vendor-images/mr-mouslache.jpg'
  WHERE name = 'Mr.Mouslache';

UPDATE vendors SET bio_th = 'ร้านแกงและอาหารตามสั่งยายละมัย — ข้าวแกงอิ่มท้องและอาหารตามสั่ง สอบถามเพิ่มเติม: 099-197-0565',
  cover_image_url = 'https://rxrxsgsxbuevclfqwhtu.supabase.co/storage/v1/object/public/vendor-images/vendor-images/sai-nua-kitchen.jpg'
  WHERE name = 'Sai Nua Kitchen';

UPDATE vendors SET bio_th = 'เครื่องดื่มจิระพันธ์ (Jirapan Drinks) — เครื่องดื่มปั่นเย็นชื่นใจและอิตาเลียนโซดา ติดต่อ: 085-125-4716',
  cover_image_url = 'https://rxrxsgsxbuevclfqwhtu.supabase.co/storage/v1/object/public/vendor-images/vendor-images/jirapan-drinks.jpg'
  WHERE name = 'Jirapan Drinks';

UPDATE vendors SET bio_th = 'ก๋วยเตี๋ยวและเกี๊ยวพี่นุ้ย — ก๋วยเตี๋ยวหมู เย็นตาโฟ และข้าวหมูแดงหมูกรอบ ทำสดใหม่ทุกวัน โทร: 086-881-0426',
  cover_image_url = 'https://rxrxsgsxbuevclfqwhtu.supabase.co/storage/v1/object/public/vendor-images/vendor-images/nui-noodles.jpg'
  WHERE name = 'Nui Noodles';

UPDATE vendors SET bio_th = 'ธนพรนมสด — เมนูเครื่องดื่มและเบเกอรี่: นมสด โกโก้ กาแฟ นมมิ้นต์เย็น นมคาราเมลเย็น ไมโลวัยเด็ก เค้กโดนัท เค้กช็อกโกแลต เค้กเนยสด และบราวนี่',
  cover_image_url = 'https://rxrxsgsxbuevclfqwhtu.supabase.co/storage/v1/object/public/vendor-images/vendor-images/thanaporn-fresh-milk.jpg'
  WHERE name = 'Thanaporn Fresh Milk';
