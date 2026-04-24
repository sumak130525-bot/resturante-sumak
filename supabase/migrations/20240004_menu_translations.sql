-- Migration: Add multilingual translation columns to menu_items
-- Supports: English (en) and Quechua (qu) for name and description

ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS name_en        text,
  ADD COLUMN IF NOT EXISTS name_qu        text,
  ADD COLUMN IF NOT EXISTS description_es text,
  ADD COLUMN IF NOT EXISTS description_en text,
  ADD COLUMN IF NOT EXISTS description_qu text;

-- ─── Populate translations for all dishes ────────────────────────────────────
-- NOTE: description_es mirrors the existing 'description' column.
-- Run a SELECT id, name, description FROM menu_items ORDER BY name;
-- to verify IDs before applying in production.

-- ── Silpancho ────────────────────────────────────────────────────────────────
UPDATE menu_items SET
  name_en        = 'Silpancho (Breaded Beef)',
  name_qu        = 'Silpanchu',
  description_es = 'Filete de carne delgado, empanizado y frito, servido sobre arroz blanco con huevo frito, ensalada fresca y llajwa',
  description_en = 'Thin breaded and fried beef cutlet served over white rice with a fried egg, fresh salad and spicy llajwa sauce',
  description_qu = 'Aycha P''iqicha k''aspasqa, sansasqa, arroz pataman churasqa, runtup wathiasqa, chaqrusqa mijuna llajwawanmi'
WHERE name ILIKE '%silpancho%';

-- ── Sopa de Maní ─────────────────────────────────────────────────────────────
UPDATE menu_items SET
  name_en        = 'Peanut Soup',
  name_qu        = 'Inchiq Lawa',
  description_es = 'Sopa tradicional boliviana de maní molido con fideos, papas y verduras',
  description_en = 'Traditional Bolivian soup made with ground peanuts, pasta, potatoes and fresh vegetables',
  description_qu = 'Bolivia yachay lawami, inchikwan rurasqa, fideos, papawan, verdurawan'
WHERE name ILIKE '%man%' AND name ILIKE '%sopa%';

-- ── Charque ──────────────────────────────────────────────────────────────────
UPDATE menu_items SET
  name_en        = 'Ch''arki (Dried Llama Meat)',
  name_qu        = 'Ch''arki',
  description_es = 'Carne de llama secada al sol, servida con mote, papas cocidas, queso y huevo',
  description_en = 'Sun-dried llama meat served with hominy corn, boiled potatoes, white cheese and egg',
  description_qu = 'Llamap aychan intip k''anchayninpin chaqasqa, mutiwanmi, papawan, qisuwanmi, runtuwanmi'
WHERE name ILIKE '%charque%' OR name ILIKE '%ch''arki%' OR name ILIKE '%charqi%';

-- ── Fricasé ───────────────────────────────────────────────────────────────────
UPDATE menu_items SET
  name_en        = 'Fricasé (Spicy Pork Stew)',
  name_qu        = 'Uhuna Khuchi Lawa',
  description_es = 'Guiso picante de cerdo cocido con chuño, mote y ají amarillo',
  description_en = 'Spicy pork stew slow-cooked with freeze-dried potato (chuño), hominy corn and yellow chili',
  description_qu = 'Khuchi aychap guisosninmi, ch''uñuwan, mutiwanmi, uchuwanmi'
WHERE name ILIKE '%fricasé%' OR name ILIKE '%fricase%';

-- ── Pique Macho ───────────────────────────────────────────────────────────────
UPDATE menu_items SET
  name_en        = 'Pique Macho (Meat & Fries Platter)',
  name_qu        = 'Sinchi Piku',
  description_es = 'Trozos de carne de res y de salchicha fritos, papas fritas, tomate, cebolla y locoto',
  description_en = 'Chunks of fried beef and sausage served on a bed of crispy french fries with tomato, onion and hot pepper',
  description_qu = 'Waka aycha t''impu, salchicha, papa k''aspasqa, tomatewan, sibuyas, locotowanmi'
WHERE name ILIKE '%pique%' AND name ILIKE '%macho%';

-- ── Majadito ──────────────────────────────────────────────────────────────────
UPDATE menu_items SET
  name_en        = 'Majadito (Dried Meat with Rice)',
  name_qu        = 'Majaditu',
  description_es = 'Arroz cocido con charque desmenuzado y huevo frito, típico de los llanos orientales',
  description_en = 'Rice cooked with shredded dried meat (charque) and topped with a fried egg, a classic from Bolivia''s eastern lowlands',
  description_qu = 'Arroz t''impusqa ch''arki kuchusqawan, runtup wathiasqa, Bolivia''p sapa llaqtanmanta'
