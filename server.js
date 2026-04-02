/**
 * Bett'r Food AI Chatbot Server
 * Multi-language product recommendation chatbot powered by Gemini 2.5 Flash
 * Supports: EN, BG, HR, CS, EL, HU, RO, SK, SL
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const https = require('https');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// ── CORS ───────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  process.env.WEBSITE_DOMAIN || 'https://bettr-food.com',
  'https://www.bettr-food.com',
  'http://localhost:3000',
  'http://localhost:8080',
];
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.some(o => origin.startsWith(o))) cb(null, true);
    else cb(null, true); // Allow all during development
  },
  credentials: true
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Helpers ────────────────────────────────────────────────────

// ── Auto-tagging ──────────────────────────────────────────────
const TAG_RULES = [
  { tag: 'vegan',        patterns: [/vegan/i, /plant[\s-]?based/i] },
  { tag: 'gluten-free',  patterns: [/gluten[\s-]?free/i, /без глутен/i, /bezlepkov/i] },
  { tag: 'bio',          patterns: [/\bbio\b/i, /\borganic\b/i] },
  { tag: 'protein',      patterns: [/protein/i, /протеин/i] },
  { tag: 'keto',         patterns: [/\bketo\b/i] },
  { tag: 'raw',          patterns: [/\braw\b/i] },
  { tag: 'no-added-sugar', patterns: [/no added sugar/i, /sugar[\s-]?free/i] },
  { tag: 'snack',        patterns: [/snack/i, /bar\b/i, /wafer/i, /cookie/i, /crisp/i, /chip/i] },
  { tag: 'chocolate',    patterns: [/chocolat/i, /cocoa/i, /cacao/i] },
  { tag: 'nut-butter',   patterns: [/nut[\s-]?butter/i, /peanut[\s-]?butter/i, /almond[\s-]?butter/i, /cashew[\s-]?butter/i] },
  { tag: 'spread',       patterns: [/spread/i, /tahini/i] },
  { tag: 'superfood',    patterns: [/superfood/i, /adaptogen/i, /maca/i, /ashwagandha/i, /spirulina/i, /chlorella/i, /moringa/i] },
  { tag: 'immunity',     patterns: [/immun/i, /vitamin[\s-]?[cd]/i] },
  { tag: 'energy',       patterns: [/energy/i, /energi/i, /stamina/i] },
  { tag: 'drink',        patterns: [/drink/i, /milk/i, /smoothie/i, /shake/i] },
  { tag: 'cooking',      patterns: [/cook/i, /bak/i, /flour/i, /mix\b/i] },
  { tag: 'nuts-seeds',   patterns: [/\bnut\b/i, /\bnuts\b/i, /seed/i, /almond/i, /cashew/i, /walnut/i, /peanut/i, /hazelnut/i, /pistachio/i] },
  { tag: 'coconut',      patterns: [/coconut/i, /coco\b/i] },
  { tag: 'fruit',        patterns: [/fruit/i, /berry/i, /mango/i, /banana/i, /apple/i, /strawberry/i, /raspberry/i, /blueberry/i] },
  { tag: 'granola',      patterns: [/granola/i, /muesli/i, /oat/i] },
  { tag: 'gift',         patterns: [/gift/i, /bundle/i, /box/i, /calendar/i, /christmas/i] },
];

function autoTag(product) {
  const text = `${product.name} ${product.description} ${product.productType} ${(product.shopifyTags || []).join(' ')}`;
  const tags = new Set();
  for (const st of (product.shopifyTags || [])) {
    if (/vegan/i.test(st)) tags.add('vegan');
    if (/gluten[\s-]?free/i.test(st)) tags.add('gluten-free');
    if (/\bbio\b/i.test(st) || /organic/i.test(st)) tags.add('bio');
    if (/no[\s-]?added[\s-]?sugar/i.test(st)) tags.add('no-added-sugar');
    if (/\bketo\b/i.test(st)) tags.add('keto');
    if (/\braw\b/i.test(st)) tags.add('raw');
    if (/immun/i.test(st)) tags.add('immunity');
  }
  for (const rule of TAG_RULES) {
    if (!tags.has(rule.tag)) {
      for (const p of rule.patterns) {
        if (p.test(text)) { tags.add(rule.tag); break; }
      }
    }
  }
  const pt = (product.productType || '').toLowerCase();
  if (pt.includes('bar') || pt.includes('snack') || pt.includes('cookie')) tags.add('snack');
  if (pt.includes('protein')) tags.add('protein');
  if (pt.includes('superfood')) tags.add('superfood');
  if (pt.includes('nut butter')) tags.add('nut-butter');
  if (pt.includes('spread')) tags.add('spread');
  if (pt.includes('drink')) tags.add('drink');
  if (pt.includes('chocolate')) tags.add('chocolate');
  if (pt.includes('cooking') || pt.includes('soup')) tags.add('cooking');
  if (pt.includes('granola')) tags.add('granola');
  if (pt.includes('nuts')) tags.add('nuts-seeds');
  if (pt.includes('bundle') || pt.includes('advent')) tags.add('gift');
  return [...tags];
}

// ── Fetch URL Helper ──────────────────────────────────────────
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BettrBot/1.0)',
        'Accept': 'application/json, text/plain, */*',
      }
    };
    const mod = url.startsWith('https') ? https : require('http');
    mod.get(options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location).then(resolve, reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

// ── Load Products ──────────────────────────────────────────────
let PRODUCTS = [];
const SHOPIFY_DOMAIN = 'https://bettr-food.com';

async function fetchShopifyProducts() {
  const allProducts = [];
  let page = 1;
  while (true) {
    const url = `${SHOPIFY_DOMAIN}/products.json?limit=250&page=${page}`;
    console.log(`Fetching ${url}`);
    const raw = await fetchUrl(url);
    const data = JSON.parse(raw);
    if (!data.products || data.products.length === 0) break;
    for (const p of data.products) {
      const variants = (p.variants || []).filter(v => parseFloat(v.price) > 0).map(v => ({
        title: v.title, price: parseFloat(v.price), available: v.available, weight: v.weight ? String(v.weight) : ''
      }));
      if (variants.length === 0) continue;
      const availableVariants = variants.filter(v => v.available);
      const priceSource = availableVariants.length > 0 ? availableVariants : variants;
      const priceEUR = Math.min(...priceSource.map(v => v.price));
      const rawTags = Array.isArray(p.tags) ? p.tags : (p.tags || '').split(',');
            const shopifyTags = rawTags.map(t => String(t).trim().toLowerCase()).filter(Boolean);
      const description = (p.body_html || '').replace(/<[^>]*>/g, '').substring(0, 500);
      const product = {
        name: p.title,
        url: `${SHOPIFY_DOMAIN}/products/${p.handle}`,
        vendor: p.vendor || '',
        productType: p.product_type || '',
        description,
        shopifyTags,
        priceEUR,
        isAvailable: availableVariants.length > 0,
        variants: variants.map(v => ({ title: v.title, price: v.price, available: v.available })),
        imageUrl: (p.images && p.images[0]) ? p.images[0].src : ''
      };
      product.tags = autoTag(product);
      delete product.shopifyTags;
      allProducts.push(product);
    }
    page++;
    if (page > 10) break; // Safety limit
  }
  return allProducts;
}

async function loadProducts() {
  // Try fetching from Shopify JSON API first
  try {
    console.log('Fetching products from Shopify JSON API...');
    const products = await fetchShopifyProducts();
    if (products.length > 0) {
      PRODUCTS = products;
      console.log(`Loaded ${PRODUCTS.length} products from Shopify API`);
      return;
    }
  } catch (e) {
    console.log(`Shopify API fetch failed: ${e.message}`);
  }

  // Fallback: load from products.json
  try {
    const p = path.join(__dirname, 'products.json');
    PRODUCTS = JSON.parse(fs.readFileSync(p, 'utf-8'));
    console.log(`Loaded ${PRODUCTS.length} products from products.json (fallback)`);
  } catch (e) {
    console.error('Failed to load products from any source:', e.message);
  }
}

// ── Language Definitions ───────────────────────────────────────
const LANGUAGES = {
  en: { name: 'English', flag: '🌐', greeting: 'Hi! I\'m your Bett\'r Food assistant. How can I help you today?' },
  bg: { name: 'Български', flag: '🇧🇬', greeting: 'Здравейте! Аз съм вашият Bett\'r Food асистент. Как мога да ви помогна?' },
  hr: { name: 'Hrvatski', flag: '🇭🇷', greeting: 'Bok! Ja sam vaš Bett\'r Food asistent. Kako vam mogu pomoći?' },
  cs: { name: 'Čeština', flag: '🇨🇿', greeting: 'Ahoj! Jsem váš Bett\'r Food asistent. Jak vám mohu pomoci?' },
  el: { name: 'Ελληνικά', flag: '🇬🇷', greeting: 'Γεια σας! Είμαι ο βοηθός σας στο Bett\'r Food. Πώς μπορώ να σας βοηθήσω;' },
  hu: { name: 'Magyar', flag: '🇭🇺', greeting: 'Szia! A Bett\'r Food asszisztensed vagyok. Miben segíthetek?' },
  ro: { name: 'Română', flag: '🇷🇴', greeting: 'Bună! Sunt asistentul tău Bett\'r Food. Cum te pot ajuta?' },
  sk: { name: 'Slovenčina', flag: '🇸🇰', greeting: 'Ahoj! Som váš Bett\'r Food asistent. Ako vám môžem pomôcť?' },
  sl: { name: 'Slovenščina', flag: '🇸🇮', greeting: 'Živjo! Sem vaš Bett\'r Food pomočnik. Kako vam lahko pomagam?' },
};

// ── System Prompts by Language ─────────────────────────────────
function getSystemPrompt(lang) {
  const langInstruction = {
    en: 'Respond ONLY in English.',
    bg: 'Отговаряй САМО на български език.',
    hr: 'Odgovaraj ISKLJUČIVO na hrvatskom jeziku.',
    cs: 'Odpovídej POUZE v českém jazyce.',
    el: 'Απάντησε ΜΟΝΟ στα ελληνικά.',
    hu: 'Válaszolj KIZÁRÓLAG magyar nyelven.',
    ro: 'Răspunde DOAR în limba română.',
    sk: 'Odpovedaj VÝLUČNE v slovenskom jazyku.',
    sl: 'Odgovarjaj IZKLJUČNO v slovenskem jeziku.',
  };

  return `You are Bett'r Bot — a friendly, knowledgeable AI assistant for Bett'r Food (bettr-food.com), an online store for premium organic, vegan, and plant-based foods across Europe.

${langInstruction[lang] || langInstruction.en}

YOUR ROLE:
- Help customers find products, answer questions about ingredients, nutrition, dietary needs
- Recommend products based on preferences (vegan, gluten-free, keto, protein, etc.)
- Be warm, enthusiastic about healthy food, and helpful
- Use markdown for formatting: **bold** for product names, bullet lists for multiple items

PRODUCT RECOMMENDATIONS:
- When suggesting products, always include: name, price (€), and a direct link
- Format product links as: [Product Name](URL)
- Show max 3-5 products per response unless asked for more
- If a product has multiple variants, mention the options
- Always check isAvailable before recommending

IMPORTANT RULES:
- Only recommend products from the catalog provided in the context
- If you don't have a product that matches, say so honestly
- Never invent products or prices
- For shipping/payment/returns questions, direct to bettr-food.com/pages/faqs
- Prices are in EUR (€)
- The store ships to: Bulgaria, Croatia, Czech Republic, Greece, Hungary, Romania, Slovakia, Slovenia, and internationally

PRODUCT CATALOG will be provided in each message as context.`;
}

// ── Product Search Engine ──────────────────────────────────────
const TAG_BOOST = {
  'vegan': ['vegan', 'plant-based', 'растителен', 'vegán', 'veganski'],
  'gluten-free': ['gluten-free', 'gluten free', 'celiac', 'безглутен', 'bezlepkov', 'gluténmentes', 'brez glutena'],
  'protein': ['protein', 'протеин', 'fehérje', 'bílkovina', 'proteína'],
  'keto': ['keto', 'low-carb', 'low carb', 'ketó'],
  'chocolate': ['chocolate', 'chocolat', 'шоколад', 'čokoláda', 'σογκολάτα', 'csokoládé', 'ciocolată'],
  'nut-butter': ['nut butter', 'peanut butter', 'almond butter', 'cashew butter', 'tahini', 'масло'],
  'snack': ['snack', 'bar', 'cookie', 'wafer', 'десерт', 'снакс'],
  'superfood': ['superfood', 'spirulina', 'maca', 'ashwagandha', 'chlorella', 'moringa'],
  'no-added-sugar': ['no sugar', 'sugar-free', 'no added sugar', 'без захар', 'bez cukru', 'cukormentes'],
  'coconut': ['coconut', 'кокос', 'kokos', 'kókusz', 'nucă de cocos'],
  'fruit': ['fruit', 'berry', 'mango', 'banana', 'плод', 'ovoce', 'gyümölcs', 'fruct'],
  'spread': ['spread', 'pasta', 'crema', 'намаз'],
  'drink': ['drink', 'milk', 'напитка', 'nápoj', 'ital', 'băutură'],
  'granola': ['granola', 'muesli', 'oat', 'гранола', 'müsli'],
  'immunity': ['immunity', 'immune', 'vitamin', 'имунитет', 'imunita', 'immunitás'],
  'energy': ['energy', 'енергия', 'energia', 'energie'],
  'cooking': ['cooking', 'baking', 'flour', 'mix', 'готвене', 'pečení', 'sütés'],
  'raw': ['raw', 'сурово'],
  'bio': ['bio', 'organic', 'био', 'organický', 'βιολογικό'],
  'gift': ['gift', 'bundle', 'box', 'подарък', 'dárek', 'ajándék', 'cadou'],
};

function searchProducts(query, limit = 10) {
  if (!query || !PRODUCTS.length) return [];
  const q = query.toLowerCase();
  const words = q.split(/\s+/).filter(w => w.length > 1);

  const scored = PRODUCTS.map(product => {
    let score = 0;
    const name = product.name.toLowerCase();
    const desc = (product.description || '').toLowerCase();
    const type = (product.productType || '').toLowerCase();
    const vendor = (product.vendor || '').toLowerCase();

    // Name match (highest weight)
    for (const w of words) {
      if (name.includes(w)) score += 15;
    }
    if (name.includes(q)) score += 25;

    // Vendor match
    for (const w of words) {
      if (vendor.includes(w)) score += 8;
    }

    // Product type match
    for (const w of words) {
      if (type.includes(w)) score += 10;
    }

    // Description match
    for (const w of words) {
      if (desc.includes(w)) score += 3;
    }

    // Tag-based boost (multi-language)
    for (const [tag, keywords] of Object.entries(TAG_BOOST)) {
      const tagMatch = keywords.some(kw => q.includes(kw));
      if (tagMatch && product.tags.includes(tag)) {
        score += 20;
      }
    }

    // Direct tag match
    for (const w of words) {
      if (product.tags.includes(w)) score += 12;
    }

    // Availability bonus
    if (product.isAvailable) score += 2;

    return { product, score };
  });

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.product);
}

