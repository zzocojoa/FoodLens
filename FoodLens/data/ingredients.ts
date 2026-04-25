export type IngredientKey = string;

export type SearchableIngredient = Readonly<{
  key: IngredientKey;
  defaultLabel: string;
  aliases: readonly string[];
}>;

export const INGREDIENT_I18N_KEY_PREFIX = 'ingredients';

export const getIngredientI18nKey = (key: IngredientKey): string =>
  `${INGREDIENT_I18N_KEY_PREFIX}.${key}`;

export const SEARCHABLE_INGREDIENTS: SearchableIngredient[] = [
  {
    key: "peach",
    defaultLabel: "Peach",
    aliases: ["복숭아"],
  },
  {
    key: "nectarine",
    defaultLabel: "Nectarine",
    aliases: ["천도복숭아"],
  },
  {
    key: "kiwi",
    defaultLabel: "Kiwi",
    aliases: ["키위"],
  },
  {
    key: "golden_kiwi",
    defaultLabel: "Golden Kiwi",
    aliases: ["골드키위"],
  },
  {
    key: "tomato",
    defaultLabel: "Tomato",
    aliases: ["토마토"],
  },
  {
    key: "cherry_tomato",
    defaultLabel: "Cherry Tomato",
    aliases: ["방울토마토"],
  },
  {
    key: "cucumber",
    defaultLabel: "Cucumber",
    aliases: ["오이"],
  },
  {
    key: "avocado",
    defaultLabel: "Avocado",
    aliases: ["아보카도"],
  },
  {
    key: "mango",
    defaultLabel: "Mango",
    aliases: ["망고"],
  },
  {
    key: "apple_mango",
    defaultLabel: "Apple Mango",
    aliases: ["애플망고"],
  },
  {
    key: "banana",
    defaultLabel: "Banana",
    aliases: ["바나나"],
  },
  {
    key: "plantain",
    defaultLabel: "Plantain",
    aliases: ["플랜테인"],
  },
  {
    key: "apple",
    defaultLabel: "Apple",
    aliases: ["사과"],
  },
  {
    key: "strawberry",
    defaultLabel: "Strawberry",
    aliases: ["딸기"],
  },
  {
    key: "melon",
    defaultLabel: "Melon",
    aliases: ["멜론"],
  },
  {
    key: "cantaloupe",
    defaultLabel: "Cantaloupe",
    aliases: ["칸탈로프"],
  },
  {
    key: "watermelon",
    defaultLabel: "Watermelon",
    aliases: ["수박"],
  },
  {
    key: "grape",
    defaultLabel: "Grape",
    aliases: ["포도"],
  },
  {
    key: "shine_muscat",
    defaultLabel: "Shine Muscat",
    aliases: ["샤인머스캣"],
  },
  {
    key: "orange",
    defaultLabel: "Orange",
    aliases: ["오렌지"],
  },
  {
    key: "blood_orange",
    defaultLabel: "Blood Orange",
    aliases: ["블러드오렌지"],
  },
  {
    key: "lemon",
    defaultLabel: "Lemon",
    aliases: ["레몬"],
  },
  {
    key: "lime",
    defaultLabel: "Lime",
    aliases: ["라임"],
  },
  {
    key: "kaffir_lime",
    defaultLabel: "Kaffir Lime",
    aliases: ["카피르라임"],
  },
  {
    key: "grapefruit",
    defaultLabel: "Grapefruit",
    aliases: ["자몽"],
  },
  {
    key: "mandarin",
    defaultLabel: "Mandarin",
    aliases: ["귤"],
  },
  {
    key: "tangerine",
    defaultLabel: "Tangerine",
    aliases: ["탄제린"],
  },
  {
    key: "clementine",
    defaultLabel: "Clementine",
    aliases: ["클레멘타인"],
  },
  {
    key: "yuzu",
    defaultLabel: "Yuzu",
    aliases: ["유자"],
  },
  {
    key: "kumquat",
    defaultLabel: "Kumquat",
    aliases: ["금귤"],
  },
  {
    key: "pomelo",
    defaultLabel: "Pomelo",
    aliases: ["포멜로"],
  },
  {
    key: "blueberry",
    defaultLabel: "Blueberry",
    aliases: ["블루베리"],
  },
  {
    key: "raspberry",
    defaultLabel: "Raspberry",
    aliases: ["라즈베리"],
  },
  {
    key: "blackberry",
    defaultLabel: "Blackberry",
    aliases: ["블랙베리"],
  },
  {
    key: "cranberry",
    defaultLabel: "Cranberry",
    aliases: ["크랜베리"],
  },
  {
    key: "acai_berry",
    defaultLabel: "Acai Berry",
    aliases: ["아사이베리"],
  },
  {
    key: "goji_berry",
    defaultLabel: "Goji Berry",
    aliases: ["구기자"],
  },
  {
    key: "mulberry",
    defaultLabel: "Mulberry",
    aliases: ["오디"],
  },
  {
    key: "currant",
    defaultLabel: "Currant",
    aliases: ["커런트"],
  },
  {
    key: "cherry",
    defaultLabel: "Cherry",
    aliases: ["체리"],
  },
  {
    key: "pear",
    defaultLabel: "Pear",
    aliases: ["배"],
  },
  {
    key: "asian_pear",
    defaultLabel: "Asian Pear",
    aliases: ["배"],
  },
  {
    key: "plum",
    defaultLabel: "Plum",
    aliases: ["자두"],
  },
  {
    key: "prune",
    defaultLabel: "Prune",
    aliases: ["건자두"],
  },
  {
    key: "apricot",
    defaultLabel: "Apricot",
    aliases: ["살구"],
  },
  {
    key: "fig",
    defaultLabel: "Fig",
    aliases: ["무화과"],
  },
  {
    key: "pomegranate",
    defaultLabel: "Pomegranate",
    aliases: ["석류"],
  },
  {
    key: "quince",
    defaultLabel: "Quince",
    aliases: ["모과"],
  },
  {
    key: "pineapple",
    defaultLabel: "Pineapple",
    aliases: ["파인애플"],
  },
  {
    key: "coconut",
    defaultLabel: "Coconut",
    aliases: ["코코넛"],
  },
  {
    key: "coconut_water",
    defaultLabel: "Coconut Water",
    aliases: ["코코넛워터"],
  },
  {
    key: "coconut_meat",
    defaultLabel: "Coconut Meat",
    aliases: ["코코넛과육"],
  },
  {
    key: "papaya",
    defaultLabel: "Papaya",
    aliases: ["파파야"],
  },
  {
    key: "green_papaya",
    defaultLabel: "Green Papaya",
    aliases: ["그린파파야"],
  },
  {
    key: "guava",
    defaultLabel: "Guava",
    aliases: ["구아바"],
  },
  {
    key: "lychee",
    defaultLabel: "Lychee",
    aliases: ["리치"],
  },
  {
    key: "rambutan",
    defaultLabel: "Rambutan",
    aliases: ["람부탄"],
  },
  {
    key: "longan",
    defaultLabel: "Longan",
    aliases: ["용안"],
  },
  {
    key: "mangosteen",
    defaultLabel: "Mangosteen",
    aliases: ["망고스틴"],
  },
  {
    key: "dragon_fruit",
    defaultLabel: "Dragon Fruit",
    aliases: ["용과"],
  },
  {
    key: "passion_fruit",
    defaultLabel: "Passion Fruit",
    aliases: ["패션프루트"],
  },
  {
    key: "persimmon",
    defaultLabel: "Persimmon",
    aliases: ["감"],
  },
  {
    key: "dried_persimmon",
    defaultLabel: "Dried Persimmon",
    aliases: ["곶감"],
  },
  {
    key: "jujube",
    defaultLabel: "Jujube",
    aliases: ["대추"],
  },
  {
    key: "durian",
    defaultLabel: "Durian",
    aliases: ["두리안"],
  },
  {
    key: "jackfruit",
    defaultLabel: "Jackfruit",
    aliases: ["잭프루트"],
  },
  {
    key: "starfruit",
    defaultLabel: "Starfruit",
    aliases: ["스타프루트"],
  },
  {
    key: "soursop",
    defaultLabel: "Soursop",
    aliases: ["사워솝"],
  },
  {
    key: "breadfruit",
    defaultLabel: "Breadfruit",
    aliases: ["브레드프루트"],
  },
  {
    key: "potato",
    defaultLabel: "Potato",
    aliases: ["감자"],
  },
  {
    key: "sweet_potato",
    defaultLabel: "Sweet Potato",
    aliases: ["고구마"],
  },
  {
    key: "yam",
    defaultLabel: "Yam",
    aliases: ["얌"],
  },
  {
    key: "carrot",
    defaultLabel: "Carrot",
    aliases: ["당근"],
  },
  {
    key: "baby_carrot",
    defaultLabel: "Baby Carrot",
    aliases: ["미니당근"],
  },
  {
    key: "onion",
    defaultLabel: "Onion",
    aliases: ["양파"],
  },
  {
    key: "red_onion",
    defaultLabel: "Red Onion",
    aliases: ["적양파"],
  },
  {
    key: "shallot",
    defaultLabel: "Shallot",
    aliases: ["샬롯"],
  },
  {
    key: "garlic",
    defaultLabel: "Garlic",
    aliases: ["마늘"],
  },
  {
    key: "roasted_garlic",
    defaultLabel: "Roasted Garlic",
    aliases: ["구운마늘"],
  },
  {
    key: "ginger",
    defaultLabel: "Ginger",
    aliases: ["생강"],
  },
  {
    key: "galangal",
    defaultLabel: "Galangal",
    aliases: ["갈랑갈"],
  },
  {
    key: "scallion",
    defaultLabel: "Scallion",
    aliases: ["대파"],
  },
  {
    key: "green_onion",
    defaultLabel: "Green Onion",
    aliases: ["실파"],
  },
  {
    key: "leek",
    defaultLabel: "Leek",
    aliases: ["리크"],
  },
  {
    key: "chive",
    defaultLabel: "Chive",
    aliases: ["차이브"],
  },
  {
    key: "broccoli",
    defaultLabel: "Broccoli",
    aliases: ["브로콜리"],
  },
  {
    key: "broccolini",
    defaultLabel: "Broccolini",
    aliases: ["브로콜리니"],
  },
  {
    key: "cauliflower",
    defaultLabel: "Cauliflower",
    aliases: ["콜리플라워"],
  },
  {
    key: "cabbage",
    defaultLabel: "Cabbage",
    aliases: ["양배추"],
  },
  {
    key: "red_cabbage",
    defaultLabel: "Red Cabbage",
    aliases: ["적양배추"],
  },
  {
    key: "napa_cabbage",
    defaultLabel: "Napa Cabbage",
    aliases: ["배추"],
  },
  {
    key: "brussels_sprout",
    defaultLabel: "Brussels Sprout",
    aliases: ["방울양배추"],
  },
  {
    key: "kohlrabi",
    defaultLabel: "Kohlrabi",
    aliases: ["콜라비"],
  },
  {
    key: "kale",
    defaultLabel: "Kale",
    aliases: ["케일"],
  },
  {
    key: "collard_greens",
    defaultLabel: "Collard Greens",
    aliases: ["콜라드그린"],
  },
  {
    key: "spinach",
    defaultLabel: "Spinach",
    aliases: ["시금치"],
  },
  {
    key: "baby_spinach",
    defaultLabel: "Baby Spinach",
    aliases: ["어린시금치"],
  },
  {
    key: "lettuce",
    defaultLabel: "Lettuce",
    aliases: ["상추"],
  },
  {
    key: "romaine_lettuce",
    defaultLabel: "Romaine Lettuce",
    aliases: ["로메인"],
  },
  {
    key: "iceberg_lettuce",
    defaultLabel: "Iceberg Lettuce",
    aliases: ["양상추"],
  },
  {
    key: "arugula",
    defaultLabel: "Arugula",
    aliases: ["루콜라"],
  },
  {
    key: "watercress",
    defaultLabel: "Watercress",
    aliases: ["물냉이"],
  },
  {
    key: "bok_choy",
    defaultLabel: "Bok Choy",
    aliases: ["청경채"],
  },
  {
    key: "gai_lan",
    defaultLabel: "Gai Lan",
    aliases: ["카이란"],
  },
  {
    key: "choy_sum",
    defaultLabel: "Choy Sum",
    aliases: ["초이삼"],
  },
  {
    key: "bean_sprout",
    defaultLabel: "Bean Sprout",
    aliases: ["콩나물"],
  },
  {
    key: "mung_bean_sprout",
    defaultLabel: "Mung Bean Sprout",
    aliases: ["숙주"],
  },
  {
    key: "bell_pepper",
    defaultLabel: "Bell Pepper",
    aliases: ["파프리카"],
  },
  {
    key: "capsicum",
    defaultLabel: "Capsicum",
    aliases: ["피망"],
  },
  {
    key: "chili_pepper",
    defaultLabel: "Chili Pepper",
    aliases: ["고추"],
  },
  {
    key: "jalapeno",
    defaultLabel: "Jalapeño",
    aliases: ["할라페뇨"],
  },
  {
    key: "habanero",
    defaultLabel: "Habanero",
    aliases: ["하바네로"],
  },
  {
    key: "cayenne_pepper",
    defaultLabel: "Cayenne Pepper",
    aliases: ["카이엔"],
  },
  {
    key: "thai_chili",
    defaultLabel: "Thai Chili",
    aliases: ["태국고추"],
  },
  {
    key: "eggplant",
    defaultLabel: "Eggplant",
    aliases: ["가지"],
  },
  {
    key: "zucchini",
    defaultLabel: "Zucchini",
    aliases: ["주키니"],
  },
  {
    key: "summer_squash",
    defaultLabel: "Summer Squash",
    aliases: ["애호박"],
  },
  {
    key: "pumpkin",
    defaultLabel: "Pumpkin",
    aliases: ["호박"],
  },
  {
    key: "butternut_squash",
    defaultLabel: "Butternut Squash",
    aliases: ["버터넛스쿼시"],
  },
  {
    key: "acorn_squash",
    defaultLabel: "Acorn Squash",
    aliases: ["도토리호박"],
  },
  {
    key: "gherkin",
    defaultLabel: "Gherkin",
    aliases: ["미니오이","오이피클"],
  },
  {
    key: "radish",
    defaultLabel: "Radish",
    aliases: ["무"],
  },
  {
    key: "daikon",
    defaultLabel: "Daikon",
    aliases: ["무"],
  },
  {
    key: "pickled_radish",
    defaultLabel: "Pickled Radish",
    aliases: ["단무지"],
  },
  {
    key: "beet",
    defaultLabel: "Beet",
    aliases: ["비트"],
  },
  {
    key: "turnip",
    defaultLabel: "Turnip",
    aliases: ["순무"],
  },
  {
    key: "parsnip",
    defaultLabel: "Parsnip",
    aliases: ["파스닙"],
  },
  {
    key: "rutabaga",
    defaultLabel: "Rutabaga",
    aliases: ["루타바가"],
  },
  {
    key: "asparagus",
    defaultLabel: "Asparagus",
    aliases: ["아스파라거스"],
  },
  {
    key: "celery",
    defaultLabel: "Celery",
    aliases: ["셀러리"],
  },
  {
    key: "fennel_bulb",
    defaultLabel: "Fennel Bulb",
    aliases: ["펜넬"],
  },
  {
    key: "bamboo_shoot",
    defaultLabel: "Bamboo Shoot",
    aliases: ["죽순"],
  },
  {
    key: "water_chestnut",
    defaultLabel: "Water Chestnut",
    aliases: ["물밤"],
  },
  {
    key: "lotus_root",
    defaultLabel: "Lotus Root",
    aliases: ["연근"],
  },
  {
    key: "burdock_root",
    defaultLabel: "Burdock Root",
    aliases: ["우엉"],
  },
  {
    key: "cassava",
    defaultLabel: "Cassava",
    aliases: ["카사바"],
  },
  {
    key: "taro",
    defaultLabel: "Taro",
    aliases: ["토란"],
  },
  {
    key: "green_bean",
    defaultLabel: "Green Bean",
    aliases: ["그린빈"],
  },
  {
    key: "string_bean",
    defaultLabel: "String Bean",
    aliases: ["줄기콩"],
  },
  {
    key: "snake_bean",
    defaultLabel: "Snake Bean",
    aliases: ["롱빈"],
  },
  {
    key: "okra",
    defaultLabel: "Okra",
    aliases: ["오크라"],
  },
  {
    key: "corn",
    defaultLabel: "Corn",
    aliases: ["옥수수"],
  },
  {
    key: "baby_corn",
    defaultLabel: "Baby Corn",
    aliases: ["영콘"],
  },
  {
    key: "pea",
    defaultLabel: "Pea",
    aliases: ["완두콩"],
  },
  {
    key: "snow_pea",
    defaultLabel: "Snow Pea",
    aliases: ["꼬투리완두"],
  },
  {
    key: "snap_pea",
    defaultLabel: "Snap Pea",
    aliases: ["스냅피"],
  },
  {
    key: "edamame",
    defaultLabel: "Edamame",
    aliases: ["풋콩"],
  },
  {
    key: "mushroom",
    defaultLabel: "Mushroom",
    aliases: ["버섯"],
  },
  {
    key: "button_mushroom",
    defaultLabel: "Button Mushroom",
    aliases: ["양송이"],
  },
  {
    key: "cremini_mushroom",
    defaultLabel: "Cremini Mushroom",
    aliases: ["크레미니"],
  },
  {
    key: "portobello_mushroom",
    defaultLabel: "Portobello Mushroom",
    aliases: ["포토벨로"],
  },
  {
    key: "shiitake",
    defaultLabel: "Shiitake",
    aliases: ["표고"],
  },
  {
    key: "dried_shiitake",
    defaultLabel: "Dried Shiitake",
    aliases: ["건표고"],
  },
  {
    key: "oyster_mushroom",
    defaultLabel: "Oyster Mushroom",
    aliases: ["느타리"],
  },
  {
    key: "king_oyster_mushroom",
    defaultLabel: "King Oyster Mushroom",
    aliases: ["새송이"],
  },
  {
    key: "enoki",
    defaultLabel: "Enoki",
    aliases: ["팽이"],
  },
  {
    key: "maitake",
    defaultLabel: "Maitake",
    aliases: ["잎새"],
  },
  {
    key: "morel",
    defaultLabel: "Morel",
    aliases: ["곰보"],
  },
  {
    key: "porcini",
    defaultLabel: "Porcini",
    aliases: ["포르치니"],
  },
  {
    key: "chanterelle",
    defaultLabel: "Chanterelle",
    aliases: ["샹테렐"],
  },
  {
    key: "truffle",
    defaultLabel: "Truffle",
    aliases: ["트러플"],
  },
  {
    key: "black_truffle",
    defaultLabel: "Black Truffle",
    aliases: ["블랙트러플"],
  },
  {
    key: "white_truffle",
    defaultLabel: "White Truffle",
    aliases: ["화이트트러플"],
  },
  {
    key: "wood_ear_mushroom",
    defaultLabel: "Wood Ear Mushroom",
    aliases: ["목이버섯"],
  },
  {
    key: "olive",
    defaultLabel: "Olive",
    aliases: ["올리브"],
  },
  {
    key: "black_olive",
    defaultLabel: "Black Olive",
    aliases: ["블랙올리브"],
  },
  {
    key: "green_olive",
    defaultLabel: "Green Olive",
    aliases: ["그린올리브"],
  },
  {
    key: "artichoke",
    defaultLabel: "Artichoke",
    aliases: ["아티초크"],
  },
  {
    key: "artichoke_heart",
    defaultLabel: "Artichoke Heart",
    aliases: ["아티초크하트"],
  },
  {
    key: "caper",
    defaultLabel: "Caper",
    aliases: ["케이퍼"],
  },
  {
    key: "seaweed",
    defaultLabel: "Seaweed",
    aliases: ["해조류"],
  },
  {
    key: "nori",
    defaultLabel: "Nori",
    aliases: ["김"],
  },
  {
    key: "kelp",
    defaultLabel: "Kelp",
    aliases: ["다시마"],
  },
  {
    key: "wakame",
    defaultLabel: "Wakame",
    aliases: ["미역"],
  },
  {
    key: "hijiki",
    defaultLabel: "Hijiki",
    aliases: ["톳"],
  },
  {
    key: "agar_agar",
    defaultLabel: "Agar-agar",
    aliases: ["한천"],
  },
  {
    key: "meat",
    defaultLabel: "Meat",
    aliases: ["고기"],
  },
  {
    key: "red_meat",
    defaultLabel: "Red Meat",
    aliases: ["적색육"],
  },
  {
    key: "beef",
    defaultLabel: "Beef",
    aliases: ["소고기"],
  },
  {
    key: "steak",
    defaultLabel: "Steak",
    aliases: ["스테이크"],
  },
  {
    key: "ground_beef",
    defaultLabel: "Ground Beef",
    aliases: ["다진소고기"],
  },
  {
    key: "wagyu",
    defaultLabel: "Wagyu",
    aliases: ["와규"],
  },
  {
    key: "pork",
    defaultLabel: "Pork",
    aliases: ["돼지고기"],
  },
  {
    key: "pork_belly",
    defaultLabel: "Pork Belly",
    aliases: ["삼겹살"],
  },
  {
    key: "ground_pork",
    defaultLabel: "Ground Pork",
    aliases: ["다진돼지고기"],
  },
  {
    key: "lamb",
    defaultLabel: "Lamb",
    aliases: ["양고기"],
  },
  {
    key: "mutton",
    defaultLabel: "Mutton",
    aliases: ["머튼"],
  },
  {
    key: "goat",
    defaultLabel: "Goat",
    aliases: ["염소고기"],
  },
  {
    key: "venison",
    defaultLabel: "Venison",
    aliases: ["사슴고기"],
  },
  {
    key: "bison",
    defaultLabel: "Bison",
    aliases: ["바이슨"],
  },
  {
    key: "rabbit",
    defaultLabel: "Rabbit",
    aliases: ["토끼고기"],
  },
  {
    key: "wild_boar",
    defaultLabel: "Wild Boar",
    aliases: ["멧돼지고기"],
  },
  {
    key: "chicken",
    defaultLabel: "Chicken",
    aliases: ["닭고기"],
  },
  {
    key: "chicken_breast",
    defaultLabel: "Chicken Breast",
    aliases: ["닭가슴살"],
  },
  {
    key: "chicken_thigh",
    defaultLabel: "Chicken Thigh",
    aliases: ["닭다리살"],
  },
  {
    key: "chicken_wing",
    defaultLabel: "Chicken Wing",
    aliases: ["닭날개"],
  },
  {
    key: "turkey",
    defaultLabel: "Turkey",
    aliases: ["칠면조"],
  },
  {
    key: "duck",
    defaultLabel: "Duck",
    aliases: ["오리고기"],
  },
  {
    key: "goose",
    defaultLabel: "Goose",
    aliases: ["거위고기"],
  },
  {
    key: "quail",
    defaultLabel: "Quail",
    aliases: ["메추라기"],
  },
  {
    key: "cornish_hen",
    defaultLabel: "Cornish Hen",
    aliases: ["영계"],
  },
  {
    key: "offal",
    defaultLabel: "Offal",
    aliases: ["내장"],
  },
  {
    key: "liver",
    defaultLabel: "Liver",
    aliases: ["간"],
  },
  {
    key: "kidney",
    defaultLabel: "Kidney",
    aliases: ["콩팥"],
  },
  {
    key: "heart",
    defaultLabel: "Heart",
    aliases: ["심장"],
  },
  {
    key: "tripe",
    defaultLabel: "Tripe",
    aliases: ["양"],
  },
  {
    key: "tongue",
    defaultLabel: "Tongue",
    aliases: ["우설"],
  },
  {
    key: "intestine",
    defaultLabel: "Intestine",
    aliases: ["곱창"],
  },
  {
    key: "processed_meat",
    defaultLabel: "Processed Meat",
    aliases: ["가공육"],
  },
  {
    key: "bacon",
    defaultLabel: "Bacon",
    aliases: ["베이컨"],
  },
  {
    key: "pancetta",
    defaultLabel: "Pancetta",
    aliases: ["판체타"],
  },
  {
    key: "ham",
    defaultLabel: "Ham",
    aliases: ["햄"],
  },
  {
    key: "prosciutto",
    defaultLabel: "Prosciutto",
    aliases: ["프로슈토"],
  },
  {
    key: "jamon",
    defaultLabel: "Jamón",
    aliases: ["하몽"],
  },
  {
    key: "sausage",
    defaultLabel: "Sausage",
    aliases: ["소시지"],
  },
  {
    key: "chorizo",
    defaultLabel: "Chorizo",
    aliases: ["초리조"],
  },
  {
    key: "bratwurst",
    defaultLabel: "Bratwurst",
    aliases: ["브라트부르스트"],
  },
  {
    key: "salami",
    defaultLabel: "Salami",
    aliases: ["살라미"],
  },
  {
    key: "pepperoni",
    defaultLabel: "Pepperoni",
    aliases: ["페퍼로니"],
  },
  {
    key: "bologna",
    defaultLabel: "Bologna",
    aliases: ["볼로냐"],
  },
  {
    key: "spam",
    defaultLabel: "Spam",
    aliases: ["스팸"],
  },
  {
    key: "hot_dog",
    defaultLabel: "Hot Dog",
    aliases: ["핫도그"],
  },
  {
    key: "fish",
    defaultLabel: "Fish",
    aliases: ["생선"],
  },
  {
    key: "raw_fish",
    defaultLabel: "Raw Fish",
    aliases: ["회"],
  },
  {
    key: "sashimi",
    defaultLabel: "Sashimi",
    aliases: ["사시미"],
  },
  {
    key: "white_fish",
    defaultLabel: "White Fish",
    aliases: ["흰살생선"],
  },
  {
    key: "oily_fish",
    defaultLabel: "Oily Fish",
    aliases: ["등푸른생선"],
  },
  {
    key: "salmon",
    defaultLabel: "Salmon",
    aliases: ["연어"],
  },
  {
    key: "smoked_salmon",
    defaultLabel: "Smoked Salmon",
    aliases: ["훈제연어"],
  },
  {
    key: "tuna",
    defaultLabel: "Tuna",
    aliases: ["참치"],
  },
  {
    key: "albacore_tuna",
    defaultLabel: "Albacore Tuna",
    aliases: ["날개다랑어"],
  },
  {
    key: "skipjack_tuna",
    defaultLabel: "Skipjack Tuna",
    aliases: ["가다랑어"],
  },
  {
    key: "cod",
    defaultLabel: "Cod",
    aliases: ["대구"],
  },
  {
    key: "black_cod",
    defaultLabel: "Black Cod",
    aliases: ["은대구"],
  },
  {
    key: "mackerel",
    defaultLabel: "Mackerel",
    aliases: ["고등어"],
  },
  {
    key: "spanish_mackerel",
    defaultLabel: "Spanish Mackerel",
    aliases: ["삼치"],
  },
  {
    key: "sardine",
    defaultLabel: "Sardine",
    aliases: ["정어리"],
  },
  {
    key: "anchovy",
    defaultLabel: "Anchovy",
    aliases: ["멸치"],
  },
  {
    key: "trout",
    defaultLabel: "Trout",
    aliases: ["송어"],
  },
  {
    key: "rainbow_trout",
    defaultLabel: "Rainbow Trout",
    aliases: ["무지개송어"],
  },
  {
    key: "snapper",
    defaultLabel: "Snapper",
    aliases: ["도미"],
  },
  {
    key: "red_snapper",
    defaultLabel: "Red Snapper",
    aliases: ["참돔"],
  },
  {
    key: "sea_bass",
    defaultLabel: "Sea Bass",
    aliases: ["농어"],
  },
  {
    key: "chilean_sea_bass",
    defaultLabel: "Chilean Sea Bass",
    aliases: ["메로"],
  },
  {
    key: "grouper",
    defaultLabel: "Grouper",
    aliases: ["다금바리"],
  },
  {
    key: "halibut",
    defaultLabel: "Halibut",
    aliases: ["광어"],
  },
  {
    key: "flounder",
    defaultLabel: "Flounder",
    aliases: ["가자미"],
  },
  {
    key: "sole",
    defaultLabel: "Sole",
    aliases: ["서대"],
  },
  {
    key: "tilapia",
    defaultLabel: "Tilapia",
    aliases: ["틸라피아"],
  },
  {
    key: "catfish",
    defaultLabel: "Catfish",
    aliases: ["메기"],
  },
  {
    key: "eel",
    defaultLabel: "Eel",
    aliases: ["장어"],
  },
  {
    key: "unagi",
    defaultLabel: "Unagi",
    aliases: ["민물장어"],
  },
  {
    key: "anago",
    defaultLabel: "Anago",
    aliases: ["붕장어"],
  },
  {
    key: "herring",
    defaultLabel: "Herring",
    aliases: ["청어"],
  },
  {
    key: "pollock",
    defaultLabel: "Pollock",
    aliases: ["명태"],
  },
  {
    key: "haddock",
    defaultLabel: "Haddock",
    aliases: ["해덕"],
  },
  {
    key: "monkfish",
    defaultLabel: "Monkfish",
    aliases: ["아귀"],
  },
  {
    key: "skate",
    defaultLabel: "Skate",
    aliases: ["홍어"],
  },
  {
    key: "swordfish",
    defaultLabel: "Swordfish",
    aliases: ["황새치"],
  },
  {
    key: "mahi_mahi",
    defaultLabel: "Mahi Mahi",
    aliases: ["만새기"],
  },
  {
    key: "yellowtail",
    defaultLabel: "Yellowtail",
    aliases: ["방어"],
  },
  {
    key: "shellfish",
    defaultLabel: "Shellfish",
    aliases: ["해산물"],
  },
  {
    key: "crustacean",
    defaultLabel: "Crustacean",
    aliases: ["갑각류"],
  },
  {
    key: "shrimp",
    defaultLabel: "Shrimp",
    aliases: ["새우"],
  },
  {
    key: "prawn",
    defaultLabel: "Prawn",
    aliases: ["대하"],
  },
  {
    key: "cocktail_shrimp",
    defaultLabel: "Cocktail Shrimp",
    aliases: ["칵테일새우"],
  },
  {
    key: "crab",
    defaultLabel: "Crab",
    aliases: ["게"],
  },
  {
    key: "king_crab",
    defaultLabel: "King Crab",
    aliases: ["킹크랩"],
  },
  {
    key: "snow_crab",
    defaultLabel: "Snow Crab",
    aliases: ["대게"],
  },
  {
    key: "soft_shell_crab",
    defaultLabel: "Soft Shell Crab",
    aliases: ["소프트쉘크랩"],
  },
  {
    key: "crab_stick",
    defaultLabel: "Crab Stick",
    aliases: ["게맛살"],
  },
  {
    key: "imitation_crab",
    defaultLabel: "Imitation Crab",
    aliases: ["크래미"],
  },
  {
    key: "lobster",
    defaultLabel: "Lobster",
    aliases: ["랍스터"],
  },
  {
    key: "crayfish",
    defaultLabel: "Crayfish",
    aliases: ["가재"],
  },
  {
    key: "crawfish",
    defaultLabel: "Crawfish",
    aliases: ["민물가재"],
  },
  {
    key: "krill",
    defaultLabel: "Krill",
    aliases: ["크릴"],
  },
  {
    key: "mollusc",
    defaultLabel: "Mollusc",
    aliases: ["조개류"],
  },
  {
    key: "clam",
    defaultLabel: "Clam",
    aliases: ["조개"],
  },
  {
    key: "littleneck_clam",
    defaultLabel: "Littleneck Clam",
    aliases: ["바지락"],
  },
  {
    key: "manila_clam",
    defaultLabel: "Manila Clam",
    aliases: ["바지락"],
  },
  {
    key: "mussel",
    defaultLabel: "Mussel",
    aliases: ["홍합"],
  },
  {
    key: "green_lipped_mussel",
    defaultLabel: "Green Lipped Mussel",
    aliases: ["초록입홍합"],
  },
  {
    key: "oyster",
    defaultLabel: "Oyster",
    aliases: ["굴"],
  },
  {
    key: "raw_oyster",
    defaultLabel: "Raw Oyster",
    aliases: ["생굴"],
  },
  {
    key: "scallop",
    defaultLabel: "Scallop",
    aliases: ["가리비"],
  },
  {
    key: "bay_scallop",
    defaultLabel: "Bay Scallop",
    aliases: ["작은가리비"],
  },
  {
    key: "abalone",
    defaultLabel: "Abalone",
    aliases: ["전복"],
  },
  {
    key: "conch",
    defaultLabel: "Conch",
    aliases: ["소라"],
  },
  {
    key: "whelk",
    defaultLabel: "Whelk",
    aliases: ["골뱅이"],
  },
  {
    key: "snail",
    defaultLabel: "Snail",
    aliases: ["달팽이"],
  },
  {
    key: "octopus",
    defaultLabel: "Octopus",
    aliases: ["문어"],
  },
  {
    key: "baby_octopus",
    defaultLabel: "Baby Octopus",
    aliases: ["쭈꾸미"],
  },
  {
    key: "squid",
    defaultLabel: "Squid",
    aliases: ["오징어"],
  },
  {
    key: "calamari",
    defaultLabel: "Calamari",
    aliases: ["깔라마리"],
  },
  {
    key: "cuttlefish",
    defaultLabel: "Cuttlefish",
    aliases: ["갑오징어"],
  },
  {
    key: "sea_urchin",
    defaultLabel: "Sea Urchin",
    aliases: ["성게"],
  },
  {
    key: "jellyfish",
    defaultLabel: "Jellyfish",
    aliases: ["해파리"],
  },
  {
    key: "fish_roe",
    defaultLabel: "Fish Roe",
    aliases: ["어란"],
  },
  {
    key: "caviar",
    defaultLabel: "Caviar",
    aliases: ["캐비어"],
  },
  {
    key: "salmon_roe",
    defaultLabel: "Salmon Roe",
    aliases: ["연어알"],
  },
  {
    key: "flying_fish_roe",
    defaultLabel: "Flying Fish Roe",
    aliases: ["날치알"],
  },
  {
    key: "pollock_roe",
    defaultLabel: "Pollock Roe",
    aliases: ["명란"],
  },
  {
    key: "mentaiko",
    defaultLabel: "Mentaiko",
    aliases: ["멘타이코"],
  },
  {
    key: "egg",
    defaultLabel: "Egg",
    aliases: ["달걀"],
  },
  {
    key: "whole_egg",
    defaultLabel: "Whole Egg",
    aliases: ["전란"],
  },
  {
    key: "egg_white",
    defaultLabel: "Egg White",
    aliases: ["흰자"],
  },
  {
    key: "egg_yolk",
    defaultLabel: "Egg Yolk",
    aliases: ["노른자"],
  },
  {
    key: "raw_egg",
    defaultLabel: "Raw Egg",
    aliases: ["날달걀"],
  },
  {
    key: "cooked_egg",
    defaultLabel: "Cooked Egg",
    aliases: ["익힌달걀"],
  },
  {
    key: "hard_boiled_egg",
    defaultLabel: "Hard Boiled Egg",
    aliases: ["삶은달걀"],
  },
  {
    key: "scrambled_egg",
    defaultLabel: "Scrambled Egg",
    aliases: ["스크램블에그"],
  },
  {
    key: "quail_egg",
    defaultLabel: "Quail Egg",
    aliases: ["메추리알"],
  },
  {
    key: "duck_egg",
    defaultLabel: "Duck Egg",
    aliases: ["오리알"],
  },
  {
    key: "milk",
    defaultLabel: "Milk",
    aliases: ["우유"],
  },
  {
    key: "dairy",
    defaultLabel: "Dairy",
    aliases: ["유제품"],
  },
  {
    key: "cows_milk",
    defaultLabel: "Cow's Milk",
    aliases: ["우유"],
  },
  {
    key: "whole_milk",
    defaultLabel: "Whole Milk",
    aliases: ["전지우유"],
  },
  {
    key: "low_fat_milk",
    defaultLabel: "Low Fat Milk",
    aliases: ["저지방우유"],
  },
  {
    key: "skim_milk",
    defaultLabel: "Skim Milk",
    aliases: ["무지방우유"],
  },
  {
    key: "lactose_free_milk",
    defaultLabel: "Lactose-Free Milk",
    aliases: ["락토프리우유"],
  },
  {
    key: "cream",
    defaultLabel: "Cream",
    aliases: ["크림"],
  },
  {
    key: "heavy_cream",
    defaultLabel: "Heavy Cream",
    aliases: ["생크림"],
  },
  {
    key: "whipping_cream",
    defaultLabel: "Whipping Cream",
    aliases: ["휘핑크림"],
  },
  {
    key: "half_and_half",
    defaultLabel: "Half and Half",
    aliases: ["하프앤하프"],
  },
  {
    key: "sour_cream",
    defaultLabel: "Sour Cream",
    aliases: ["사워크림"],
  },
  {
    key: "creme_fraiche",
    defaultLabel: "Crème Fraîche",
    aliases: ["크렘프레슈"],
  },
  {
    key: "buttermilk",
    defaultLabel: "Buttermilk",
    aliases: ["버터밀크"],
  },
  {
    key: "condensed_milk",
    defaultLabel: "Condensed Milk",
    aliases: ["연유"],
  },
  {
    key: "evaporated_milk",
    defaultLabel: "Evaporated Milk",
    aliases: ["무가당연유"],
  },
  {
    key: "butter",
    defaultLabel: "Butter",
    aliases: ["버터"],
  },
  {
    key: "salted_butter",
    defaultLabel: "Salted Butter",
    aliases: ["가염버터"],
  },
  {
    key: "unsalted_butter",
    defaultLabel: "Unsalted Butter",
    aliases: ["무염버터"],
  },
  {
    key: "ghee",
    defaultLabel: "Ghee",
    aliases: ["기"],
  },
  {
    key: "yogurt",
    defaultLabel: "Yogurt",
    aliases: ["요거트"],
  },
  {
    key: "greek_yogurt",
    defaultLabel: "Greek Yogurt",
    aliases: ["그릭요거트"],
  },
  {
    key: "kefir",
    defaultLabel: "Kefir",
    aliases: ["케피어"],
  },
  {
    key: "cheese",
    defaultLabel: "Cheese",
    aliases: ["치즈"],
  },
  {
    key: "cheddar",
    defaultLabel: "Cheddar",
    aliases: ["체다"],
  },
  {
    key: "mozzarella",
    defaultLabel: "Mozzarella",
    aliases: ["모짜렐라"],
  },
  {
    key: "parmesan",
    defaultLabel: "Parmesan",
    aliases: ["파마산"],
  },
  {
    key: "cream_cheese",
    defaultLabel: "Cream Cheese",
    aliases: ["크림치즈"],
  },
  {
    key: "ricotta",
    defaultLabel: "Ricotta",
    aliases: ["리코타"],
  },
  {
    key: "cottage_cheese",
    defaultLabel: "Cottage Cheese",
    aliases: ["코티지치즈"],
  },
  {
    key: "feta",
    defaultLabel: "Feta",
    aliases: ["페타"],
  },
  {
    key: "goat_cheese",
    defaultLabel: "Goat Cheese",
    aliases: ["염소치즈"],
  },
  {
    key: "sheep_milk_cheese",
    defaultLabel: "Sheep Milk Cheese",
    aliases: ["양유치즈"],
  },
  {
    key: "brie",
    defaultLabel: "Brie",
    aliases: ["브리"],
  },
  {
    key: "camembert",
    defaultLabel: "Camembert",
    aliases: ["카망베르"],
  },
  {
    key: "blue_cheese",
    defaultLabel: "Blue Cheese",
    aliases: ["블루치즈"],
  },
  {
    key: "gorgonzola",
    defaultLabel: "Gorgonzola",
    aliases: ["고르곤졸라"],
  },
  {
    key: "roquefort",
    defaultLabel: "Roquefort",
    aliases: ["로크포르"],
  },
  {
    key: "gruyere",
    defaultLabel: "Gruyère",
    aliases: ["그뤼에르"],
  },
  {
    key: "emmental",
    defaultLabel: "Emmental",
    aliases: ["에멘탈"],
  },
  {
    key: "gouda",
    defaultLabel: "Gouda",
    aliases: ["고다"],
  },
  {
    key: "provolone",
    defaultLabel: "Provolone",
    aliases: ["프로볼론"],
  },
  {
    key: "monterey_jack",
    defaultLabel: "Monterey Jack",
    aliases: ["몬테레이잭"],
  },
  {
    key: "paneer",
    defaultLabel: "Paneer",
    aliases: ["파니르"],
  },
  {
    key: "halloumi",
    defaultLabel: "Halloumi",
    aliases: ["할루미"],
  },
  {
    key: "whey",
    defaultLabel: "Whey",
    aliases: ["유청"],
  },
  {
    key: "whey_protein",
    defaultLabel: "Whey Protein",
    aliases: ["유청단백질"],
  },
  {
    key: "casein",
    defaultLabel: "Casein",
    aliases: ["카제인"],
  },
  {
    key: "caseinate",
    defaultLabel: "Caseinate",
    aliases: ["카제인염"],
  },
  {
    key: "lactose",
    defaultLabel: "Lactose",
    aliases: ["유당"],
  },
  {
    key: "plant_based_milk",
    defaultLabel: "Plant-Based Milk",
    aliases: ["식물성우유"],
  },
  {
    key: "soy_milk",
    defaultLabel: "Soy Milk",
    aliases: ["두유"],
  },
  {
    key: "almond_milk",
    defaultLabel: "Almond Milk",
    aliases: ["아몬드우유"],
  },
  {
    key: "oat_milk",
    defaultLabel: "Oat Milk",
    aliases: ["귀리우유"],
  },
  {
    key: "coconut_milk",
    defaultLabel: "Coconut Milk",
    aliases: ["코코넛밀크"],
  },
  {
    key: "rice_milk",
    defaultLabel: "Rice Milk",
    aliases: ["쌀우유"],
  },
  {
    key: "cashew_milk",
    defaultLabel: "Cashew Milk",
    aliases: ["캐슈우유"],
  },
  {
    key: "macadamia_milk",
    defaultLabel: "Macadamia Milk",
    aliases: ["마카다미아우유"],
  },
  {
    key: "hemp_milk",
    defaultLabel: "Hemp Milk",
    aliases: ["햄프우유"],
  },
  {
    key: "pea_milk",
    defaultLabel: "Pea Milk",
    aliases: ["완두우유"],
  },
  {
    key: "vegan_cheese",
    defaultLabel: "Vegan Cheese",
    aliases: ["비건치즈"],
  },
  {
    key: "vegan_butter",
    defaultLabel: "Vegan Butter",
    aliases: ["비건버터"],
  },
  {
    key: "margarine",
    defaultLabel: "Margarine",
    aliases: ["마가린"],
  },
  {
    key: "peanut",
    defaultLabel: "Peanut",
    aliases: ["땅콩"],
  },
  {
    key: "roasted_peanut",
    defaultLabel: "Roasted Peanut",
    aliases: ["볶은땅콩"],
  },
  {
    key: "boiled_peanut",
    defaultLabel: "Boiled Peanut",
    aliases: ["삶은땅콩"],
  },
  {
    key: "peanut_butter",
    defaultLabel: "Peanut Butter",
    aliases: ["땅콩버터"],
  },
  {
    key: "peanut_oil",
    defaultLabel: "Peanut Oil",
    aliases: ["땅콩기름"],
  },
  {
    key: "peanut_flour",
    defaultLabel: "Peanut Flour",
    aliases: ["땅콩가루"],
  },
  {
    key: "tree_nuts",
    defaultLabel: "Tree Nuts",
    aliases: ["견과류"],
  },
  {
    key: "nut",
    defaultLabel: "Nut",
    aliases: ["견과"],
  },
  {
    key: "almond",
    defaultLabel: "Almond",
    aliases: ["아몬드"],
  },
  {
    key: "sliced_almond",
    defaultLabel: "Sliced Almond",
    aliases: ["슬라이스아몬드"],
  },
  {
    key: "almond_flour",
    defaultLabel: "Almond Flour",
    aliases: ["아몬드가루"],
  },
  {
    key: "almond_butter",
    defaultLabel: "Almond Butter",
    aliases: ["아몬드버터"],
  },
  {
    key: "walnut",
    defaultLabel: "Walnut",
    aliases: ["호두"],
  },
  {
    key: "cashew",
    defaultLabel: "Cashew",
    aliases: ["캐슈넛"],
  },
  {
    key: "cashew_butter",
    defaultLabel: "Cashew Butter",
    aliases: ["캐슈버터"],
  },
  {
    key: "pistachio",
    defaultLabel: "Pistachio",
    aliases: ["피스타치오"],
  },
  {
    key: "hazelnut",
    defaultLabel: "Hazelnut",
    aliases: ["헤이즐넛"],
  },
  {
    key: "filbert",
    defaultLabel: "Filbert",
    aliases: ["헤이즐넛"],
  },
  {
    key: "pecan",
    defaultLabel: "Pecan",
    aliases: ["피칸"],
  },
  {
    key: "macadamia",
    defaultLabel: "Macadamia",
    aliases: ["마카다미아"],
  },
  {
    key: "macadamia_nut",
    defaultLabel: "Macadamia Nut",
    aliases: ["마카다미아넛"],
  },
  {
    key: "brazil_nut",
    defaultLabel: "Brazil Nut",
    aliases: ["브라질너트"],
  },
  {
    key: "pine_nut",
    defaultLabel: "Pine Nut",
    aliases: ["잣"],
  },
  {
    key: "pignoli",
    defaultLabel: "Pignoli",
    aliases: ["잣"],
  },
  {
    key: "chestnut",
    defaultLabel: "Chestnut",
    aliases: ["밤"],
  },
  {
    key: "roasted_chestnut",
    defaultLabel: "Roasted Chestnut",
    aliases: ["군밤"],
  },
  {
    key: "shea_nut",
    defaultLabel: "Shea Nut",
    aliases: ["쉐어넛"],
  },
  {
    key: "ginkgo_nut",
    defaultLabel: "Ginkgo Nut",
    aliases: ["은행"],
  },
  {
    key: "seed",
    defaultLabel: "Seed",
    aliases: ["씨앗류"],
  },
  {
    key: "sesame",
    defaultLabel: "Sesame",
    aliases: ["참깨"],
  },
  {
    key: "white_sesame",
    defaultLabel: "White Sesame",
    aliases: ["흰참깨"],
  },
  {
    key: "black_sesame",
    defaultLabel: "Black Sesame",
    aliases: ["흑임자"],
  },
  {
    key: "sesame_oil",
    defaultLabel: "Sesame Oil",
    aliases: ["참기름"],
  },
  {
    key: "toasted_sesame_oil",
    defaultLabel: "Toasted Sesame Oil",
    aliases: ["볶은참기름"],
  },
  {
    key: "tahini",
    defaultLabel: "Tahini",
    aliases: ["타히니"],
  },
  {
    key: "mustard_seed",
    defaultLabel: "Mustard Seed",
    aliases: ["겨자씨"],
  },
  {
    key: "poppy_seed",
    defaultLabel: "Poppy Seed",
    aliases: ["양귀비씨"],
  },
  {
    key: "sunflower_seed",
    defaultLabel: "Sunflower Seed",
    aliases: ["해바라기씨"],
  },
  {
    key: "sunflower_oil",
    defaultLabel: "Sunflower Oil",
    aliases: ["해바라기유"],
  },
  {
    key: "sunbutter",
    defaultLabel: "Sunbutter",
    aliases: ["해바라기버터"],
  },
  {
    key: "pumpkin_seed",
    defaultLabel: "Pumpkin Seed",
    aliases: ["호박씨"],
  },
  {
    key: "pepita",
    defaultLabel: "Pepita",
    aliases: ["호박씨"],
  },
  {
    key: "chia_seed",
    defaultLabel: "Chia Seed",
    aliases: ["치아씨"],
  },
  {
    key: "flaxseed",
    defaultLabel: "Flaxseed",
    aliases: ["아마씨"],
  },
  {
    key: "linseed",
    defaultLabel: "Linseed",
    aliases: ["아마씨"],
  },
  {
    key: "flaxseed_oil",
    defaultLabel: "Flaxseed Oil",
    aliases: ["아마씨유"],
  },
  {
    key: "hemp_seed",
    defaultLabel: "Hemp Seed",
    aliases: ["햄프씨드"],
  },
  {
    key: "hemp_heart",
    defaultLabel: "Hemp Heart",
    aliases: ["햄프씨드"],
  },
  {
    key: "perilla_seed",
    defaultLabel: "Perilla Seed",
    aliases: ["들깨"],
  },
  {
    key: "perilla_oil",
    defaultLabel: "Perilla Oil",
    aliases: ["들기름"],
  },
  {
    key: "cumin_seed",
    defaultLabel: "Cumin Seed",
    aliases: ["큐민씨"],
  },
  {
    key: "fennel_seed",
    defaultLabel: "Fennel Seed",
    aliases: ["펜넬씨"],
  },
  {
    key: "caraway_seed",
    defaultLabel: "Caraway Seed",
    aliases: ["카라웨이씨"],
  },
  {
    key: "cooking_oil",
    defaultLabel: "Cooking Oil",
    aliases: ["식용유"],
  },
  {
    key: "vegetable_oil",
    defaultLabel: "Vegetable Oil",
    aliases: ["식물성기름"],
  },
  {
    key: "olive_oil",
    defaultLabel: "Olive Oil",
    aliases: ["올리브유"],
  },
  {
    key: "extra_virgin_olive_oil",
    defaultLabel: "Extra Virgin Olive Oil",
    aliases: ["엑스트라버진올리브유"],
  },
  {
    key: "canola_oil",
    defaultLabel: "Canola Oil",
    aliases: ["카놀라유"],
  },
  {
    key: "rapeseed_oil",
    defaultLabel: "Rapeseed Oil",
    aliases: ["유채유"],
  },
  {
    key: "corn_oil",
    defaultLabel: "Corn Oil",
    aliases: ["옥수수유"],
  },
  {
    key: "soybean_oil",
    defaultLabel: "Soybean Oil",
    aliases: ["대두유"],
  },
  {
    key: "coconut_oil",
    defaultLabel: "Coconut Oil",
    aliases: ["코코넛오일"],
  },
  {
    key: "palm_oil",
    defaultLabel: "Palm Oil",
    aliases: ["팜유"],
  },
  {
    key: "avocado_oil",
    defaultLabel: "Avocado Oil",
    aliases: ["아보카도오일"],
  },
  {
    key: "grapeseed_oil",
    defaultLabel: "Grapeseed Oil",
    aliases: ["포도씨유"],
  },
  {
    key: "rice_bran_oil",
    defaultLabel: "Rice Bran Oil",
    aliases: ["미강유"],
  },
  {
    key: "lard",
    defaultLabel: "Lard",
    aliases: ["돼지기름"],
  },
  {
    key: "tallow",
    defaultLabel: "Tallow",
    aliases: ["우지"],
  },
  {
    key: "schmaltz",
    defaultLabel: "Schmaltz",
    aliases: ["닭기름"],
  },
  {
    key: "shortening",
    defaultLabel: "Shortening",
    aliases: ["쇼트닝"],
  },
  {
    key: "wheat",
    defaultLabel: "Wheat",
    aliases: ["밀"],
  },
  {
    key: "whole_wheat",
    defaultLabel: "Whole Wheat",
    aliases: ["통밀"],
  },
  {
    key: "wheat_flour",
    defaultLabel: "Wheat Flour",
    aliases: ["밀가루"],
  },
  {
    key: "gluten",
    defaultLabel: "Gluten",
    aliases: ["글루텐"],
  },
  {
    key: "wheat_gluten",
    defaultLabel: "Wheat Gluten",
    aliases: ["밀글루텐"],
  },
  {
    key: "vital_wheat_gluten",
    defaultLabel: "Vital Wheat Gluten",
    aliases: ["활성글루텐"],
  },
  {
    key: "seitan",
    defaultLabel: "Seitan",
    aliases: ["세이탄"],
  },
  {
    key: "barley",
    defaultLabel: "Barley",
    aliases: ["보리"],
  },
  {
    key: "malt",
    defaultLabel: "Malt",
    aliases: ["맥아"],
  },
  {
    key: "malt_vinegar",
    defaultLabel: "Malt Vinegar",
    aliases: ["맥아식초"],
  },
  {
    key: "rye",
    defaultLabel: "Rye",
    aliases: ["호밀"],
  },
  {
    key: "pumpernickel",
    defaultLabel: "Pumpernickel",
    aliases: ["펌퍼니클"],
  },
  {
    key: "oat",
    defaultLabel: "Oat",
    aliases: ["귀리"],
  },
  {
    key: "rolled_oats",
    defaultLabel: "Rolled Oats",
    aliases: ["압착귀리"],
  },
  {
    key: "steel_cut_oats",
    defaultLabel: "Steel-cut Oats",
    aliases: ["스틸컷오트"],
  },
  {
    key: "triticale",
    defaultLabel: "Triticale",
    aliases: ["트리티케일"],
  },
  {
    key: "spelt",
    defaultLabel: "Spelt",
    aliases: ["스펠트"],
  },
  {
    key: "kamut",
    defaultLabel: "Kamut",
    aliases: ["카무트"],
  },
  {
    key: "farro",
    defaultLabel: "Farro",
    aliases: ["파로"],
  },
  {
    key: "einkorn",
    defaultLabel: "Einkorn",
    aliases: ["아인콘"],
  },
  {
    key: "semolina",
    defaultLabel: "Semolina",
    aliases: ["세몰리나"],
  },
  {
    key: "couscous",
    defaultLabel: "Couscous",
    aliases: ["쿠스쿠스"],
  },
  {
    key: "bulgur",
    defaultLabel: "Bulgur",
    aliases: ["부르굴"],
  },
  {
    key: "breadcrumbs",
    defaultLabel: "Breadcrumbs",
    aliases: ["빵가루"],
  },
  {
    key: "panko",
    defaultLabel: "Panko",
    aliases: ["판코"],
  },
  {
    key: "rice",
    defaultLabel: "Rice",
    aliases: ["쌀"],
  },
  {
    key: "white_rice",
    defaultLabel: "White Rice",
    aliases: ["백미"],
  },
  {
    key: "brown_rice",
    defaultLabel: "Brown Rice",
    aliases: ["현미"],
  },
  {
    key: "black_rice",
    defaultLabel: "Black Rice",
    aliases: ["흑미"],
  },
  {
    key: "wild_rice",
    defaultLabel: "Wild Rice",
    aliases: ["와일드라이스"],
  },
  {
    key: "jasmine_rice",
    defaultLabel: "Jasmine Rice",
    aliases: ["자스민라이스"],
  },
  {
    key: "basmati_rice",
    defaultLabel: "Basmati Rice",
    aliases: ["바스마티라이스"],
  },
  {
    key: "sticky_rice",
    defaultLabel: "Sticky Rice",
    aliases: ["찹쌀"],
  },
  {
    key: "rice_flour",
    defaultLabel: "Rice Flour",
    aliases: ["쌀가루"],
  },
  {
    key: "sweet_rice_flour",
    defaultLabel: "Sweet Rice Flour",
    aliases: ["찹쌀가루"],
  },
  {
    key: "cornmeal",
    defaultLabel: "Cornmeal",
    aliases: ["옥수수가루"],
  },
  {
    key: "polenta",
    defaultLabel: "Polenta",
    aliases: ["폴렌타"],
  },
  {
    key: "grits",
    defaultLabel: "Grits",
    aliases: ["그리츠"],
  },
  {
    key: "cornstarch",
    defaultLabel: "Cornstarch",
    aliases: ["옥수수전분"],
  },
  {
    key: "potato_starch",
    defaultLabel: "Potato Starch",
    aliases: ["감자전분"],
  },
  {
    key: "tapioca",
    defaultLabel: "Tapioca",
    aliases: ["타피오카"],
  },
  {
    key: "tapioca_starch",
    defaultLabel: "Tapioca Starch",
    aliases: ["타피오카전분"],
  },
  {
    key: "buckwheat",
    defaultLabel: "Buckwheat",
    aliases: ["메밀"],
  },
  {
    key: "kasha",
    defaultLabel: "Kasha",
    aliases: ["카샤"],
  },
  {
    key: "quinoa",
    defaultLabel: "Quinoa",
    aliases: ["퀴노아"],
  },
  {
    key: "white_quinoa",
    defaultLabel: "White Quinoa",
    aliases: ["흰퀴노아"],
  },
  {
    key: "red_quinoa",
    defaultLabel: "Red Quinoa",
    aliases: ["붉은퀴노아"],
  },
  {
    key: "millet",
    defaultLabel: "Millet",
    aliases: ["기장"],
  },
  {
    key: "sorghum",
    defaultLabel: "Sorghum",
    aliases: ["수수"],
  },
  {
    key: "amaranth",
    defaultLabel: "Amaranth",
    aliases: ["아마란스"],
  },
  {
    key: "teff",
    defaultLabel: "Teff",
    aliases: ["테프"],
  },
  {
    key: "arrowroot",
    defaultLabel: "Arrowroot",
    aliases: ["애로우루트"],
  },
  {
    key: "cassava_flour",
    defaultLabel: "Cassava Flour",
    aliases: ["카사바가루"],
  },
  {
    key: "coconut_flour",
    defaultLabel: "Coconut Flour",
    aliases: ["코코넛가루"],
  },
  {
    key: "pasta",
    defaultLabel: "Pasta",
    aliases: ["파스타"],
  },
  {
    key: "spaghetti",
    defaultLabel: "Spaghetti",
    aliases: ["스파게티"],
  },
  {
    key: "macaroni",
    defaultLabel: "Macaroni",
    aliases: ["마카로니"],
  },
  {
    key: "penne",
    defaultLabel: "Penne",
    aliases: ["펜네"],
  },
  {
    key: "fusilli",
    defaultLabel: "Fusilli",
    aliases: ["푸실리"],
  },
  {
    key: "egg_noodle",
    defaultLabel: "Egg Noodle",
    aliases: ["에그누들"],
  },
  {
    key: "noodles",
    defaultLabel: "Noodles",
    aliases: ["면"],
  },
  {
    key: "wheat_noodles",
    defaultLabel: "Wheat Noodles",
    aliases: ["밀면"],
  },
  {
    key: "ramen",
    defaultLabel: "Ramen",
    aliases: ["라면"],
  },
  {
    key: "udon",
    defaultLabel: "Udon",
    aliases: ["우동"],
  },
  {
    key: "somen",
    defaultLabel: "Somen",
    aliases: ["소면"],
  },
  {
    key: "soba",
    defaultLabel: "Soba",
    aliases: ["소바"],
  },
  {
    key: "buckwheat_noodles",
    defaultLabel: "Buckwheat Noodles",
    aliases: ["메밀면"],
  },
  {
    key: "rice_noodles",
    defaultLabel: "Rice Noodles",
    aliases: ["쌀국수"],
  },
  {
    key: "pad_thai_noodles",
    defaultLabel: "Pad Thai Noodles",
    aliases: ["팟타이면"],
  },
  {
    key: "vermicelli",
    defaultLabel: "Vermicelli",
    aliases: ["버미셀리"],
  },
  {
    key: "glass_noodles",
    defaultLabel: "Glass Noodles",
    aliases: ["당면"],
  },
  {
    key: "cellophane_noodles",
    defaultLabel: "Cellophane Noodles",
    aliases: ["당면"],
  },
  {
    key: "mung_bean_noodles",
    defaultLabel: "Mung Bean Noodles",
    aliases: ["녹두면"],
  },
  {
    key: "gnocchi",
    defaultLabel: "Gnocchi",
    aliases: ["뇨끼"],
  },
  {
    key: "dumpling_wrapper",
    defaultLabel: "Dumpling Wrapper",
    aliases: ["만두피"],
  },
  {
    key: "wonton_wrapper",
    defaultLabel: "Wonton Wrapper",
    aliases: ["완탕피"],
  },
  {
    key: "bread",
    defaultLabel: "Bread",
    aliases: ["빵"],
  },
  {
    key: "white_bread",
    defaultLabel: "White Bread",
    aliases: ["흰빵"],
  },
  {
    key: "whole_wheat_bread",
    defaultLabel: "Whole Wheat Bread",
    aliases: ["통밀빵"],
  },
  {
    key: "sourdough",
    defaultLabel: "Sourdough",
    aliases: ["사워도우"],
  },
  {
    key: "rye_bread",
    defaultLabel: "Rye Bread",
    aliases: ["호밀빵"],
  },
  {
    key: "multigrain_bread",
    defaultLabel: "Multigrain Bread",
    aliases: ["잡곡빵"],
  },
  {
    key: "bagel",
    defaultLabel: "Bagel",
    aliases: ["베이글"],
  },
  {
    key: "baguette",
    defaultLabel: "Baguette",
    aliases: ["바게트"],
  },
  {
    key: "ciabatta",
    defaultLabel: "Ciabatta",
    aliases: ["치아바타"],
  },
  {
    key: "focaccia",
    defaultLabel: "Focaccia",
    aliases: ["포카치아"],
  },
  {
    key: "pita",
    defaultLabel: "Pita",
    aliases: ["피타"],
  },
  {
    key: "naan",
    defaultLabel: "Naan",
    aliases: ["난"],
  },
  {
    key: "tortilla",
    defaultLabel: "Tortilla",
    aliases: ["토르티야"],
  },
  {
    key: "croissant",
    defaultLabel: "Croissant",
    aliases: ["크루아상"],
  },
  {
    key: "brioche",
    defaultLabel: "Brioche",
    aliases: ["브리오슈"],
  },
  {
    key: "muffin",
    defaultLabel: "Muffin",
    aliases: ["머핀"],
  },
  {
    key: "cake",
    defaultLabel: "Cake",
    aliases: ["케이크"],
  },
  {
    key: "cookie",
    defaultLabel: "Cookie",
    aliases: ["쿠키"],
  },
  {
    key: "biscuit",
    defaultLabel: "Biscuit",
    aliases: ["비스킷"],
  },
  {
    key: "pastry",
    defaultLabel: "Pastry",
    aliases: ["페이스트리"],
  },
  {
    key: "pie_crust",
    defaultLabel: "Pie Crust",
    aliases: ["파이도우"],
  },
  {
    key: "pizza_crust",
    defaultLabel: "Pizza Crust",
    aliases: ["피자도우"],
  },
  {
    key: "soy",
    defaultLabel: "Soy",
    aliases: ["대두"],
  },
  {
    key: "soybean",
    defaultLabel: "Soybean",
    aliases: ["대두"],
  },
  {
    key: "tofu",
    defaultLabel: "Tofu",
    aliases: ["두부"],
  },
  {
    key: "silken_tofu",
    defaultLabel: "Silken Tofu",
    aliases: ["순두부"],
  },
  {
    key: "firm_tofu",
    defaultLabel: "Firm Tofu",
    aliases: ["단단한두부"],
  },
  {
    key: "fried_tofu",
    defaultLabel: "Fried Tofu",
    aliases: ["유부"],
  },
  {
    key: "soy_yogurt",
    defaultLabel: "Soy Yogurt",
    aliases: ["콩요거트"],
  },
  {
    key: "soy_sauce",
    defaultLabel: "Soy Sauce",
    aliases: ["간장"],
  },
  {
    key: "tamari",
    defaultLabel: "Tamari",
    aliases: ["타마리"],
  },
  {
    key: "shoyu",
    defaultLabel: "Shoyu",
    aliases: ["쇼유"],
  },
  {
    key: "miso",
    defaultLabel: "Miso",
    aliases: ["미소"],
  },
  {
    key: "white_miso",
    defaultLabel: "White Miso",
    aliases: ["백미소"],
  },
  {
    key: "red_miso",
    defaultLabel: "Red Miso",
    aliases: ["적미소"],
  },
  {
    key: "doenjang",
    defaultLabel: "Doenjang",
    aliases: ["된장"],
  },
  {
    key: "gochujang",
    defaultLabel: "Gochujang",
    aliases: ["고추장"],
  },
  {
    key: "tempeh",
    defaultLabel: "Tempeh",
    aliases: ["템페"],
  },
  {
    key: "natto",
    defaultLabel: "Natto",
    aliases: ["낫또"],
  },
  {
    key: "soy_protein",
    defaultLabel: "Soy Protein",
    aliases: ["대두단백"],
  },
  {
    key: "soy_protein_isolate",
    defaultLabel: "Soy Protein Isolate",
    aliases: ["분리대두단백"],
  },
  {
    key: "tvp",
    defaultLabel: "TVP",
    aliases: ["콩고기"],
  },
  {
    key: "soy_lecithin",
    defaultLabel: "Soy Lecithin",
    aliases: ["대두레시틴"],
  },
  {
    key: "yuba",
    defaultLabel: "Yuba",
    aliases: ["유바"],
  },
  {
    key: "bean",
    defaultLabel: "Bean",
    aliases: ["콩류"],
  },
  {
    key: "legume",
    defaultLabel: "Legume",
    aliases: ["콩과"],
  },
  {
    key: "lentil",
    defaultLabel: "Lentil",
    aliases: ["렌틸콩"],
  },
  {
    key: "brown_lentil",
    defaultLabel: "Brown Lentil",
    aliases: ["갈색렌틸"],
  },
  {
    key: "red_lentil",
    defaultLabel: "Red Lentil",
    aliases: ["붉은렌틸"],
  },
  {
    key: "green_lentil",
    defaultLabel: "Green Lentil",
    aliases: ["녹색렌틸"],
  },
  {
    key: "chickpea",
    defaultLabel: "Chickpea",
    aliases: ["병아리콩"],
  },
  {
    key: "garbanzo_bean",
    defaultLabel: "Garbanzo Bean",
    aliases: ["병아리콩"],
  },
  {
    key: "hummus",
    defaultLabel: "Hummus",
    aliases: ["후무스"],
  },
  {
    key: "black_bean",
    defaultLabel: "Black Bean",
    aliases: ["검은콩"],
  },
  {
    key: "kidney_bean",
    defaultLabel: "Kidney Bean",
    aliases: ["강낭콩"],
  },
  {
    key: "red_kidney_bean",
    defaultLabel: "Red Kidney Bean",
    aliases: ["붉은강낭콩"],
  },
  {
    key: "pinto_bean",
    defaultLabel: "Pinto Bean",
    aliases: ["핀토콩"],
  },
  {
    key: "navy_bean",
    defaultLabel: "Navy Bean",
    aliases: ["네이비빈"],
  },
  {
    key: "cannellini_bean",
    defaultLabel: "Cannellini Bean",
    aliases: ["카넬리니빈"],
  },
  {
    key: "lima_bean",
    defaultLabel: "Lima Bean",
    aliases: ["리마콩"],
  },
  {
    key: "butter_bean",
    defaultLabel: "Butter Bean",
    aliases: ["버터빈"],
  },
  {
    key: "adzuki_bean",
    defaultLabel: "Adzuki Bean",
    aliases: ["팥"],
  },
  {
    key: "red_bean_paste",
    defaultLabel: "Red Bean Paste",
    aliases: ["팥앙금"],
  },
  {
    key: "mung_bean",
    defaultLabel: "Mung Bean",
    aliases: ["녹두"],
  },
  {
    key: "black_eyed_pea",
    defaultLabel: "Black-eyed Pea",
    aliases: ["동부콩"],
  },
  {
    key: "fava_bean",
    defaultLabel: "Fava Bean",
    aliases: ["잠두"],
  },
  {
    key: "broad_bean",
    defaultLabel: "Broad Bean",
    aliases: ["잠두"],
  },
  {
    key: "lupin",
    defaultLabel: "Lupin",
    aliases: ["루핀"],
  },
  {
    key: "cilantro",
    defaultLabel: "Cilantro",
    aliases: ["고수"],
  },
  {
    key: "coriander_leaf",
    defaultLabel: "Coriander Leaf",
    aliases: ["고수잎"],
  },
  {
    key: "parsley",
    defaultLabel: "Parsley",
    aliases: ["파슬리"],
  },
  {
    key: "flat_leaf_parsley",
    defaultLabel: "Flat Leaf Parsley",
    aliases: ["이태리파슬리"],
  },
  {
    key: "basil",
    defaultLabel: "Basil",
    aliases: ["바질"],
  },
  {
    key: "sweet_basil",
    defaultLabel: "Sweet Basil",
    aliases: ["스위트바질"],
  },
  {
    key: "thai_basil",
    defaultLabel: "Thai Basil",
    aliases: ["타이바질"],
  },
  {
    key: "mint",
    defaultLabel: "Mint",
    aliases: ["민트"],
  },
  {
    key: "peppermint",
    defaultLabel: "Peppermint",
    aliases: ["페퍼민트"],
  },
  {
    key: "spearmint",
    defaultLabel: "Spearmint",
    aliases: ["스피어민트"],
  },
  {
    key: "dill",
    defaultLabel: "Dill",
    aliases: ["딜"],
  },
  {
    key: "rosemary",
    defaultLabel: "Rosemary",
    aliases: ["로즈마리"],
  },
  {
    key: "thyme",
    defaultLabel: "Thyme",
    aliases: ["타임"],
  },
  {
    key: "oregano",
    defaultLabel: "Oregano",
    aliases: ["오레가노"],
  },
  {
    key: "sage",
    defaultLabel: "Sage",
    aliases: ["세이지"],
  },
  {
    key: "tarragon",
    defaultLabel: "Tarragon",
    aliases: ["타라곤"],
  },
  {
    key: "marjoram",
    defaultLabel: "Marjoram",
    aliases: ["마조람"],
  },
  {
    key: "chervil",
    defaultLabel: "Chervil",
    aliases: ["처빌"],
  },
  {
    key: "savory",
    defaultLabel: "Savory",
    aliases: ["세이보리","감칠맛"],
  },
  {
    key: "lemongrass",
    defaultLabel: "Lemongrass",
    aliases: ["레몬그라스"],
  },
  {
    key: "kaffir_lime_leaf",
    defaultLabel: "Kaffir Lime Leaf",
    aliases: ["카피르라임잎"],
  },
  {
    key: "curry_leaf",
    defaultLabel: "Curry Leaf",
    aliases: ["커리잎"],
  },
  {
    key: "bay_leaf",
    defaultLabel: "Bay Leaf",
    aliases: ["월계수잎"],
  },
  {
    key: "shiso",
    defaultLabel: "Shiso",
    aliases: ["시소"],
  },
  {
    key: "perilla_leaf",
    defaultLabel: "Perilla Leaf",
    aliases: ["깻잎"],
  },
  {
    key: "black_pepper",
    defaultLabel: "Black Pepper",
    aliases: ["흑후추"],
  },
  {
    key: "white_pepper",
    defaultLabel: "White Pepper",
    aliases: ["백후추"],
  },
  {
    key: "peppercorn",
    defaultLabel: "Peppercorn",
    aliases: ["통후추"],
  },
  {
    key: "red_pepper_flakes",
    defaultLabel: "Red Pepper Flakes",
    aliases: ["고춧가루"],
  },
  {
    key: "crushed_red_pepper",
    defaultLabel: "Crushed Red Pepper",
    aliases: ["굵은고춧가루"],
  },
  {
    key: "cayenne",
    defaultLabel: "Cayenne",
    aliases: ["카이엔"],
  },
  {
    key: "paprika",
    defaultLabel: "Paprika",
    aliases: ["파프리카"],
  },
  {
    key: "smoked_paprika",
    defaultLabel: "Smoked Paprika",
    aliases: ["훈제파프리카"],
  },
  {
    key: "chili_powder",
    defaultLabel: "Chili Powder",
    aliases: ["칠리가루"],
  },
  {
    key: "gochugaru",
    defaultLabel: "Gochugaru",
    aliases: ["고춧가루"],
  },
  {
    key: "cinnamon",
    defaultLabel: "Cinnamon",
    aliases: ["계피"],
  },
  {
    key: "cassia",
    defaultLabel: "Cassia",
    aliases: ["계피"],
  },
  {
    key: "nutmeg",
    defaultLabel: "Nutmeg",
    aliases: ["육두구"],
  },
  {
    key: "clove",
    defaultLabel: "Clove",
    aliases: ["정향"],
  },
  {
    key: "allspice",
    defaultLabel: "Allspice",
    aliases: ["올스파이스"],
  },
  {
    key: "star_anise",
    defaultLabel: "Star Anise",
    aliases: ["팔각"],
  },
  {
    key: "cardamom",
    defaultLabel: "Cardamom",
    aliases: ["카다멈"],
  },
  {
    key: "green_cardamom",
    defaultLabel: "Green Cardamom",
    aliases: ["그린카다멈"],
  },
  {
    key: "black_cardamom",
    defaultLabel: "Black Cardamom",
    aliases: ["블랙카다멈"],
  },
  {
    key: "cumin",
    defaultLabel: "Cumin",
    aliases: ["큐민"],
  },
  {
    key: "coriander_seed",
    defaultLabel: "Coriander Seed",
    aliases: ["고수씨"],
  },
  {
    key: "turmeric",
    defaultLabel: "Turmeric",
    aliases: ["강황"],
  },
  {
    key: "saffron",
    defaultLabel: "Saffron",
    aliases: ["사프란"],
  },
  {
    key: "ginger_powder",
    defaultLabel: "Ginger Powder",
    aliases: ["생강가루"],
  },
  {
    key: "garlic_powder",
    defaultLabel: "Garlic Powder",
    aliases: ["마늘가루"],
  },
  {
    key: "onion_powder",
    defaultLabel: "Onion Powder",
    aliases: ["양파가루"],
  },
  {
    key: "mustard_powder",
    defaultLabel: "Mustard Powder",
    aliases: ["겨자가루"],
  },
  {
    key: "fenugreek",
    defaultLabel: "Fenugreek",
    aliases: ["페뉴그릭"],
  },
  {
    key: "asafoetida",
    defaultLabel: "Asafoetida",
    aliases: ["아사포에티다"],
  },
  {
    key: "sumac",
    defaultLabel: "Sumac",
    aliases: ["수맥"],
  },
  {
    key: "zaatar",
    defaultLabel: "Za'atar",
    aliases: ["자타르"],
  },
  {
    key: "curry_powder",
    defaultLabel: "Curry Powder",
    aliases: ["카레가루"],
  },
  {
    key: "garam_masala",
    defaultLabel: "Garam Masala",
    aliases: ["가람마살라"],
  },
  {
    key: "five_spice_powder",
    defaultLabel: "Five-Spice Powder",
    aliases: ["오향분"],
  },
  {
    key: "vanilla",
    defaultLabel: "Vanilla",
    aliases: ["바닐라"],
  },
  {
    key: "vanilla_extract",
    defaultLabel: "Vanilla Extract",
    aliases: ["바닐라추출물"],
  },
  {
    key: "vanilla_bean",
    defaultLabel: "Vanilla Bean",
    aliases: ["바닐라빈"],
  },
  {
    key: "almond_extract",
    defaultLabel: "Almond Extract",
    aliases: ["아몬드추출물"],
  },
  {
    key: "msg",
    defaultLabel: "MSG",
    aliases: ["MSG"],
  },
  {
    key: "monosodium_glutamate",
    defaultLabel: "Monosodium Glutamate",
    aliases: ["MSG"],
  },
  {
    key: "yeast_extract",
    defaultLabel: "Yeast Extract",
    aliases: ["효모추출물"],
  },
  {
    key: "nutritional_yeast",
    defaultLabel: "Nutritional Yeast",
    aliases: ["영양효모"],
  },
  {
    key: "liquid_smoke",
    defaultLabel: "Liquid Smoke",
    aliases: ["훈연액"],
  },
  {
    key: "salt",
    defaultLabel: "Salt",
    aliases: ["소금"],
  },
  {
    key: "sea_salt",
    defaultLabel: "Sea Salt",
    aliases: ["천일염"],
  },
  {
    key: "kosher_salt",
    defaultLabel: "Kosher Salt",
    aliases: ["코셔소금"],
  },
  {
    key: "himalayan_pink_salt",
    defaultLabel: "Himalayan Pink Salt",
    aliases: ["핑크솔트"],
  },
  {
    key: "vinegar",
    defaultLabel: "Vinegar",
    aliases: ["식초"],
  },
  {
    key: "white_vinegar",
    defaultLabel: "White Vinegar",
    aliases: ["백식초"],
  },
  {
    key: "apple_cider_vinegar",
    defaultLabel: "Apple Cider Vinegar",
    aliases: ["사과식초"],
  },
  {
    key: "rice_vinegar",
    defaultLabel: "Rice Vinegar",
    aliases: ["쌀식초"],
  },
  {
    key: "balsamic_vinegar",
    defaultLabel: "Balsamic Vinegar",
    aliases: ["발사믹식초"],
  },
  {
    key: "balsamic_glaze",
    defaultLabel: "Balsamic Glaze",
    aliases: ["발사믹글레이즈"],
  },
  {
    key: "red_wine_vinegar",
    defaultLabel: "Red Wine Vinegar",
    aliases: ["레드와인식초"],
  },
  {
    key: "sherry_vinegar",
    defaultLabel: "Sherry Vinegar",
    aliases: ["셰리식초"],
  },
  {
    key: "lemon_juice",
    defaultLabel: "Lemon Juice",
    aliases: ["레몬즙"],
  },
  {
    key: "lime_juice",
    defaultLabel: "Lime Juice",
    aliases: ["라임즙"],
  },
  {
    key: "low_sodium_soy_sauce",
    defaultLabel: "Low Sodium Soy Sauce",
    aliases: ["저염간장"],
  },
  {
    key: "coconut_aminos",
    defaultLabel: "Coconut Aminos",
    aliases: ["코코넛아미노"],
  },
  {
    key: "fish_sauce",
    defaultLabel: "Fish Sauce",
    aliases: ["액젓"],
  },
  {
    key: "anchovy_sauce",
    defaultLabel: "Anchovy Sauce",
    aliases: ["멸치액젓"],
  },
  {
    key: "sand_lance_sauce",
    defaultLabel: "Sand Lance Sauce",
    aliases: ["까나리액젓"],
  },
  {
    key: "oyster_sauce",
    defaultLabel: "Oyster Sauce",
    aliases: ["굴소스"],
  },
  {
    key: "vegetarian_oyster_sauce",
    defaultLabel: "Vegetarian Oyster Sauce",
    aliases: ["버섯굴소스"],
  },
  {
    key: "hoisin_sauce",
    defaultLabel: "Hoisin Sauce",
    aliases: ["해선장"],
  },
  {
    key: "teriyaki_sauce",
    defaultLabel: "Teriyaki Sauce",
    aliases: ["데리야끼소스"],
  },
  {
    key: "ponzu",
    defaultLabel: "Ponzu",
    aliases: ["폰즈"],
  },
  {
    key: "black_bean_sauce",
    defaultLabel: "Black Bean Sauce",
    aliases: ["춘장"],
  },
  {
    key: "doubanjiang",
    defaultLabel: "Doubanjiang",
    aliases: ["두반장"],
  },
  {
    key: "chili_bean_paste",
    defaultLabel: "Chili Bean Paste",
    aliases: ["칠리빈페이스트"],
  },
  {
    key: "ssamjang",
    defaultLabel: "Ssamjang",
    aliases: ["쌈장"],
  },
  {
    key: "chogochujang",
    defaultLabel: "Chogochujang",
    aliases: ["초고추장"],
  },
  {
    key: "peanut_sauce",
    defaultLabel: "Peanut Sauce",
    aliases: ["땅콩소스"],
  },
  {
    key: "chili_sauce",
    defaultLabel: "Chili Sauce",
    aliases: ["칠리소스"],
  },
  {
    key: "hot_sauce",
    defaultLabel: "Hot Sauce",
    aliases: ["핫소스"],
  },
  {
    key: "tabasco",
    defaultLabel: "Tabasco",
    aliases: ["타바스코"],
  },
  {
    key: "sriracha",
    defaultLabel: "Sriracha",
    aliases: ["스리라차"],
  },
  {
    key: "sambal_oelek",
    defaultLabel: "Sambal Oelek",
    aliases: ["삼발올렉"],
  },
  {
    key: "chili_oil",
    defaultLabel: "Chili Oil",
    aliases: ["고추기름"],
  },
  {
    key: "wasabi",
    defaultLabel: "Wasabi",
    aliases: ["와사비"],
  },
  {
    key: "horseradish",
    defaultLabel: "Horseradish",
    aliases: ["홀스래디시"],
  },
  {
    key: "mayonnaise",
    defaultLabel: "Mayonnaise",
    aliases: ["마요네즈"],
  },
  {
    key: "vegan_mayo",
    defaultLabel: "Vegan Mayo",
    aliases: ["비건마요"],
  },
  {
    key: "aioli",
    defaultLabel: "Aioli",
    aliases: ["아이올리"],
  },
  {
    key: "mustard",
    defaultLabel: "Mustard",
    aliases: ["머스터드"],
  },
  {
    key: "dijon_mustard",
    defaultLabel: "Dijon Mustard",
    aliases: ["디종머스터드"],
  },
  {
    key: "whole_grain_mustard",
    defaultLabel: "Whole Grain Mustard",
    aliases: ["홀그레인머스터드"],
  },
  {
    key: "honey_mustard",
    defaultLabel: "Honey Mustard",
    aliases: ["허니머스터드"],
  },
  {
    key: "ketchup",
    defaultLabel: "Ketchup",
    aliases: ["케첩"],
  },
  {
    key: "tomato_paste",
    defaultLabel: "Tomato Paste",
    aliases: ["토마토페이스트"],
  },
  {
    key: "tomato_puree",
    defaultLabel: "Tomato Puree",
    aliases: ["토마토퓨레"],
  },
  {
    key: "bbq_sauce",
    defaultLabel: "BBQ Sauce",
    aliases: ["바베큐소스"],
  },
  {
    key: "steak_sauce",
    defaultLabel: "Steak Sauce",
    aliases: ["스테이크소스"],
  },
  {
    key: "worcestershire_sauce",
    defaultLabel: "Worcestershire Sauce",
    aliases: ["우스터소스"],
  },
  {
    key: "tartar_sauce",
    defaultLabel: "Tartar Sauce",
    aliases: ["타르타르소스"],
  },
  {
    key: "ranch_dressing",
    defaultLabel: "Ranch Dressing",
    aliases: ["랜치드레싱"],
  },
  {
    key: "caesar_dressing",
    defaultLabel: "Caesar Dressing",
    aliases: ["시저드레싱"],
  },
  {
    key: "vinaigrette",
    defaultLabel: "Vinaigrette",
    aliases: ["비네그레트"],
  },
  {
    key: "salad_dressing",
    defaultLabel: "Salad Dressing",
    aliases: ["샐러드드레싱"],
  },
  {
    key: "pickle",
    defaultLabel: "Pickle",
    aliases: ["피클"],
  },
  {
    key: "kimchi",
    defaultLabel: "Kimchi",
    aliases: ["김치"],
  },
  {
    key: "vegan_kimchi",
    defaultLabel: "Vegan Kimchi",
    aliases: ["비건김치"],
  },
  {
    key: "sauerkraut",
    defaultLabel: "Sauerkraut",
    aliases: ["사우어크라우트"],
  },
  {
    key: "olives",
    defaultLabel: "Olives",
    aliases: ["올리브절임"],
  },
  {
    key: "capers",
    defaultLabel: "Capers",
    aliases: ["케이퍼절임"],
  },
  {
    key: "relish",
    defaultLabel: "Relish",
    aliases: ["렐리시"],
  },
  {
    key: "zha_cai",
    defaultLabel: "Zha Cai",
    aliases: ["짜사이"],
  },
  {
    key: "sugar",
    defaultLabel: "Sugar",
    aliases: ["설탕"],
  },
  {
    key: "white_sugar",
    defaultLabel: "White Sugar",
    aliases: ["백설탕"],
  },
  {
    key: "brown_sugar",
    defaultLabel: "Brown Sugar",
    aliases: ["흑설탕"],
  },
  {
    key: "cane_sugar",
    defaultLabel: "Cane Sugar",
    aliases: ["사탕수수당"],
  },
  {
    key: "powdered_sugar",
    defaultLabel: "Powdered Sugar",
    aliases: ["분당"],
  },
  {
    key: "honey",
    defaultLabel: "Honey",
    aliases: ["꿀"],
  },
  {
    key: "raw_honey",
    defaultLabel: "Raw Honey",
    aliases: ["생꿀"],
  },
  {
    key: "manuka_honey",
    defaultLabel: "Manuka Honey",
    aliases: ["마누카꿀"],
  },
  {
    key: "maple_syrup",
    defaultLabel: "Maple Syrup",
    aliases: ["메이플시럽"],
  },
  {
    key: "molasses",
    defaultLabel: "Molasses",
    aliases: ["당밀"],
  },
  {
    key: "blackstrap_molasses",
    defaultLabel: "Blackstrap Molasses",
    aliases: ["블랙스트랩당밀"],
  },
  {
    key: "agave_nectar",
    defaultLabel: "Agave Nectar",
    aliases: ["아가베시럽"],
  },
  {
    key: "agave_syrup",
    defaultLabel: "Agave Syrup",
    aliases: ["아가베시럽"],
  },
  {
    key: "coconut_sugar",
    defaultLabel: "Coconut Sugar",
    aliases: ["코코넛슈가"],
  },
  {
    key: "palm_sugar",
    defaultLabel: "Palm Sugar",
    aliases: ["팜슈가"],
  },
  {
    key: "rice_syrup",
    defaultLabel: "Rice Syrup",
    aliases: ["조청"],
  },
  {
    key: "corn_syrup",
    defaultLabel: "Corn Syrup",
    aliases: ["물엿"],
  },
  {
    key: "high_fructose_corn_syrup",
    defaultLabel: "High Fructose Corn Syrup",
    aliases: ["액상과당"],
  },
  {
    key: "glucose_syrup",
    defaultLabel: "Glucose Syrup",
    aliases: ["포도당시럽"],
  },
  {
    key: "malt_syrup",
    defaultLabel: "Malt Syrup",
    aliases: ["맥아시럽"],
  },
  {
    key: "artificial_sweetener",
    defaultLabel: "Artificial Sweetener",
    aliases: ["인공감미료"],
  },
  {
    key: "aspartame",
    defaultLabel: "Aspartame",
    aliases: ["아스파탐"],
  },
  {
    key: "sucralose",
    defaultLabel: "Sucralose",
    aliases: ["수크랄로스"],
  },
  {
    key: "saccharin",
    defaultLabel: "Saccharin",
    aliases: ["사카린"],
  },
  {
    key: "stevia",
    defaultLabel: "Stevia",
    aliases: ["스테비아"],
  },
  {
    key: "monk_fruit",
    defaultLabel: "Monk Fruit",
    aliases: ["나한과"],
  },
  {
    key: "erythritol",
    defaultLabel: "Erythritol",
    aliases: ["에리스리톨"],
  },
  {
    key: "xylitol",
    defaultLabel: "Xylitol",
    aliases: ["자일리톨"],
  },
  {
    key: "sorbitol",
    defaultLabel: "Sorbitol",
    aliases: ["소르비톨"],
  },
  {
    key: "maltitol",
    defaultLabel: "Maltitol",
    aliases: ["말티톨"],
  },
  {
    key: "sugar_alcohol",
    defaultLabel: "Sugar Alcohol",
    aliases: ["당알코올"],
  },
  {
    key: "food_additive",
    defaultLabel: "Food Additive",
    aliases: ["식품첨가물"],
  },
  {
    key: "food_coloring",
    defaultLabel: "Food Coloring",
    aliases: ["식용색소"],
  },
  {
    key: "artificial_color",
    defaultLabel: "Artificial Color",
    aliases: ["인공색소"],
  },
  {
    key: "natural_color",
    defaultLabel: "Natural Color",
    aliases: ["천연색소"],
  },
  {
    key: "preservative",
    defaultLabel: "Preservative",
    aliases: ["방부제"],
  },
  {
    key: "sodium_benzoate",
    defaultLabel: "Sodium Benzoate",
    aliases: ["안식향산나트륨"],
  },
  {
    key: "potassium_sorbate",
    defaultLabel: "Potassium Sorbate",
    aliases: ["소르빈산칼륨"],
  },
  {
    key: "nitrates",
    defaultLabel: "Nitrates",
    aliases: ["질산염"],
  },
  {
    key: "nitrites",
    defaultLabel: "Nitrites",
    aliases: ["아질산염"],
  },
  {
    key: "sulfites",
    defaultLabel: "Sulfites",
    aliases: ["아황산염"],
  },
  {
    key: "sulphur_dioxide",
    defaultLabel: "Sulphur Dioxide",
    aliases: ["이산화황"],
  },
  {
    key: "citric_acid",
    defaultLabel: "Citric Acid",
    aliases: ["구연산"],
  },
  {
    key: "ascorbic_acid",
    defaultLabel: "Ascorbic Acid",
    aliases: ["비타민C"],
  },
  {
    key: "lecithin",
    defaultLabel: "Lecithin",
    aliases: ["레시틴"],
  },
  {
    key: "gelatin",
    defaultLabel: "Gelatin",
    aliases: ["젤라틴"],
  },
  {
    key: "pectin",
    defaultLabel: "Pectin",
    aliases: ["펙틴"],
  },
  {
    key: "agar",
    defaultLabel: "Agar",
    aliases: ["한천"],
  },
  {
    key: "carrageenan",
    defaultLabel: "Carrageenan",
    aliases: ["카라기난"],
  },
  {
    key: "xanthan_gum",
    defaultLabel: "Xanthan Gum",
    aliases: ["잔탄검"],
  },
  {
    key: "guar_gum",
    defaultLabel: "Guar Gum",
    aliases: ["구아검"],
  },
  {
    key: "locust_bean_gum",
    defaultLabel: "Locust Bean Gum",
    aliases: ["로커스트콩검"],
  },
  {
    key: "modified_starch",
    defaultLabel: "Modified Starch",
    aliases: ["변성전분"],
  },
  {
    key: "baking_powder",
    defaultLabel: "Baking Powder",
    aliases: ["베이킹파우더"],
  },
  {
    key: "baking_soda",
    defaultLabel: "Baking Soda",
    aliases: ["베이킹소다"],
  },
  {
    key: "caffeine",
    defaultLabel: "Caffeine",
    aliases: ["카페인"],
  },
  {
    key: "decaf",
    defaultLabel: "Decaf",
    aliases: ["디카페인"],
  },
  {
    key: "coffee",
    defaultLabel: "Coffee",
    aliases: ["커피"],
  },
  {
    key: "espresso",
    defaultLabel: "Espresso",
    aliases: ["에스프레소"],
  },
  {
    key: "cold_brew",
    defaultLabel: "Cold Brew",
    aliases: ["콜드브루"],
  },
  {
    key: "tea",
    defaultLabel: "Tea",
    aliases: ["차"],
  },
  {
    key: "black_tea",
    defaultLabel: "Black Tea",
    aliases: ["홍차"],
  },
  {
    key: "earl_grey",
    defaultLabel: "Earl Grey",
    aliases: ["얼그레이"],
  },
  {
    key: "green_tea",
    defaultLabel: "Green Tea",
    aliases: ["녹차"],
  },
  {
    key: "matcha",
    defaultLabel: "Matcha",
    aliases: ["말차"],
  },
  {
    key: "white_tea",
    defaultLabel: "White Tea",
    aliases: ["백차"],
  },
  {
    key: "oolong_tea",
    defaultLabel: "Oolong Tea",
    aliases: ["우롱차"],
  },
  {
    key: "herbal_tea",
    defaultLabel: "Herbal Tea",
    aliases: ["허브차"],
  },
  {
    key: "chamomile",
    defaultLabel: "Chamomile",
    aliases: ["카모마일"],
  },
  {
    key: "peppermint_tea",
    defaultLabel: "Peppermint Tea",
    aliases: ["페퍼민트티"],
  },
  {
    key: "rooibos",
    defaultLabel: "Rooibos",
    aliases: ["루이보스"],
  },
  {
    key: "chai",
    defaultLabel: "Chai",
    aliases: ["차이"],
  },
  {
    key: "bubble_tea",
    defaultLabel: "Bubble Tea",
    aliases: ["버블티"],
  },
  {
    key: "chocolate",
    defaultLabel: "Chocolate",
    aliases: ["초콜릿"],
  },
  {
    key: "milk_chocolate",
    defaultLabel: "Milk Chocolate",
    aliases: ["밀크초콜릿"],
  },
  {
    key: "dark_chocolate",
    defaultLabel: "Dark Chocolate",
    aliases: ["다크초콜릿"],
  },
  {
    key: "white_chocolate",
    defaultLabel: "White Chocolate",
    aliases: ["화이트초콜릿"],
  },
  {
    key: "cocoa",
    defaultLabel: "Cocoa",
    aliases: ["코코아"],
  },
  {
    key: "cocoa_powder",
    defaultLabel: "Cocoa Powder",
    aliases: ["코코아가루"],
  },
  {
    key: "cacao_nibs",
    defaultLabel: "Cacao Nibs",
    aliases: ["카카오닙스"],
  },
  {
    key: "cocoa_butter",
    defaultLabel: "Cocoa Butter",
    aliases: ["코코아버터"],
  },
  {
    key: "juice",
    defaultLabel: "Juice",
    aliases: ["주스"],
  },
  {
    key: "orange_juice",
    defaultLabel: "Orange Juice",
    aliases: ["오렌지주스"],
  },
  {
    key: "apple_juice",
    defaultLabel: "Apple Juice",
    aliases: ["사과주스"],
  },
  {
    key: "soda",
    defaultLabel: "Soda",
    aliases: ["탄산음료"],
  },
  {
    key: "cola",
    defaultLabel: "Cola",
    aliases: ["콜라"],
  },
  {
    key: "water",
    defaultLabel: "Water",
    aliases: ["물"],
  },
  {
    key: "sparkling_water",
    defaultLabel: "Sparkling Water",
    aliases: ["탄산수"],
  },
  {
    key: "mineral_water",
    defaultLabel: "Mineral Water",
    aliases: ["미네랄워터"],
  },
  {
    key: "energy_drink",
    defaultLabel: "Energy Drink",
    aliases: ["에너지드링크"],
  },
  {
    key: "sports_drink",
    defaultLabel: "Sports Drink",
    aliases: ["이온음료"],
  },
  {
    key: "kombucha",
    defaultLabel: "Kombucha",
    aliases: ["콤부차"],
  },
  {
    key: "alcohol",
    defaultLabel: "Alcohol",
    aliases: ["술"],
  },
  {
    key: "beer",
    defaultLabel: "Beer",
    aliases: ["맥주"],
  },
  {
    key: "lager",
    defaultLabel: "Lager",
    aliases: ["라거"],
  },
  {
    key: "ale",
    defaultLabel: "Ale",
    aliases: ["에일"],
  },
  {
    key: "stout",
    defaultLabel: "Stout",
    aliases: ["스타우트"],
  },
  {
    key: "ipa",
    defaultLabel: "IPA",
    aliases: ["IPA"],
  },
  {
    key: "gluten_free_beer",
    defaultLabel: "Gluten-Free Beer",
    aliases: ["글루텐프리맥주"],
  },
  {
    key: "wine",
    defaultLabel: "Wine",
    aliases: ["와인"],
  },
  {
    key: "red_wine",
    defaultLabel: "Red Wine",
    aliases: ["레드와인"],
  },
  {
    key: "white_wine",
    defaultLabel: "White Wine",
    aliases: ["화이트와인"],
  },
  {
    key: "sparkling_wine",
    defaultLabel: "Sparkling Wine",
    aliases: ["스파클링와인"],
  },
  {
    key: "rose",
    defaultLabel: "Rosé",
    aliases: ["로제와인"],
  },
  {
    key: "cider",
    defaultLabel: "Cider",
    aliases: ["사과주"],
  },
  {
    key: "hard_cider",
    defaultLabel: "Hard Cider",
    aliases: ["사과주"],
  },
  {
    key: "spirits",
    defaultLabel: "Spirits",
    aliases: ["증류주"],
  },
  {
    key: "liquor",
    defaultLabel: "Liquor",
    aliases: ["리큐어"],
  },
  {
    key: "vodka",
    defaultLabel: "Vodka",
    aliases: ["보드카"],
  },
  {
    key: "gin",
    defaultLabel: "Gin",
    aliases: ["진"],
  },
  {
    key: "rum",
    defaultLabel: "Rum",
    aliases: ["럼"],
  },
  {
    key: "tequila",
    defaultLabel: "Tequila",
    aliases: ["데킬라"],
  },
  {
    key: "whiskey",
    defaultLabel: "Whiskey",
    aliases: ["위스키"],
  },
  {
    key: "bourbon",
    defaultLabel: "Bourbon",
    aliases: ["버번"],
  },
  {
    key: "scotch",
    defaultLabel: "Scotch",
    aliases: ["스카치"],
  },
  {
    key: "brandy",
    defaultLabel: "Brandy",
    aliases: ["브랜디"],
  },
  {
    key: "cognac",
    defaultLabel: "Cognac",
    aliases: ["꼬냑"],
  },
  {
    key: "sake",
    defaultLabel: "Sake",
    aliases: ["사케"],
  },
  {
    key: "soju",
    defaultLabel: "Soju",
    aliases: ["소주"],
  },
  {
    key: "makgeolli",
    defaultLabel: "Makgeolli",
    aliases: ["막걸리"],
  },
  {
    key: "cocktail",
    defaultLabel: "Cocktail",
    aliases: ["칵테일"],
  },
  {
    key: "allergen",
    defaultLabel: "Allergen",
    aliases: ["알레르겐"],
  },
  {
    key: "peanut_allergy",
    defaultLabel: "Peanut Allergy",
    aliases: ["땅콩알레르기"],
  },
  {
    key: "tree_nut_allergy",
    defaultLabel: "Tree Nut Allergy",
    aliases: ["견과알레르기"],
  },
  {
    key: "milk_allergy",
    defaultLabel: "Milk Allergy",
    aliases: ["우유알레르기"],
  },
  {
    key: "dairy_allergy",
    defaultLabel: "Dairy Allergy",
    aliases: ["유제품알레르기"],
  },
  {
    key: "egg_allergy",
    defaultLabel: "Egg Allergy",
    aliases: ["달걀알레르기"],
  },
  {
    key: "soy_allergy",
    defaultLabel: "Soy Allergy",
    aliases: ["대두알레르기"],
  },
  {
    key: "wheat_allergy",
    defaultLabel: "Wheat Allergy",
    aliases: ["밀알레르기"],
  },
  {
    key: "fish_allergy",
    defaultLabel: "Fish Allergy",
    aliases: ["생선알레르기"],
  },
  {
    key: "shellfish_allergy",
    defaultLabel: "Shellfish Allergy",
    aliases: ["해산물알레르기"],
  },
  {
    key: "crustacean_allergy",
    defaultLabel: "Crustacean Allergy",
    aliases: ["갑각류알레르기"],
  },
  {
    key: "mollusc_allergy",
    defaultLabel: "Mollusc Allergy",
    aliases: ["조개알레르기"],
  },
  {
    key: "sesame_allergy",
    defaultLabel: "Sesame Allergy",
    aliases: ["참깨알레르기"],
  },
  {
    key: "mustard_allergy",
    defaultLabel: "Mustard Allergy",
    aliases: ["겨자알레르기"],
  },
  {
    key: "sulfite_sensitivity",
    defaultLabel: "Sulfite Sensitivity",
    aliases: ["아황산염민감"],
  },
  {
    key: "lupin_allergy",
    defaultLabel: "Lupin Allergy",
    aliases: ["루핀알레르기"],
  },
  {
    key: "lactose_intolerance",
    defaultLabel: "Lactose Intolerance",
    aliases: ["유당불내증"],
  },
  {
    key: "lactose_free",
    defaultLabel: "Lactose Free",
    aliases: ["락토프리"],
  },
  {
    key: "gluten_intolerance",
    defaultLabel: "Gluten Intolerance",
    aliases: ["글루텐불내증"],
  },
  {
    key: "celiac_disease",
    defaultLabel: "Celiac Disease",
    aliases: ["셀리악병"],
  },
  {
    key: "gluten_free",
    defaultLabel: "Gluten Free",
    aliases: ["글루텐프리"],
  },
  {
    key: "certified_gluten_free",
    defaultLabel: "Certified Gluten Free",
    aliases: ["글루텐프리인증"],
  },
  {
    key: "fodmap",
    defaultLabel: "FODMAP",
    aliases: ["포드맵"],
  },
  {
    key: "low_fodmap",
    defaultLabel: "Low FODMAP",
    aliases: ["저포드맵"],
  },
  {
    key: "vegetarian",
    defaultLabel: "Vegetarian",
    aliases: ["채식"],
  },
  {
    key: "ovo_vegetarian",
    defaultLabel: "Ovo-Vegetarian",
    aliases: ["난류채식"],
  },
  {
    key: "lacto_vegetarian",
    defaultLabel: "Lacto-Vegetarian",
    aliases: ["유제품채식"],
  },
  {
    key: "lacto_ovo_vegetarian",
    defaultLabel: "Lacto-Ovo Vegetarian",
    aliases: ["난유채식"],
  },
  {
    key: "vegan",
    defaultLabel: "Vegan",
    aliases: ["비건"],
  },
  {
    key: "plant_based",
    defaultLabel: "Plant-Based",
    aliases: ["식물성"],
  },
  {
    key: "pescatarian",
    defaultLabel: "Pescatarian",
    aliases: ["페스코"],
  },
  {
    key: "flexitarian",
    defaultLabel: "Flexitarian",
    aliases: ["플렉시"],
  },
  {
    key: "halal",
    defaultLabel: "Halal",
    aliases: ["할랄"],
  },
  {
    key: "kosher",
    defaultLabel: "Kosher",
    aliases: ["코셔"],
  },
  {
    key: "pareve",
    defaultLabel: "Pareve",
    aliases: ["파레브"],
  },
  {
    key: "hindu_diet",
    defaultLabel: "Hindu Diet",
    aliases: ["힌두식단"],
  },
  {
    key: "jain_diet",
    defaultLabel: "Jain Diet",
    aliases: ["자이나식단"],
  },
  {
    key: "keto",
    defaultLabel: "Keto",
    aliases: ["키토"],
  },
  {
    key: "low_carb",
    defaultLabel: "Low Carb",
    aliases: ["저탄수"],
  },
  {
    key: "paleo",
    defaultLabel: "Paleo",
    aliases: ["팔레오"],
  },
  {
    key: "whole30",
    defaultLabel: "Whole30",
    aliases: ["홀30"],
  },
  {
    key: "diabetic_friendly",
    defaultLabel: "Diabetic Friendly",
    aliases: ["당뇨식"],
  },
  {
    key: "sugar_free",
    defaultLabel: "Sugar Free",
    aliases: ["무설탕"],
  },
  {
    key: "no_added_sugar",
    defaultLabel: "No Added Sugar",
    aliases: ["무가당"],
  },
  {
    key: "low_sodium",
    defaultLabel: "Low Sodium",
    aliases: ["저염"],
  },
  {
    key: "salt_free",
    defaultLabel: "Salt Free",
    aliases: ["무염"],
  },
  {
    key: "low_fat",
    defaultLabel: "Low Fat",
    aliases: ["저지방"],
  },
  {
    key: "fat_free",
    defaultLabel: "Fat Free",
    aliases: ["무지방"],
  },
  {
    key: "organic",
    defaultLabel: "Organic",
    aliases: ["유기농"],
  },
  {
    key: "non_gmo",
    defaultLabel: "Non-GMO",
    aliases: ["논GMO"],
  },
  {
    key: "spicy",
    defaultLabel: "Spicy",
    aliases: ["매운맛"],
  },
  {
    key: "mild",
    defaultLabel: "Mild",
    aliases: ["순한맛"],
  },
  {
    key: "medium_spicy",
    defaultLabel: "Medium Spicy",
    aliases: ["중간매운맛"],
  },
  {
    key: "very_spicy",
    defaultLabel: "Very Spicy",
    aliases: ["아주매운맛"],
  },
  {
    key: "sweet",
    defaultLabel: "Sweet",
    aliases: ["단맛"],
  },
  {
    key: "salty",
    defaultLabel: "Salty",
    aliases: ["짠맛"],
  },
  {
    key: "sour",
    defaultLabel: "Sour",
    aliases: ["신맛"],
  },
  {
    key: "tart",
    defaultLabel: "Tart",
    aliases: ["시큼한맛"],
  },
  {
    key: "bitter",
    defaultLabel: "Bitter",
    aliases: ["쓴맛"],
  },
  {
    key: "umami",
    defaultLabel: "Umami",
    aliases: ["우마미"],
  },
  {
    key: "rich",
    defaultLabel: "Rich",
    aliases: ["진한맛"],
  },
  {
    key: "light",
    defaultLabel: "Light",
    aliases: ["담백한맛"],
  },
  {
    key: "greasy",
    defaultLabel: "Greasy",
    aliases: ["기름진"],
  },
  {
    key: "oily",
    defaultLabel: "Oily",
    aliases: ["기름진"],
  },
  {
    key: "crispy",
    defaultLabel: "Crispy",
    aliases: ["바삭한"],
  },
  {
    key: "crunchy",
    defaultLabel: "Crunchy",
    aliases: ["아삭한"],
  },
  {
    key: "chewy",
    defaultLabel: "Chewy",
    aliases: ["쫄깃한"],
  },
  {
    key: "tender",
    defaultLabel: "Tender",
    aliases: ["부드러운"],
  },
  {
    key: "creamy",
    defaultLabel: "Creamy",
    aliases: ["크리미한"],
  },
  {
    key: "raw",
    defaultLabel: "Raw",
    aliases: ["날것"],
  },
  {
    key: "uncooked",
    defaultLabel: "Uncooked",
    aliases: ["생것"],
  },
  {
    key: "cooked",
    defaultLabel: "Cooked",
    aliases: ["익힌"],
  },
  {
    key: "fully_cooked",
    defaultLabel: "Fully Cooked",
    aliases: ["완전익힘"],
  },
  {
    key: "fried",
    defaultLabel: "Fried",
    aliases: ["튀긴"],
  },
  {
    key: "deep_fried",
    defaultLabel: "Deep Fried",
    aliases: ["튀김"],
  },
  {
    key: "stir_fried",
    defaultLabel: "Stir-Fried",
    aliases: ["볶음"],
  },
  {
    key: "pan_fried",
    defaultLabel: "Pan-Fried",
    aliases: ["지짐"],
  },
  {
    key: "grilled",
    defaultLabel: "Grilled",
    aliases: ["구이"],
  },
  {
    key: "bbq",
    defaultLabel: "BBQ",
    aliases: ["바베큐"],
  },
  {
    key: "roasted",
    defaultLabel: "Roasted",
    aliases: ["로스팅"],
  },
  {
    key: "baked",
    defaultLabel: "Baked",
    aliases: ["오븐구이"],
  },
  {
    key: "boiled",
    defaultLabel: "Boiled",
    aliases: ["삶음"],
  },
  {
    key: "steamed",
    defaultLabel: "Steamed",
    aliases: ["찜"],
  },
  {
    key: "poached",
    defaultLabel: "Poached",
    aliases: ["데침"],
  },
  {
    key: "stewed",
    defaultLabel: "Stewed",
    aliases: ["스튜"],
  },
  {
    key: "braised",
    defaultLabel: "Braised",
    aliases: ["조림"],
  },
  {
    key: "smoked",
    defaultLabel: "Smoked",
    aliases: ["훈제"],
  },
  {
    key: "cured",
    defaultLabel: "Cured",
    aliases: ["염장"],
  },
  {
    key: "aged",
    defaultLabel: "Aged",
    aliases: ["숙성"],
  },
  {
    key: "fermented",
    defaultLabel: "Fermented",
    aliases: ["발효"],
  },
  {
    key: "fermented_food",
    defaultLabel: "Fermented Food",
    aliases: ["발효식품"],
  },
  {
    key: "pickled",
    defaultLabel: "Pickled",
    aliases: ["절임"],
  },
  {
    key: "marinated",
    defaultLabel: "Marinated",
    aliases: ["재움"],
  },
  {
    key: "garlic_free",
    defaultLabel: "Garlic-free",
    aliases: ["마늘제외"],
  },
  {
    key: "onion_free",
    defaultLabel: "Onion-free",
    aliases: ["양파제외"],
  },
  {
    key: "cilantro_free",
    defaultLabel: "Cilantro-free",
    aliases: ["고수제외"],
  },
  {
    key: "no_cilantro",
    defaultLabel: "No Cilantro",
    aliases: ["고수없음"],
  },
  {
    key: "pork_free",
    defaultLabel: "Pork-free",
    aliases: ["돼지고기제외"],
  },
  {
    key: "no_pork",
    defaultLabel: "No Pork",
    aliases: ["돼지고기없음"],
  },
  {
    key: "beef_free",
    defaultLabel: "Beef-free",
    aliases: ["소고기제외"],
  },
  {
    key: "no_beef",
    defaultLabel: "No Beef",
    aliases: ["소고기없음"],
  },
  {
    key: "meat_free",
    defaultLabel: "Meat-free",
    aliases: ["고기제외"],
  },
  {
    key: "dairy_free",
    defaultLabel: "Dairy-free",
    aliases: ["유제품제외"],
  },
  {
    key: "egg_free",
    defaultLabel: "Egg-free",
    aliases: ["달걀제외"],
  },
  {
    key: "alcohol_free",
    defaultLabel: "Alcohol-free",
    aliases: ["무알코올"],
  },
  {
    key: "caffeine_free",
    defaultLabel: "Caffeine-free",
    aliases: ["무카페인"],
  },
];

const INGREDIENT_BY_KEY: ReadonlyMap<string, SearchableIngredient> = new Map(
  SEARCHABLE_INGREDIENTS.map((ingredient) => [ingredient.key, ingredient])
);

export const findSearchableIngredientByValue = (value: string): SearchableIngredient | null => {
  const normalized = value.trim();
  if (!normalized) return null;
  return INGREDIENT_BY_KEY.get(normalized) ?? null;
};

export const getIngredientDefaultLabel = (value: string): string => {
  const normalized = value.trim();
  return findSearchableIngredientByValue(normalized)?.defaultLabel ?? normalized;
};