WHERE name ILIKE '%majadito%';

-- ── Relleno de Papa ───────────────────────────────────────────────────────────
UPDATE menu_items SET
  name_en        = 'Stuffed Potato Cake',
  name_qu        = 'Papa Hunt''asqa',
  description_es = 'Papa rellena con carne picada, aceitunas, huevo duro y especias, frita hasta dorar',
  description_en = 'Potato cake stuffed with minced meat, olives, hard-boiled egg and spices, then fried golden',
  description_qu = 'Papa hunt''asqa aycha kuchusqawan, asitunawan, runtuwanmi, espaciawan, k''aspasqa'
WHERE name ILIKE '%relleno%' AND name ILIKE '%papa%';

-- ── Saice ─────────────────────────────────────────────────────────────────────
UPDATE menu_items SET
  name_en        = 'Saice (Minced Beef Stew)',
  name_qu        = 'Sajsi',
  description_es = 'Guiso tarijeño de carne molida con arvejas, papas y especias regionales',
  description_en = 'Tarija-style minced beef stew with peas, potatoes and regional spices',
  description_qu = 'Tarija llaqtamanta aycha molida guiso, arwisas, papawan, espaciakuna'
WHERE name ILIKE '%saice%' OR name ILIKE '%sajsi%';

-- ── Picante de Pollo ─────────────────────────────────────────────────────────
UPDATE menu_items SET
  name_en        = 'Spicy Chicken Stew',
  name_qu        = 'Wallpa Uchu',
  description_es = 'Pollo cocido en salsa espesa de ají colorado, servido con chuño y arroz',
  description_en = 'Chicken slow-cooked in a thick red chili sauce, served with freeze-dried potato and rice',
  description_qu = 'Wallpa t''impusqa aji puka lawawan, ch''uñuwan, arroz yanasqa'
WHERE name ILIKE '%picante%' AND name ILIKE '%pollo%';

-- ── Sopa de Trigo / Sopa Paceña ───────────────────────────────────────────────
UPDATE menu_items SET
  name_en        = 'Paceña Soup (Wheat & Vegetable)',
  name_qu        = 'Paceña Lawa',
  description_es = 'Sopa espesa de trigo pelado con carne de res, papas, choclo y verduras de la región',
  description_en = 'Hearty La Paz-style soup made with hulled wheat, beef, corn on the cob and seasonal vegetables',
  description_qu = 'La Paz lawaqa, trigomanta, waka aycha, maíz, verdura tarpusqawan'
WHERE (name ILIKE '%sopa%' AND name ILIKE '%trigo%') OR name ILIKE '%paceña%' OR name ILIKE '%paceñ%';

-- ── Api ───────────────────────────────────────────────────────────────────────
UPDATE menu_items SET
  name_en        = 'Api (Purple Corn Drink)',
  name_qu        = 'Api',
  description_es = 'Bebida caliente tradicional de maíz morado con canela, clavo y azúcar',
  description_en = 'Traditional hot drink made from purple corn, cinnamon, cloves and sugar',
  description_qu = 'Yachay upyay sara moradumanta, canelawan, clavowan, miski'
WHERE name ILIKE '%api%' AND (name NOT ILIKE '%rapi%' AND name NOT ILIKE '%napi%');

-- ── Chicha ────────────────────────────────────────────────────────────────────
UPDATE menu_items SET
  name_en        = 'Chicha (Fermented Corn Drink)',
  name_qu        = 'Aswa',
  description_es = 'Bebida fermentada andina de maíz, elaborada de forma artesanal',
  description_en = 'Traditional Andean fermented corn beverage, artisanally crafted',
  description_qu = 'Aswap yachay Andino sara k''aspasqamanta, llajtapi rurasqa'
WHERE name ILIKE '%chicha%';

-- ── Somó ──────────────────────────────────────────────────────────────────────
UPDATE menu_items SET
  name_en        = 'Somó (Corn & Milk Drink)',
  name_qu        = 'Sumu',
  description_es = 'Bebida refrescante del oriente boliviano de maíz fermentado con leche y azúcar',
  description_en = 'Refreshing eastern Bolivian drink made from fermented corn, milk and sugar',
  description_qu = 'Bolivia''p inti llaqtanmanta upyay, sara ch''uchusqa, lechewan, miski'
WHERE name ILIKE '%som%' AND (name ILIKE '%somó%' OR name ILIKE '%somo%');

