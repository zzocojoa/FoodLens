export type SearchableIngredient = string;

export const SEARCHABLE_INGREDIENTS: SearchableIngredient[] = [
  // --- Fruits & Veggies ---
  // Fruits
  "Peach (복숭아)", "Nectarine (천도복숭아)", "Kiwi (키위)", "Golden Kiwi (골드키위)",
  "Tomato (토마토)", "Cherry Tomato (방울토마토)", "Cucumber (오이)",
  "Avocado (아보카도)", "Mango (망고)", "Apple Mango (애플망고)",
  "Banana (바나나)", "Plantain (플랜테인)",
  "Apple (사과)", "Strawberry (딸기)", "Melon (멜론)", "Cantaloupe (칸탈로프)",
  "Watermelon (수박)", "Grape (포도)", "Shine Muscat (샤인머스캣)",

  // Citrus
  "Orange (오렌지)", "Blood Orange (블러드오렌지)", "Lemon (레몬)",
  "Lime (라임)", "Kaffir Lime (카피르라임)", "Grapefruit (자몽)",
  "Mandarin (귤)", "Tangerine (탄제린)", "Clementine (클레멘타인)",
  "Yuzu (유자)", "Kumquat (금귤)", "Pomelo (포멜로)",

  // Berries
  "Blueberry (블루베리)", "Raspberry (라즈베리)", "Blackberry (블랙베리)",
  "Cranberry (크랜베리)", "Acai Berry (아사이베리)", "Goji Berry (구기자)",
  "Mulberry (오디)", "Currant (커런트)",

  // Stone Fruits & Others
  "Cherry (체리)", "Pear (배)", "Asian Pear (배)",
  "Plum (자두)", "Prune (건자두)", "Apricot (살구)",
  "Fig (무화과)", "Pomegranate (석류)", "Quince (모과)",

  // Tropical
  "Pineapple (파인애플)", "Coconut (코코넛)", "Coconut Water (코코넛워터)", "Coconut Meat (코코넛과육)",
  "Papaya (파파야)", "Green Papaya (그린파파야)", "Guava (구아바)", "Lychee (리치)",
  "Rambutan (람부탄)", "Longan (용안)", "Mangosteen (망고스틴)",
  "Dragon Fruit (용과)", "Passion Fruit (패션프루트)", "Persimmon (감)", "Dried Persimmon (곶감)",
  "Jujube (대추)", "Durian (두리안)", "Jackfruit (잭프루트)", "Starfruit (스타프루트)",
  "Soursop (사워솝)", "Breadfruit (브레드프루트)",

  // Veggies & Root Vegetables
  "Potato (감자)", "Sweet Potato (고구마)", "Yam (얌)",
  "Carrot (당근)", "Baby Carrot (미니당근)",
  "Onion (양파)", "Red Onion (적양파)", "Shallot (샬롯)",
  "Garlic (마늘)", "Roasted Garlic (구운마늘)",
  "Ginger (생강)", "Galangal (갈랑갈)",
  "Scallion (대파)", "Green Onion (실파)", "Leek (리크)", "Chive (차이브)",

  // Cruciferous
  "Broccoli (브로콜리)", "Broccolini (브로콜리니)", "Cauliflower (콜리플라워)",
  "Cabbage (양배추)", "Red Cabbage (적양배추)", "Napa Cabbage (배추)",
  "Brussels Sprout (방울양배추)", "Kohlrabi (콜라비)",
  "Kale (케일)", "Collard Greens (콜라드그린)",

  // Leafy Greens & Others
  "Spinach (시금치)", "Baby Spinach (어린시금치)",
  "Lettuce (상추)", "Romaine Lettuce (로메인)", "Iceberg Lettuce (양상추)",
  "Arugula (루콜라)", "Watercress (물냉이)",
  "Bok Choy (청경채)", "Gai Lan (카이란)", "Choy Sum (초이삼)",
  "Bean Sprout (콩나물)", "Mung Bean Sprout (숙주)",

  // Peppers & Squash
  "Bell Pepper (파프리카)", "Capsicum (피망)",
  "Chili Pepper (고추)", "Jalapeño (할라페뇨)", "Habanero (하바네로)",
  "Cayenne Pepper (카이엔)", "Thai Chili (태국고추)",
  "Eggplant (가지)", "Zucchini (주키니)", "Summer Squash (애호박)",
  "Pumpkin (호박)", "Butternut Squash (버터넛스쿼시)", "Acorn Squash (도토리호박)",
  "Cucumber (오이)", "Gherkin (미니오이)",

  // Root Veggies & Stems
  "Radish (무)", "Daikon (무)", "Pickled Radish (단무지)",
  "Beet (비트)", "Turnip (순무)", "Parsnip (파스닙)", "Rutabaga (루타바가)",
  "Asparagus (아스파라거스)", "Celery (셀러리)", "Fennel Bulb (펜넬)",
  "Bamboo Shoot (죽순)", "Water Chestnut (물밤)",
  "Lotus Root (연근)", "Burdock Root (우엉)", "Cassava (카사바)", "Taro (토란)",

  // Legumes (Vegetable forms)
  "Green Bean (그린빈)", "String Bean (줄기콩)", "Snake Bean (롱빈)",
  "Okra (오크라)", "Corn (옥수수)", "Baby Corn (영콘)",
  "Pea (완두콩)", "Snow Pea (꼬투리완두)", "Snap Pea (스냅피)",
  "Edamame (풋콩)",

  // Mushrooms (Fungi)
  "Mushroom (버섯)", "Button Mushroom (양송이)", "Cremini Mushroom (크레미니)",
  "Portobello Mushroom (포토벨로)", "Shiitake (표고)", "Dried Shiitake (건표고)",
  "Oyster Mushroom (느타리)", "King Oyster Mushroom (새송이)",
  "Enoki (팽이)", "Maitake (잎새)", "Morel (곰보)",
  "Porcini (포르치니)", "Chanterelle (샹테렐)",
  "Truffle (트러플)", "Black Truffle (블랙트러플)", "White Truffle (화이트트러플)",
  "Wood Ear Mushroom (목이버섯)",

  // Other Plant/Sea Based
  "Olive (올리브)", "Black Olive (블랙올리브)", "Green Olive (그린올리브)",
  "Artichoke (아티초크)", "Artichoke Heart (아티초크하트)",
  "Caper (케이퍼)",
  "Seaweed (해조류)", "Nori (김)",
  "Kelp (다시마)",
  "Wakame (미역)", "Hijiki (톳)", "Agar-agar (한천)",

  // --- Meat & Fish & Seafood ---
  // Red Meat
  "Meat (고기)", "Red Meat (적색육)",
  "Beef (소고기)", "Steak (스테이크)", "Ground Beef (다진소고기)", "Wagyu (와규)",
  "Pork (돼지고기)", "Pork Belly (삼겹살)", "Ground Pork (다진돼지고기)",
  "Lamb (양고기)", "Mutton (머튼)",
  "Goat (염소고기)",
  "Venison (사슴고기)", "Bison (바이슨)", "Rabbit (토끼고기)",
  "Wild Boar (멧돼지고기)",

  // Poultry & Fowl
  "Chicken (닭고기)", "Chicken Breast (닭가슴살)", "Chicken Thigh (닭다리살)", "Chicken Wing (닭날개)",
  "Turkey (칠면조)", "Duck (오리고기)", "Goose (거위고기)",
  "Quail (메추라기)", "Cornish Hen (영계)",

  // Organ Meats (Offal)
  "Offal (내장)", "Liver (간)", "Kidney (콩팥)", "Heart (심장)",
  "Tripe (양)", "Tongue (우설)", "Intestine (곱창)",

  // Processed Meat
  "Processed Meat (가공육)", "Bacon (베이컨)", "Pancetta (판체타)",
  "Ham (햄)", "Prosciutto (프로슈토)", "Jamón (하몽)",
  "Sausage (소시지)", "Chorizo (초리조)", "Bratwurst (브라트부르스트)",
  "Salami (살라미)", "Pepperoni (페퍼로니)", "Bologna (볼로냐)",
  "Spam (스팸)", "Hot Dog (핫도그)",

  // Fish (Finned)
  "Fish (생선)", "Raw Fish (회)", "Sashimi (사시미)",
  "White Fish (흰살생선)", "Oily Fish (등푸른생선)",
  "Salmon (연어)", "Smoked Salmon (훈제연어)",
  "Tuna (참치)", "Albacore Tuna (날개다랑어)", "Skipjack Tuna (가다랑어)",
  "Cod (대구)", "Black Cod (은대구)",
  "Mackerel (고등어)", "Spanish Mackerel (삼치)",
  "Sardine (정어리)", "Anchovy (멸치)",
  "Trout (송어)", "Rainbow Trout (무지개송어)",
  "Snapper (도미)", "Red Snapper (참돔)",
  "Sea Bass (농어)", "Chilean Sea Bass (메로)",
  "Grouper (다금바리)", "Halibut (광어)", "Flounder (가자미)",
  "Sole (서대)", "Tilapia (틸라피아)", "Catfish (메기)",
  "Eel (장어)", "Unagi (민물장어)", "Anago (붕장어)",
  "Herring (청어)", "Pollock (명태)", "Haddock (해덕)",
  "Monkfish (아귀)", "Skate (홍어)", "Swordfish (황새치)", "Mahi Mahi (만새기)",
  "Yellowtail (방어)",

  // Shellfish - Crustaceans
  "Shellfish (해산물)", "Crustacean (갑각류)",
  "Shrimp (새우)", "Prawn (대하)", "Cocktail Shrimp (칵테일새우)",
  "Crab (게)", "King Crab (킹크랩)", "Snow Crab (대게)", "Soft Shell Crab (소프트쉘크랩)",
  "Crab Stick (게맛살)", "Imitation Crab (크래미)",
  "Lobster (랍스터)",
  "Crayfish (가재)", "Crawfish (민물가재)",
  "Krill (크릴)",

  // Shellfish - Molluscs & Others
  "Mollusc (조개류)",
  "Clam (조개)", "Littleneck Clam (바지락)", "Manila Clam (바지락)",
  "Mussel (홍합)", "Green Lipped Mussel (초록입홍합)",
  "Oyster (굴)", "Raw Oyster (생굴)",
  "Scallop (가리비)", "Bay Scallop (작은가리비)",
  "Abalone (전복)", "Conch (소라)", "Whelk (골뱅이)",
  "Snail (달팽이)",
  "Octopus (문어)", "Baby Octopus (쭈꾸미)",
  "Squid (오징어)", "Calamari (깔라마리)",
  "Cuttlefish (갑오징어)",
  "Sea Urchin (성게)", "Jellyfish (해파리)",
  "Fish Roe (어란)", "Caviar (캐비어)", "Salmon Roe (연어알)",
  "Flying Fish Roe (날치알)", "Pollock Roe (명란)", "Mentaiko (멘타이코)",

  // --- Eggs & Dairy & Alternatives ---
  // Eggs
  "Egg (달걀)", "Whole Egg (전란)",
  "Egg White (흰자)", "Egg Yolk (노른자)",
  "Raw Egg (날달걀)", "Cooked Egg (익힌달걀)",
  "Hard Boiled Egg (삶은달걀)", "Scrambled Egg (스크램블에그)",
  "Quail Egg (메추리알)", "Duck Egg (오리알)",

  // Dairy - Milk & Cream
  "Milk (우유)", "Dairy (유제품)", "Cow's Milk (우유)",
  "Whole Milk (전지우유)", "Low Fat Milk (저지방우유)", "Skim Milk (무지방우유)",
  "Lactose-Free Milk (락토프리우유)",
  "Cream (크림)", "Heavy Cream (생크림)", "Whipping Cream (휘핑크림)",
  "Half and Half (하프앤하프)", "Sour Cream (사워크림)", "Crème Fraîche (크렘프레슈)",
  "Buttermilk (버터밀크)",
  "Condensed Milk (연유)", "Evaporated Milk (무가당연유)",

  // Dairy - Butter & Cheese & Yogurt
  "Butter (버터)", "Salted Butter (가염버터)", "Unsalted Butter (무염버터)",
  "Ghee (기)",
  "Yogurt (요거트)", "Greek Yogurt (그릭요거트)", "Kefir (케피어)",
  "Cheese (치즈)",
  "Cheddar (체다)", "Mozzarella (모짜렐라)", "Parmesan (파마산)",
  "Cream Cheese (크림치즈)", "Ricotta (리코타)", "Cottage Cheese (코티지치즈)",
  "Feta (페타)", "Goat Cheese (염소치즈)", "Sheep Milk Cheese (양유치즈)",
  "Brie (브리)", "Camembert (카망베르)",
  "Blue Cheese (블루치즈)", "Gorgonzola (고르곤졸라)", "Roquefort (로크포르)",
  "Gruyère (그뤼에르)", "Emmental (에멘탈)", "Gouda (고다)",
  "Provolone (프로볼론)", "Monterey Jack (몬테레이잭)",
  "Paneer (파니르)", "Halloumi (할루미)",

  // Dairy Components & Alternatives
  "Whey (유청)", "Whey Protein (유청단백질)",
  "Casein (카제인)", "Caseinate (카제인염)",
  "Lactose (유당)",
  "Plant-Based Milk (식물성우유)", "Soy Milk (두유)",
  "Almond Milk (아몬드우유)", "Oat Milk (귀리우유)",
  "Coconut Milk (코코넛밀크)", "Rice Milk (쌀우유)",
  "Cashew Milk (캐슈우유)", "Macadamia Milk (마카다미아우유)",
  "Hemp Milk (햄프우유)", "Pea Milk (완두우유)",
  "Vegan Cheese (비건치즈)", "Vegan Butter (비건버터)", "Margarine (마가린)",

  // --- Nuts, Seeds & Oils (High-allergen) ---
  // Peanuts
  "Peanut (땅콩)", "Roasted Peanut (볶은땅콩)", "Boiled Peanut (삶은땅콩)",
  "Peanut Butter (땅콩버터)", "Peanut Oil (땅콩기름)", "Peanut Flour (땅콩가루)",

  // Tree Nuts
  "Tree Nuts (견과류)", "Nut (견과)",
  "Almond (아몬드)", "Sliced Almond (슬라이스아몬드)", "Almond Flour (아몬드가루)", "Almond Butter (아몬드버터)",
  "Walnut (호두)",
  "Cashew (캐슈넛)", "Cashew Butter (캐슈버터)",
  "Pistachio (피스타치오)",
  "Hazelnut (헤이즐넛)", "Filbert (헤이즐넛)",
  "Pecan (피칸)",
  "Macadamia (마카다미아)", "Macadamia Nut (마카다미아넛)",
  "Brazil Nut (브라질너트)",
  "Pine Nut (잣)", "Pignoli (잣)",
  "Chestnut (밤)", "Roasted Chestnut (군밤)",
  "Coconut (코코넛)",
  "Shea Nut (쉐어넛)", "Ginkgo Nut (은행)",

  // Seeds
  "Seed (씨앗류)",
  "Sesame (참깨)", "White Sesame (흰참깨)", "Black Sesame (흑임자)",
  "Sesame Oil (참기름)", "Toasted Sesame Oil (볶은참기름)", "Tahini (타히니)",
  "Mustard Seed (겨자씨)",
  "Poppy Seed (양귀비씨)",
  "Sunflower Seed (해바라기씨)", "Sunflower Oil (해바라기유)", "Sunbutter (해바라기버터)",
  "Pumpkin Seed (호박씨)", "Pepita (호박씨)",
  "Chia Seed (치아씨)",
  "Flaxseed (아마씨)", "Linseed (아마씨)", "Flaxseed Oil (아마씨유)",
  "Hemp Seed (햄프씨드)", "Hemp Heart (햄프씨드)",
  "Perilla Seed (들깨)", "Perilla Oil (들기름)",
  "Cumin Seed (큐민씨)", "Fennel Seed (펜넬씨)", "Caraway Seed (카라웨이씨)",

  // Oils & Fats (Cooking types)
  "Cooking Oil (식용유)", "Vegetable Oil (식물성기름)",
  "Olive Oil (올리브유)", "Extra Virgin Olive Oil (엑스트라버진올리브유)",
  "Canola Oil (카놀라유)", "Rapeseed Oil (유채유)",
  "Corn Oil (옥수수유)", "Soybean Oil (대두유)",
  "Coconut Oil (코코넛오일)", "Palm Oil (팜유)",
  "Avocado Oil (아보카도오일)", "Grapeseed Oil (포도씨유)",
  "Rice Bran Oil (미강유)",
  "Lard (돼지기름)", "Tallow (우지)", "Schmaltz (닭기름)",
  "Shortening (쇼트닝)",

  // --- Grains, Gluten & Starches ---
  // Wheat & Gluten
  "Wheat (밀)", "Whole Wheat (통밀)", "Wheat Flour (밀가루)",
  "Gluten (글루텐)", "Wheat Gluten (밀글루텐)", "Vital Wheat Gluten (활성글루텐)",
  "Seitan (세이탄)",
  "Barley (보리)", "Malt (맥아)", "Malt Vinegar (맥아식초)",
  "Rye (호밀)", "Pumpernickel (펌퍼니클)",
  "Oat (귀리)", "Rolled Oats (압착귀리)", "Steel-cut Oats (스틸컷오트)",
  "Triticale (트리티케일)",
  "Spelt (스펠트)", "Kamut (카무트)", "Farro (파로)", "Einkorn (아인콘)",
  "Semolina (세몰리나)", "Couscous (쿠스쿠스)",
  "Bulgur (부르굴)",
  "Breadcrumbs (빵가루)", "Panko (판코)",

  // Gluten-Free Grains & Starches
  "Rice (쌀)", "White Rice (백미)", "Brown Rice (현미)", "Black Rice (흑미)", "Wild Rice (와일드라이스)",
  "Jasmine Rice (자스민라이스)", "Basmati Rice (바스마티라이스)", "Sticky Rice (찹쌀)",
  "Rice Flour (쌀가루)", "Sweet Rice Flour (찹쌀가루)",
  "Corn (옥수수)", "Cornmeal (옥수수가루)", "Polenta (폴렌타)", "Grits (그리츠)",
  "Cornstarch (옥수수전분)",
  "Potato Starch (감자전분)",
  "Tapioca (타피오카)", "Tapioca Starch (타피오카전분)",
  "Buckwheat (메밀)", "Kasha (카샤)",
  "Quinoa (퀴노아)", "White Quinoa (흰퀴노아)", "Red Quinoa (붉은퀴노아)",
  "Millet (기장)",
  "Sorghum (수수)",
  "Amaranth (아마란스)", "Teff (테프)",
  "Arrowroot (애로우루트)", "Cassava Flour (카사바가루)",
  "Coconut Flour (코코넛가루)", "Almond Flour (아몬드가루)",

  // Pasta & Noodles
  "Pasta (파스타)", "Spaghetti (스파게티)", "Macaroni (마카로니)", "Penne (펜네)", "Fusilli (푸실리)",
  "Egg Noodle (에그누들)",
  "Noodles (면)", "Wheat Noodles (밀면)",
  "Ramen (라면)", "Udon (우동)", "Somen (소면)",
  "Soba (소바)", "Buckwheat Noodles (메밀면)",
  "Rice Noodles (쌀국수)", "Pad Thai Noodles (팟타이면)", "Vermicelli (버미셀리)",
  "Glass Noodles (당면)", "Cellophane Noodles (당면)", "Mung Bean Noodles (녹두면)",
  "Gnocchi (뇨끼)",
  "Dumpling Wrapper (만두피)", "Wonton Wrapper (완탕피)",

  // Bread & Baked Goods
  "Bread (빵)", "White Bread (흰빵)", "Whole Wheat Bread (통밀빵)",
  "Sourdough (사워도우)", "Rye Bread (호밀빵)",
  "Multigrain Bread (잡곡빵)",
  "Bagel (베이글)", "Baguette (바게트)", "Ciabatta (치아바타)", "Focaccia (포카치아)",
  "Pita (피타)", "Naan (난)", "Tortilla (토르티야)",
  "Croissant (크루아상)", "Brioche (브리오슈)",
  "Muffin (머핀)", "Cake (케이크)", "Cookie (쿠키)", "Biscuit (비스킷)",
  "Pastry (페이스트리)", "Pie Crust (파이도우)",
  "Pizza Crust (피자도우)",

  // --- Legumes & Soy ---
  // Soy Products
  "Soy (대두)", "Soybean (대두)", "Edamame (풋콩)",
  "Tofu (두부)", "Silken Tofu (순두부)", "Firm Tofu (단단한두부)", "Fried Tofu (유부)",
  "Soy Milk (두유)", "Soy Yogurt (콩요거트)",
  "Soy Sauce (간장)", "Tamari (타마리)", "Shoyu (쇼유)",
  "Miso (미소)", "White Miso (백미소)", "Red Miso (적미소)",
  "Doenjang (된장)", "Gochujang (고추장)",
  "Tempeh (템페)", "Natto (낫또)",
  "Soy Protein (대두단백)", "Soy Protein Isolate (분리대두단백)",
  "TVP (콩고기)",
  "Soy Lecithin (대두레시틴)",
  "Yuba (유바)",

  // Other Legumes (Beans & Lentils)
  "Bean (콩류)", "Legume (콩과)",
  "Lentil (렌틸콩)", "Brown Lentil (갈색렌틸)", "Red Lentil (붉은렌틸)", "Green Lentil (녹색렌틸)",
  "Chickpea (병아리콩)", "Garbanzo Bean (병아리콩)", "Hummus (후무스)",
  "Black Bean (검은콩)", "Kidney Bean (강낭콩)", "Red Kidney Bean (붉은강낭콩)",
  "Pinto Bean (핀토콩)", "Navy Bean (네이비빈)", "Cannellini Bean (카넬리니빈)",
  "Lima Bean (리마콩)", "Butter Bean (버터빈)",
  "Adzuki Bean (팥)", "Red Bean Paste (팥앙금)",
  "Mung Bean (녹두)",
  "Black-eyed Pea (동부콩)",
  "Fava Bean (잠두)", "Broad Bean (잠두)",
  "Lupin (루핀)",

  // --- Spices, Herbs, Aromatics & Flavorings ---
  // Fresh Herbs
  "Cilantro (고수)", "Coriander Leaf (고수잎)",
  "Parsley (파슬리)", "Flat Leaf Parsley (이태리파슬리)",
  "Basil (바질)", "Sweet Basil (스위트바질)", "Thai Basil (타이바질)",
  "Mint (민트)", "Peppermint (페퍼민트)", "Spearmint (스피어민트)",
  "Dill (딜)", "Rosemary (로즈마리)", "Thyme (타임)", "Oregano (오레가노)",
  "Sage (세이지)", "Tarragon (타라곤)", "Marjoram (마조람)",
  "Chervil (처빌)", "Savory (세이보리)",
  "Lemongrass (레몬그라스)", "Kaffir Lime Leaf (카피르라임잎)",
  "Curry Leaf (커리잎)", "Bay Leaf (월계수잎)",
  "Shiso (시소)", "Perilla Leaf (깻잎)",

  // Dried Spices & Powders
  "Black Pepper (흑후추)", "White Pepper (백후추)", "Peppercorn (통후추)",
  "Red Pepper Flakes (고춧가루)", "Crushed Red Pepper (굵은고춧가루)",
  "Cayenne (카이엔)", "Paprika (파프리카)", "Smoked Paprika (훈제파프리카)",
  "Chili Powder (칠리가루)", "Gochugaru (고춧가루)",
  "Cinnamon (계피)", "Cassia (계피)", "Nutmeg (육두구)",
  "Clove (정향)", "Allspice (올스파이스)", "Star Anise (팔각)",
  "Cardamom (카다멈)", "Green Cardamom (그린카다멈)", "Black Cardamom (블랙카다멈)",
  "Cumin (큐민)", "Coriander Seed (고수씨)",
  "Turmeric (강황)", "Saffron (사프란)",
  "Ginger Powder (생강가루)", "Garlic Powder (마늘가루)", "Onion Powder (양파가루)",
  "Mustard Powder (겨자가루)",
  "Fenugreek (페뉴그릭)", "Asafoetida (아사포에티다)",
  "Sumac (수맥)", "Za'atar (자타르)",
  "Curry Powder (카레가루)", "Garam Masala (가람마살라)",
  "Five-Spice Powder (오향분)",

  // Extracts & Flavor Enhancers
  "Vanilla (바닐라)", "Vanilla Extract (바닐라추출물)", "Vanilla Bean (바닐라빈)",
  "Almond Extract (아몬드추출물)",
  "MSG (MSG)", "Monosodium Glutamate (MSG)",
  "Yeast Extract (효모추출물)", "Nutritional Yeast (영양효모)",
  "Liquid Smoke (훈연액)",
  "Salt (소금)", "Sea Salt (천일염)", "Kosher Salt (코셔소금)", "Himalayan Pink Salt (핑크솔트)",

  // --- Condiments & Sauces ---
  // Vinegars & Acids
  "Vinegar (식초)", "White Vinegar (백식초)",
  "Apple Cider Vinegar (사과식초)", "Rice Vinegar (쌀식초)",
  "Balsamic Vinegar (발사믹식초)", "Balsamic Glaze (발사믹글레이즈)",
  "Red Wine Vinegar (레드와인식초)", "Sherry Vinegar (셰리식초)",
  "Malt Vinegar (맥아식초)",
  "Lemon Juice (레몬즙)", "Lime Juice (라임즙)",

  // Savory Sauces & Pastes
  "Soy Sauce (간장)", "Low Sodium Soy Sauce (저염간장)",
  "Coconut Aminos (코코넛아미노)",
  "Fish Sauce (액젓)", "Anchovy Sauce (멸치액젓)", "Sand Lance Sauce (까나리액젓)",
  "Oyster Sauce (굴소스)", "Vegetarian Oyster Sauce (버섯굴소스)",
  "Hoisin Sauce (해선장)",
  "Teriyaki Sauce (데리야끼소스)",
  "Ponzu (폰즈)",
  "Black Bean Sauce (춘장)",
  "Doubanjiang (두반장)",
  "Chili Bean Paste (칠리빈페이스트)",
  "Gochujang (고추장)", "Ssamjang (쌈장)", "Chogochujang (초고추장)",
  "Doenjang (된장)",
  "Miso (미소)",
  "Tahini (타히니)",
  "Peanut Sauce (땅콩소스)",

  // Spicy Sauces
  "Chili Sauce (칠리소스)", "Hot Sauce (핫소스)", "Tabasco (타바스코)",
  "Sriracha (스리라차)", "Sambal Oelek (삼발올렉)", "Chili Oil (고추기름)",
  "Gochugaru (고춧가루)",
  "Wasabi (와사비)", "Horseradish (홀스래디시)",

  // Creamy & Table Sauces
  "Mayonnaise (마요네즈)", "Vegan Mayo (비건마요)",
  "Aioli (아이올리)",
  "Mustard (머스터드)", "Dijon Mustard (디종머스터드)", "Whole Grain Mustard (홀그레인머스터드)", "Honey Mustard (허니머스터드)",
  "Ketchup (케첩)", "Tomato Paste (토마토페이스트)", "Tomato Puree (토마토퓨레)",
  "BBQ Sauce (바베큐소스)", "Steak Sauce (스테이크소스)",
  "Worcestershire Sauce (우스터소스)",
  "Tartar Sauce (타르타르소스)", "Ranch Dressing (랜치드레싱)",
  "Caesar Dressing (시저드레싱)",
  "Vinaigrette (비네그레트)",
  "Salad Dressing (샐러드드레싱)",

  // Pickles & Fermented
  "Pickle (피클)", "Gherkin (오이피클)",
  "Kimchi (김치)", "Vegan Kimchi (비건김치)",
  "Sauerkraut (사우어크라우트)",
  "Olives (올리브절임)", "Capers (케이퍼절임)",
  "Relish (렐리시)",
  "Zha Cai (짜사이)",

  // --- Sweeteners & Additives ---
  // Sugars & Syrups
  "Sugar (설탕)", "White Sugar (백설탕)", "Brown Sugar (흑설탕)",
  "Cane Sugar (사탕수수당)", "Powdered Sugar (분당)",
  "Honey (꿀)", "Raw Honey (생꿀)", "Manuka Honey (마누카꿀)",
  "Maple Syrup (메이플시럽)",
  "Molasses (당밀)", "Blackstrap Molasses (블랙스트랩당밀)",
  "Agave Nectar (아가베시럽)", "Agave Syrup (아가베시럽)",
  "Coconut Sugar (코코넛슈가)", "Palm Sugar (팜슈가)",
  "Rice Syrup (조청)",
  "Corn Syrup (물엿)", "High Fructose Corn Syrup (액상과당)",
  "Glucose Syrup (포도당시럽)",
  "Malt Syrup (맥아시럽)",

  // Zero/Low Calorie Sweeteners
  "Artificial Sweetener (인공감미료)",
  "Aspartame (아스파탐)", "Sucralose (수크랄로스)", "Saccharin (사카린)",
  "Stevia (스테비아)", "Monk Fruit (나한과)",
  "Erythritol (에리스리톨)", "Xylitol (자일리톨)", "Sorbitol (소르비톨)", "Maltitol (말티톨)",
  "Sugar Alcohol (당알코올)",

  // Additives, Thickeners & Preservatives
  "Food Additive (식품첨가물)",
  "Food Coloring (식용색소)", "Artificial Color (인공색소)", "Natural Color (천연색소)",
  "Preservative (방부제)",
  "Sodium Benzoate (안식향산나트륨)", "Potassium Sorbate (소르빈산칼륨)",
  "Nitrates (질산염)", "Nitrites (아질산염)",
  "Sulfites (아황산염)", "Sulphur Dioxide (이산화황)",
  "Citric Acid (구연산)", "Ascorbic Acid (비타민C)",
  "Lecithin (레시틴)",
  "Gelatin (젤라틴)", "Pectin (펙틴)",
  "Agar (한천)", "Carrageenan (카라기난)",
  "Xanthan Gum (잔탄검)", "Guar Gum (구아검)", "Locust Bean Gum (로커스트콩검)",
  "Cornstarch (옥수수전분)", "Potato Starch (감자전분)", "Tapioca Starch (타피오카전분)",
  "Modified Starch (변성전분)",
  "Baking Powder (베이킹파우더)", "Baking Soda (베이킹소다)",

  // --- Beverages & Stimulants ---
  // Coffee & Tea
  "Caffeine (카페인)", "Decaf (디카페인)",
  "Coffee (커피)", "Espresso (에스프레소)", "Cold Brew (콜드브루)",
  "Tea (차)", "Black Tea (홍차)", "Earl Grey (얼그레이)",
  "Green Tea (녹차)", "Matcha (말차)",
  "White Tea (백차)", "Oolong Tea (우롱차)",
  "Herbal Tea (허브차)", "Chamomile (카모마일)", "Peppermint Tea (페퍼민트티)", "Rooibos (루이보스)",
  "Chai (차이)",
  "Bubble Tea (버블티)",

  // Chocolate & Cocoa
  "Chocolate (초콜릿)", "Milk Chocolate (밀크초콜릿)",
  "Dark Chocolate (다크초콜릿)", "White Chocolate (화이트초콜릿)",
  "Cocoa (코코아)", "Cocoa Powder (코코아가루)", "Cacao Nibs (카카오닙스)",
  "Cocoa Butter (코코아버터)",

  // Drinks
  "Juice (주스)", "Orange Juice (오렌지주스)", "Apple Juice (사과주스)",
  "Soda (탄산음료)", "Cola (콜라)",
  "Water (물)", "Sparkling Water (탄산수)", "Mineral Water (미네랄워터)",
  "Energy Drink (에너지드링크)",
  "Sports Drink (이온음료)",
  "Kombucha (콤부차)",

  // Alcohol
  "Alcohol (술)",
  "Beer (맥주)", "Lager (라거)", "Ale (에일)", "Stout (스타우트)", "IPA (IPA)",
  "Gluten-Free Beer (글루텐프리맥주)",
  "Wine (와인)", "Red Wine (레드와인)", "White Wine (화이트와인)", "Sparkling Wine (스파클링와인)",
  "Rosé (로제와인)",
  "Cider (사과주)", "Hard Cider (사과주)",
  "Spirits (증류주)", "Liquor (리큐어)",
  "Vodka (보드카)", "Gin (진)", "Rum (럼)", "Tequila (데킬라)",
  "Whiskey (위스키)", "Bourbon (버번)", "Scotch (스카치)",
  "Brandy (브랜디)", "Cognac (꼬냑)",
  "Sake (사케)", "Soju (소주)", "Makgeolli (막걸리)",
  "Cocktail (칵테일)",

  // --- Common Allergens / Intolerance / Diets ---
  // Major Allergens (The Big 9 + Others)
  "Allergen (알레르겐)",
  "Peanut Allergy (땅콩알레르기)",
  "Tree Nut Allergy (견과알레르기)",
  "Milk Allergy (우유알레르기)", "Dairy Allergy (유제품알레르기)",
  "Egg Allergy (달걀알레르기)",
  "Soy Allergy (대두알레르기)",
  "Wheat Allergy (밀알레르기)",
  "Fish Allergy (생선알레르기)",
  "Shellfish Allergy (해산물알레르기)", "Crustacean Allergy (갑각류알레르기)", "Mollusc Allergy (조개알레르기)",
  "Sesame Allergy (참깨알레르기)",
  "Mustard Allergy (겨자알레르기)",
  "Sulfite Sensitivity (아황산염민감)",
  "Lupin Allergy (루핀알레르기)",

  // Intolerances & Sensitivities
  "Lactose Intolerance (유당불내증)", "Lactose Free (락토프리)",
  "Gluten Intolerance (글루텐불내증)", "Celiac Disease (셀리악병)",
  "Gluten Free (글루텐프리)", "Certified Gluten Free (글루텐프리인증)",
  "FODMAP (포드맵)", "Low FODMAP (저포드맵)",

  // Dietary Preferences & Restrictions
  "Vegetarian (채식)", "Ovo-Vegetarian (난류채식)", "Lacto-Vegetarian (유제품채식)", "Lacto-Ovo Vegetarian (난유채식)",
  "Vegan (비건)", "Plant-Based (식물성)",
  "Pescatarian (페스코)",
  "Flexitarian (플렉시)",
  "Halal (할랄)",
  "Kosher (코셔)", "Pareve (파레브)",
  "Hindu Diet (힌두식단)",
  "Jain Diet (자이나식단)",
  "Keto (키토)", "Low Carb (저탄수)",
  "Paleo (팔레오)",
  "Whole30 (홀30)",
  "Diabetic Friendly (당뇨식)", "Sugar Free (무설탕)", "No Added Sugar (무가당)",
  "Low Sodium (저염)", "Salt Free (무염)",
  "Low Fat (저지방)", "Fat Free (무지방)",
  "Organic (유기농)", "Non-GMO (논GMO)",

  // --- Others (User preferences & Descriptors) ---
  // Taste & Sensation
  "Spicy (매운맛)", "Mild (순한맛)", "Medium Spicy (중간매운맛)", "Very Spicy (아주매운맛)",
  "Sweet (단맛)", "Savory (감칠맛)", "Salty (짠맛)",
  "Sour (신맛)", "Tart (시큼한맛)", "Bitter (쓴맛)",
  "Umami (우마미)",
  "Rich (진한맛)", "Light (담백한맛)",
  "Greasy (기름진)", "Oily (기름진)",
  "Crispy (바삭한)", "Crunchy (아삭한)",
  "Chewy (쫄깃한)", "Tender (부드러운)", "Creamy (크리미한)",

  // Preparation Methods
  "Raw (날것)", "Uncooked (생것)",
  "Cooked (익힌)", "Fully Cooked (완전익힘)",
  "Fried (튀긴)", "Deep Fried (튀김)", "Stir-Fried (볶음)", "Pan-Fried (지짐)",
  "Grilled (구이)", "BBQ (바베큐)",
  "Roasted (로스팅)", "Baked (오븐구이)",
  "Boiled (삶음)", "Steamed (찜)", "Poached (데침)",
  "Stewed (스튜)", "Braised (조림)",
  "Smoked (훈제)",
  "Cured (염장)", "Aged (숙성)",
  "Fermented (발효)", "Fermented Food (발효식품)",
  "Pickled (절임)",
  "Marinated (재움)",

  // Common Exclusions (Preferences)
  "Garlic-free (마늘제외)",
  "Onion-free (양파제외)",
  "Cilantro-free (고수제외)", "No Cilantro (고수없음)",
  "Pork-free (돼지고기제외)", "No Pork (돼지고기없음)",
  "Beef-free (소고기제외)", "No Beef (소고기없음)",
  "Meat-free (고기제외)",
  "Dairy-free (유제품제외)",
  "Egg-free (달걀제외)",
  "Alcohol-free (무알코올)",
  "Caffeine-free (무카페인)"
];