// ── Gemini AI Call ─────────────────────────────────────────────
function callGemini(messages, systemPrompt) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return reject(new Error('GEMINI_API_KEY not set'));

    // Build context with top products
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    const query = lastUserMsg ? lastUserMsg.content : '';
    const relevant = searchProducts(query, 15);

    const productContext = relevant.length > 0
      ? '\n\nRELEVANT PRODUCTS FROM CATALOG:\n' + relevant.map(p => {
          const variants = p.variants.map(v => `${v.title}: €${v.price} (${v.available ? 'in stock' : 'out of stock'})`).join('; ');
          return `- **${p.name}** | €${p.priceEUR} | ${p.vendor} | ${p.productType} | Tags: ${p.tags.join(', ')} | Variants: ${variants} | ${p.isAvailable ? 'Available' : 'Out of stock'} | URL: ${p.url} | Image: ${p.imageUrl}`;
        }).join('\n')
      : '\n\nNo specific products matched the query. You can suggest browsing the catalog at bettr-food.com';

    const geminiMessages = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    // Inject system prompt + product context into first user message
    if (geminiMessages.length > 0 && geminiMessages[0].role === 'user') {
      geminiMessages[0].parts[0].text = systemPrompt + productContext + '\n\nUser message: ' + geminiMessages[0].parts[0].text;
    }

    const body = JSON.stringify({
      contents: geminiMessages,
      generationConfig: {
        temperature: 0.7,
        topP: 0.9,
        topK: 40,
        maxOutputTokens: 1024,
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      ]
    });

    const options = {
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.candidates && json.candidates[0]) {
            const text = json.candidates[0].content?.parts?.[0]?.text || '';
            resolve(text);
          } else if (json.error) {
            reject(new Error(json.error.message));
          } else {
            reject(new Error('Unexpected Gemini response'));
          }
        } catch (e) {
          reject(new Error('Failed to parse Gemini response'));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Gemini timeout')); });
    req.write(body);
    req.end();
  });
}

