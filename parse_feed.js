/**
 * Parse zelen_feed.xml into products.json for the chatbot
 * Extracts all product data and auto-generates tags from descriptions
 */

const fs = require('fs');

const xml = fs.readFileSync('zelen_feed.xml', 'utf8');

// Simple XML parser for this specific structure
function extractTag(xml, tag) {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const match = xml.match(regex);
  return match ? match[1].trim() : '';
}

function extractSelfClosingOrContent(xml, tag) {
  // Handle both <tag/> and <tag>content</tag>
  const regex = new RegExp(`<${tag}\\s*/>|<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const match = xml.match(regex);
  if (!match) return '';
  return match[1] ? match[1].trim() : '';
}

function extractAllTags(xml, tag) {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'gi');
  const results = [];
  let match;
  while ((match = regex.exec(xml)) !== null) {
    results.push(match[1].trim());
  }
  return results;
}

function stripHtml(html) {
  return html
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&rdquo;/g, '"')
    .replace(/&ldquo;/g, '"')
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractNutrition(desc) {
  const nutrition = {};
  const text = stripHtml(desc).toLowerCase();

  // Common patterns for nutritional values
  const patterns = [
    { key: 'kcal', regex: /(\d+[\.,]?\d*)\s*kcal/i },
    { key: 'kJ', regex: /(\d+[\.,]?\d*)\s*kj/i },
    { key: 'protein', regex: /(?:протеин|белтъчини|белтък|protein)[иа]?\s*[:=]?\s*(\d+[\.,]?\d*)\s*g/i },
    { key: 'carbs', regex: /(?:въглехидрат|carb)[иа]?\s*[:=]?\s*(\d+[\.,]?\d*)\s*g/i },
    { key: 'fat', regex: /(?:мазнин|fat)[иа]?\s*[:=]?\s*(\d+[\.,]?\d*)\s*g/i },
    { key: 'fiber', regex: /(?:влакнин|фибр|fiber)[иа]?\s*[:=]?\s*(\d+[\.,]?\d*)\s*g/i },
    { key: 'sugar', regex: /(?:захар|sugar)[иа]?\s*[:=]?\s*(\d+[\.,]?\d*)\s*g/i },
  ];

  patterns.forEach(({ key, regex }) => {
    const match = text.match(regex);
    if (match) {
      nutrition[key] = parseFloat(match[1].replace(',', '.'));
    }
  });

  return nutrition;
}

function generateTags(title, desc) {
  const tags = [];
  const titleLower = title.toLowerCase();
  const text = (title + ' ' + stripHtml(desc)).toLowerCase();

  // --- Step 1: Detect product CATEGORY from title (most reliable signal) ---
  const cosmeticTitleWords = ['шампоан', 'балсам за коса', 'лосион', 'крем за лице', 'крем за ръце', 'крем за тяло',
    'дезодорант', 'сапун', 'душ гел', 'паста за зъби', 'слънцезащит', 'серум', 'маска за лице',
    'мляко за тяло', 'тоник', 'масло за тяло', 'масло за коса', 'гел за коса', 'пяна за',
    'hauschka', 'logona', 'lavera', 'woopies', 'urtekram', 'sante'];
  const cleaningTitleWords = ['почистващ', 'прах за пране', 'перилен', 'препарат', 'миещ', 'антибактериален спрей'];
  const candleTitleWords = ['свещ', 'ароматизатор', 'дифузер'];

  const isCosmetic = cosmeticTitleWords.some(w => titleLower.includes(w)) ||
    (text.includes('козметик') || text.includes('кожа') || text.includes('коса'));
  const isCleaning = cleaningTitleWords.some(w => titleLower.includes(w));
  const isCandle = candleTitleWords.some(w => titleLower.includes(w));
  const isNonFood = isCosmetic || isCleaning || isCandle;

  // --- Step 2: Universal tags (apply to everything) ---
  if (text.includes('био ') || text.includes('bio ') || text.includes('organic') || titleLower.startsWith('био ')) tags.push('bio');
  if (text.includes('веган') || text.includes('vegan') || text.includes('растителн')) tags.push('vegan');

  // --- Step 3: Category tags ---
  if (isCosmetic) tags.push('cosmetic');
  if (isCleaning) tags.push('cleaning');

  // --- Step 4: Food-only tags (SKIP for cosmetics/cleaning/candles) ---
  if (!isNonFood) {
    // Dietary tags
    if (text.includes('без глутен') || text.includes('gluten free') || text.includes('безглутенов') || text.includes('gluten-free')) tags.push('gluten-free');
    if (text.includes('без захар') || text.includes('sugar free') || text.includes('без добавена захар') || text.includes('no added sugar')) tags.push('no-added-sugar');
    if (text.includes('кето') || text.includes('keto')) tags.push('keto');
    if (text.includes('протеин') || text.includes('protein')) tags.push('protein');
    if (text.includes('фибри') || text.includes('fiber') || text.includes('влакнин')) tags.push('fiber');

    // Food type tags
    if (text.includes('суперхран') || text.includes('superfood') || text.includes('super food')) tags.push('superfood');
    // For drink tag, use title primarily to avoid false matches from descriptions
    if (titleLower.includes('чай') || titleLower.includes('кафе') || titleLower.includes('сок ') ||
        titleLower.includes('смути') || titleLower.includes('напитк') || titleLower.includes('какао ') ||
        titleLower.includes('комбуча') || titleLower.includes('мляко') ||
        text.includes('напитка')) tags.push('drink');
    if (text.includes('бебе') || text.includes('детск') || text.includes('baby') || text.includes('kids')) tags.push('baby');
    if (titleLower.includes('бар ') || titleLower.includes('барче') || text.includes('десерт') ||
        titleLower.includes('бонбон') || titleLower.includes('шоколад') || titleLower.includes('вафл') ||
        titleLower.includes('пралин')) tags.push('snack');
    if (titleLower.includes('семе') || titleLower.includes('ядк') || text.includes('nuts') || text.includes('seeds') ||
        titleLower.includes('бадем') || titleLower.includes('лешник') || titleLower.includes('кашу') || titleLower.includes('орех')) tags.push('nuts-seeds');
    if (titleLower.includes('масло') || titleLower.includes('зехтин') || titleLower.includes('кокосово')) tags.push('oil');
    if (titleLower.includes('брашно') || text.includes('миксов') || text.includes('готови миксове')) tags.push('baking');
    if (titleLower.includes('подправк') || text.includes('spice') || titleLower.includes('куркума') ||
        titleLower.includes('канела') || titleLower.includes('джинджифил')) tags.push('spice');
    if (titleLower.includes('тестени') || titleLower.includes('макарон') || titleLower.includes('паста') || titleLower.includes('спагети')) tags.push('pasta');
    if (titleLower.includes('крем за мазане') || titleLower.includes('тахан') || (titleLower.includes('масло от') && titleLower.includes('ядки'))) tags.push('spread');
    if (text.includes('имунитет') || text.includes('immun')) tags.push('immunity');
    if (text.includes('енергия') || text.includes('energy')) tags.push('energy');
    if (text.includes('детокс') || text.includes('detox')) tags.push('detox');
    if (text.includes('антиоксидант') || text.includes('antioxidant')) tags.push('antioxidant');
    if (text.includes('спаси храна') || text.includes('tryme')) tags.push('save-food');
    if (text.includes('почистващ') || text.includes('прах за пране') || text.includes('дрогерия') || text.includes('перилен')) tags.push('cleaning');

    // Health goal tags
    if (text.includes('отслабване') || text.includes('диета') || text.includes('нискокалоричн')) tags.push('weight-loss');
    if (text.includes('спорт') || text.includes('фитнес') || text.includes('тренировка')) tags.push('fitness');
    if (text.includes('храносмилане') || text.includes('чревна флора') || text.includes('пробиотик') || text.includes('прeбиотик')) tags.push('digestion');
  }

  return [...new Set(tags)];
}

function generateSearchUrl(title) {
  // For products without a direct link, use zelen.bg search as fallback
  const cleanTitle = title.replace(/\|/g, ' ').replace(/,/g, ' ').trim().split(/\s+/).slice(0, 5).join(' ');
  return `https://zelen.bg/?s=${encodeURIComponent(cleanTitle)}`;
}

// Parse all products
console.log('🌿 Parsing zelen_feed.xml...\n');

const productBlocks = xml.split('<product>').slice(1); // Skip before first <product>
const products = [];

productBlocks.forEach((block, i) => {
  block = '<product>' + block; // Re-add tag for parsing

  const id = extractTag(block, 'id');
  const title = extractTag(block, 'title');
  const isAvailable = extractTag(block, 'is_available') === 'true';
  const descHtml = extractTag(block, 'description');
  const description = stripHtml(descHtml);
  const link = extractSelfClosingOrContent(block, 'link');
  const images = extractAllTags(block, 'image_url');
  const price = parseFloat(extractTag(block, 'price')) || 0;
  const salePrice = parseFloat(extractTag(block, 'sale_price')) || 0;
  const priceEur = parseFloat(extractTag(block, 'price_eur')) || 0;
  const salePriceEur = parseFloat(extractTag(block, 'sale_price_eur')) || 0;

  const tags = generateTags(title, descHtml);
  const nutrition = extractNutrition(descHtml);

  // Use the link from feed if available, otherwise generate search URL
  const url = link || generateSearchUrl(title);

  products.push({
    id,
    name: title,
    url,
    priceBGN: salePrice || price,
    priceEUR: salePriceEur || priceEur,
    originalPriceBGN: price !== salePrice ? price : undefined,
    originalPriceEUR: priceEur !== salePriceEur ? priceEur : undefined,
    isAvailable: isAvailable,
    description: description.substring(0, 500),
    tags,
    nutrition,
    imageUrl: images[0] || '',
  });
});

// Save products.json
fs.writeFileSync('products.json', JSON.stringify(products, null, 2));

// Stats
console.log(`✅ Parsed ${products.length} products\n`);
console.log(`📊 Stats:`);
console.log(`   Available: ${products.filter(p => p.isAvailable).length}`);
console.log(`   Unavailable: ${products.filter(p => !p.isAvailable).length}`);
console.log(`   With nutrition data: ${products.filter(p => Object.keys(p.nutrition).length > 0).length}`);
console.log(`   On sale: ${products.filter(p => p.originalPriceBGN).length}`);

// Tag distribution
const tagCounts = {};
products.forEach(p => p.tags.forEach(t => tagCounts[t] = (tagCounts[t] || 0) + 1));
console.log(`\n🏷️  Tags:`);
Object.entries(tagCounts).sort((a,b) => b[1]-a[1]).forEach(([tag, count]) => {
  console.log(`   ${tag}: ${count}`);
});

// Price range
const prices = products.filter(p => p.priceBGN > 0).map(p => p.priceBGN);
console.log(`\n💰 Price range: ${Math.min(...prices).toFixed(2)} - ${Math.max(...prices).toFixed(2)} лв.`);
console.log(`   Average: ${(prices.reduce((a,b) => a+b, 0) / prices.length).toFixed(2)} лв.`);
