export const ALLERGY_TRANSLATIONS: Record<string, { language: string, text: string, sub: string }> = {
    'TH': {
        language: 'Thai',
        text: 'ฉันมีอาการแพ้อาหารครับ/ค่ะ กรุณาระวังส่วนผสมที่อาจก่อให้เกิดอาการแพ้ด้วยครับ',
        sub: 'I have food allergies. Please ensure this food is safe.'
    },
    'JP': {
        language: 'Japanese',
        text: '私は食物アレルギーがあります。アレルギー食材が入っていないか確認してください。',
        sub: 'I have food allergies. Please check for allergens.'
    },
    'FR': {
        language: 'French',
        text: 'J\'ai des allergies alimentaires. S\'il vous plaît, assurez-vous que ce plat est sans danger.',
        sub: 'I have food allergies. Please ensure this dish is safe.'
    },
    'IT': {
        language: 'Italian',
        text: 'Ho delle allergie alimentari. Per favore assicuratevi che questo piatto sia sicuro.',
        sub: 'I have food allergies. Please ensure this dish is safe.'
    },
    'ES': {
        language: 'Spanish',
        text: 'Tengo alergias alimentarias. Por favor asegúrese de que este plato sea seguro.',
        sub: 'I have food allergies. Please ensure this dish is safe.'
    },
    'DE': {
        language: 'German',
        text: 'Ich habe Lebensmittelallergien. Bitte stellen Sie sicher, dass dieses Gericht sicher ist.',
        sub: 'I have food allergies.'
    },
    'KR': {
        language: 'Korean',
        text: '저는 식품 알레르기가 있습니다. 이 음식에 알레르기 유발 성분이 없는지 확인 부탁드립니다.',
        sub: 'Checking for allergens...'
    },
    'CN': {
        language: 'Chinese',
        text: '我有食物过敏。请确保这道菜是安全的。',
        sub: 'I have food allergies.'
    },
    'TW': {
        language: 'Traditional Chinese',
        text: '我有食物過敏。請確保這道菜是安全的。',
        sub: 'I have food allergies.'
    },
    'VN': {
        language: 'Vietnamese',
        text: 'Tôi bị dị ứng thực phẩm. Vui lòng đảm bảo món ăn này an toàn.',
        sub: 'I have food allergies.'
    },
    'ID': {
        language: 'Indonesian',
        text: 'Saya punya alergi makanan. Tolong pastikan makanan ini aman.',
        sub: 'I have food allergies.'
    },
    'US': { language: 'English', text: 'I have food allergies. Please check ingredients carefully.', sub: 'Standard English Warning' },
    'GB': { language: 'English', text: 'I have food allergies. Please check ingredients carefully.', sub: 'Standard English Warning' },
    'AU': { language: 'English', text: 'I have food allergies. Please check ingredients carefully.', sub: 'Standard English Warning' },
    'CA': { language: 'English', text: 'I have food allergies. Please check ingredients carefully.', sub: 'Standard English Warning' },
    // Default fallback
    'DEFAULT': { language: 'English', text: 'I have food allergies. Please help me check ingredients.', sub: 'Visual safety check needed.' }
};

export const ALLERGEN_TERMS: Record<string, Record<string, string>> = {
    'Peanuts': { 'TH': 'ถั่วลิสง', 'JP': 'ピーナッツ', 'FR': 'Arachides', 'IT': 'Arachidi', 'ES': 'Cacahuetes', 'KR': '땅콩', 'CN': '花生', 'VN': 'Đậu phộng', 'ID': 'Kacang tanah' },
    'Peanut': { 'TH': 'ถั่วลิสง', 'JP': 'ピーナッツ', 'FR': 'Arachides', 'IT': 'Arachidi', 'ES': 'Cacahuetes', 'KR': '땅콩', 'CN': '花生', 'VN': 'Đậu phộng', 'ID': 'Kacang tanah' },
    'Milk': { 'TH': 'นม', 'JP': '牛乳', 'FR': 'Lait', 'IT': 'Latte', 'ES': 'Leche', 'KR': '우유', 'CN': '牛奶', 'VN': 'Sữa', 'ID': 'Susu' },
    'Egg': { 'TH': 'ไข่', 'JP': '卵', 'FR': 'Oeufs', 'IT': 'Uova', 'ES': 'Huevos', 'KR': '달걀', 'CN': '鸡蛋', 'VN': 'Trứng', 'ID': 'Telur' },
    'Eggs': { 'TH': 'ไข่', 'JP': '卵', 'FR': 'Oeufs', 'IT': 'Uova', 'ES': 'Huevos', 'KR': '달걀', 'CN': '鸡蛋', 'VN': 'Trứng', 'ID': 'Telur' },
    'Shellfish': { 'TH': 'สัตว์ทะเลเปลือกแข็ง', 'JP': '甲殻類', 'FR': 'Crustacés', 'IT': 'Crostacei', 'ES': 'Mariscos', 'KR': '조개류', 'CN': '贝类', 'VN': 'Động vật có vỏ', 'ID': 'Kerang' },
    'Fish': { 'TH': 'ปลา', 'JP': '魚', 'FR': 'Poisson', 'IT': 'Pesce', 'ES': 'Pescado', 'KR': '생선', 'CN': '鱼', 'VN': 'Cá', 'ID': 'Ikan' },
    'Soy': { 'TH': 'ถั่วเหลือง', 'JP': '大豆', 'FR': 'Soja', 'IT': 'Soia', 'ES': 'Soja', 'KR': '대두', 'CN': '大豆', 'VN': 'Đậu nành', 'ID': 'Kedelai' },
    'Wheat': { 'TH': 'ข้าวสาลี', 'JP': '小麦', 'FR': 'Blé', 'IT': 'Grano', 'ES': 'Trigo', 'KR': '밀', 'CN': '小麦', 'VN': 'Lúa mì', 'ID': 'Gandum' },
    'Tree Nuts': { 'TH': 'ถั่วเปลือกแข็ง', 'JP': '木の実', 'FR': 'Fruits à coque', 'IT': 'Frutta a guscio', 'ES': 'Frutos secos', 'KR': '견과류', 'CN': '坚果', 'VN': 'Các loại hạt', 'ID': 'Kacang pohon' },
    'Gluten': { 'TH': 'กลูเตน', 'JP': 'グルテン', 'FR': 'Gluten', 'IT': 'Glutine', 'ES': 'Gluten', 'KR': '글루텐', 'CN': '麸质', 'VN': 'Gluten', 'ID': 'Gluten' },
    'Sesame': { 'TH': 'งา', 'JP': 'ゴマ', 'FR': 'Sésame', 'IT': 'Sesamo', 'ES': 'Sésamo', 'KR': '참깨', 'CN': '芝麻', 'VN': 'Mè', 'ID': 'Wijen' }
};