// ── Session Management ─────────────────────────────────────────
const sessions = new Map();
const SESSION_TTL = 30 * 60 * 1000; // 30 min

function getSession(id) {
  if (!sessions.has(id)) {
    sessions.set(id, { messages: [], lang: 'en', created: Date.now(), lastActive: Date.now() });
  }
  const s = sessions.get(id);
  s.lastActive = Date.now();
  return s;
}

// Cleanup expired sessions
setInterval(() => {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.lastActive > SESSION_TTL) sessions.delete(id);
  }
}, 5 * 60 * 1000);

// ── API Routes ─────────────────────────────────────────────────

// Chat endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { message, sessionId, lang } = req.body;
    if (!message) return res.status(400).json({ error: 'Message required' });

    const sid = sessionId || `s_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const session = getSession(sid);

    // Update language if provided
    if (lang && LANGUAGES[lang]) session.lang = lang;

    session.messages.push({ role: 'user', content: message });

    // Keep last 20 messages for context
    if (session.messages.length > 20) {
      session.messages = session.messages.slice(-20);
    }

    const systemPrompt = getSystemPrompt(session.lang);
    const reply = await callGemini(session.messages, systemPrompt);

    session.messages.push({ role: 'assistant', content: reply });

    res.json({ reply, sessionId: sid, lang: session.lang });
  } catch (err) {
    console.error('Chat error:', err.message);
    res.status(500).json({ error: 'Failed to get response. Please try again.' });
  }
});

// Set language
app.post('/api/lang', (req, res) => {
  const { sessionId, lang } = req.body;
  if (!lang || !LANGUAGES[lang]) return res.status(400).json({ error: 'Invalid language' });
  const session = getSession(sessionId || 'default');
  session.lang = lang;
  res.json({ lang, greeting: LANGUAGES[lang].greeting });
});

// Get available languages
app.get('/api/languages', (req, res) => {
  res.json(LANGUAGES);
});

// Product search endpoint
app.get('/api/products/search', (req, res) => {
  const { q, limit } = req.query;
  if (!q) return res.json([]);
  res.json(searchProducts(q, parseInt(limit) || 10));
});

// Product tags
app.get('/api/products/tags', (req, res) => {
  const tagCounts = {};
  for (const p of PRODUCTS) {
    for (const t of p.tags) tagCounts[t] = (tagCounts[t] || 0) + 1;
  }
  res.json(tagCounts);
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    products: PRODUCTS.length,
    sessions: sessions.size,
    languages: Object.keys(LANGUAGES),
    uptime: Math.floor(process.uptime()),
  });
});

// ── Start Server ───────────────────────────────────────────────
loadProducts().then(() => {
  app.listen(PORT, () => {
    console.log(`Bett'r Food Chatbot running on port ${PORT}`);
    console.log(`Products loaded: ${PRODUCTS.length}`);
    console.log(`Languages: ${Object.keys(LANGUAGES).join(', ')}`);
  });
}).catch(err => {
  console.error('Startup error:', err);
  // Start server anyway with empty products
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT} (with ${PRODUCTS.length} products)`);
  });
});