-- ── Empanadas de Queso ────────────────────────────────────────────────────────
UPDATE menu_items SET
  name_en        = 'Cheese Empanadas',
  name_qu        = 'Qisu Hunt''asqa T''anta',
  description_es = 'Empanadas horneadas o fritas rellenas de queso fresco derretido',
  description_en = 'Baked or fried pastries filled with melted fresh cheese',
  description_qu = 'T''anta hunt''asqa qisumanta, t''impu o k''aspasqa'
WHERE name ILIKE '%empanada%' AND name ILIKE '%queso%';

-- ── Empanadas de Carne ────────────────────────────────────────────────────────
UPDATE menu_items SET
  name_en        = 'Meat Empanadas',
  name_qu        = 'Aycha Hunt''asqa T''anta',
  description_es = 'Empanadas horneadas o fritas rellenas de carne molida condimentada con especias andinas',
  description_en = 'Baked or fried pastries filled with seasoned minced beef and Andean spices',
  description_qu = 'T''anta hunt''asqa aycha kuchusqawan, Andino espaciakunawan'
WHERE name ILIKE '%empanada%' AND name ILIKE '%carne%';

-- ── Tucumana ──────────────────────────────────────────────────────────────────
UPDATE menu_items SET
  name_en        = 'Tucumana (Fried Stuffed Pastry)',
  name_qu        = 'Tucumana',
  description_es = 'Empanada frita de masa suave rellena de pollo, papa y verduras, típica de Bolivia',
  description_en = 'Deep-fried soft pastry filled with chicken, potato and vegetables, a Bolivian street-food classic',
  description_qu = 'T''anta k''aspasqa wallpa, papawan, verdura hunt''asqawan, Bolivia callecunapi mikuq'
WHERE name ILIKE '%tucumana%';

-- ── Anticucho ─────────────────────────────────────────────────────────────────
UPDATE menu_items SET
  name_en        = 'Anticucho (Grilled Beef Heart Skewers)',
  name_qu        = 'Antikuchu',
  description_es = 'Brochetas de corazón de res marinado en ají y especias, asadas a la parrilla',
  description_en = 'Grilled skewers of beef heart marinated in chili and spices, a popular Andean street food',
  description_qu = 'Sunqu aycha k''aspasqa sunasp''awan, Andino callepi mikuqpaq'
WHERE name ILIKE '%anticucho%';

-- ── Arroz con Leche ───────────────────────────────────────────────────────────
UPDATE menu_items SET
  name_en        = 'Rice Pudding',
  name_qu        = 'Arroz Lechewan',
  description_es = 'Postre cremoso de arroz cocido en leche con azúcar, canela y limón',
  description_en = 'Creamy dessert of rice slow-cooked in milk with sugar, cinnamon and lemon zest',
  description_qu = 'Arroz t''impusqa lechewan, miski, canela, limonwan'
WHERE name ILIKE '%arroz%' AND name ILIKE '%leche%';

-- ── Mote ──────────────────────────────────────────────────────────────────────
UPDATE menu_items SET
  name_en        = 'Hominy Corn',
  name_qu        = 'Muti',
  description_es = 'Maíz blanco cocido, servido como acompañamiento en varios platos bolivianos',
  description_en = 'Boiled white corn served as a side with many traditional Bolivian dishes',
  description_qu = 'Sara muti t''impusqa, Bolivia mikhuna yanapa'
WHERE name ILIKE '%mote%' OR name ILIKE '%muti%';

-- ── Chuño ─────────────────────────────────────────────────────────────────────
UPDATE menu_items SET
  name_en        = 'Chuño (Freeze-dried Potato)',
  name_qu        = 'Ch''uñu',
  description_es = 'Papa deshidratada de manera ancestral en el altiplano, cocida y servida como acompañamiento',
  description_en = 'Ancestrally freeze-dried potato from the Andean highlands, boiled and served as a traditional side',
  description_qu = 'Papa yachay altiplano ch''usaqchisqa, t''impusqa yanapa mikhuna'
WHERE name ILIKE '%chuño%' OR name ILIKE '%ch''uñu%';

-- ── Llajwa ────────────────────────────────────────────────────────────────────
UPDATE menu_items SET
  name_en        = 'Llajwa (Bolivian Chili Sauce)',
  name_qu        = 'Llajwa',
  description_es = 'Salsa picante boliviana de tomate fresco y locoto molidos en batán',
  description_en = 'Bolivian spicy sauce made from fresh tomatoes and hot locoto pepper ground on a stone mortar',
  description_qu = 'Bolivia''p uchu lawanmi, tomatemanta, locotomanta batanpi t''aqasqa'
WHERE name ILIKE '%llajwa%' OR name ILIKE '%llajua%';
