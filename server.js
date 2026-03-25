/**
 * Zelen.bg AI Chatbot Server
 * Provides product recommendations and customer support using Google Gemini AI
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middleware ---
app.use(express.json());
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests from zelen.bg, localhost, and no origin (server-to-server)
    const allowed = [
      process.env.WEBSITE_DOMAIN || 'https://zelen.bg',
      'https://zelen.bg',
      'http://zelen.bg',
      'https://www.zelen.bg',
      'http://www.zelen.bg',
      'http://localhost:3000',
      'http://127.0.0.1:3000'
    ];
    if (!origin || allowed.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, true); // Allow all origins for widget embedding
    }
  }
}));
app.use(express.static(path.join(__dirname, 'public')));

// --- Load Product Database ---
let products = [];

function loadProducts() {
  const productsPath = path.join(__dirname, 'products.json');
  if (fs.existsSync(productsPath)) {
    products = JSON.parse(fs.readFileSync(productsPath, 'utf8'));
    console.log(`â Loaded ${products.length} products`);
  } else {
    console.warn('â ï¸  products.json not found! Please provide the product feed.');
  }
}

// --- Product Search Engine ---
function searchProducts(query, maxResults = 5) {
  const q = query.toLowerCase();
  const words = q.split(/\s+/).filter(w => w.length >= 2);

  const scored = products.map((p) => {
    let score = 0;
    const name = (p.name || '').toLowerCase();
    const desc = (p.description || '').toLowerCase();
    const tags = (p.tags || []).join(' ');

    // Direct name match (highest weight)
    if (name.includes(q)) score += 15;

    // Word-level matching
    words.forEach(word => {
      if (name.includes(word)) score += 5;
      if (desc.includes(word)) score += 2;
      if (tags.includes(word)) score += 4;
    });

    // Dietary/health queries with tag matching
    const tagBoosts = [
      { queries: ['Ð²ÐµÐ³Ð°Ð½', 'vegan', 'ÑÐ°ÑÑÐ¸ÑÐµÐ»Ð½'], tag: 'vegan', boost: 8 },
      { queries: ['Ð±ÐµÐ· Ð³Ð»ÑÑÐµÐ½', 'gluten', 'Ð±ÐµÐ·Ð³Ð»ÑÑÐµÐ½Ð¾Ð²', 'ÑÐµÐ»Ð¸Ð°ÐºÐ¸Ñ'], tag: 'gluten-free', boost: 8 },
      { queries: ['Ð±ÐµÐ· Ð·Ð°ÑÐ°Ñ', 'sugar', 'Ð´Ð¸Ð°Ð±ÐµÑ'], tag: 'no-added-sugar', boost: 8 },
      { queries: ['ÐºÐµÑÐ¾', 'keto', 'Ð½Ð¸ÑÐºÐ¾Ð²ÑÐ³Ð»ÐµÑÐ¸Ð´ÑÐ°ÑÐ½'], tag: 'keto', boost: 8 },
      { queries: ['Ð¿ÑÐ¾ÑÐµÐ¸Ð½', 'protein', 'Ð±ÐµÐ»ÑÑÐº', 'Ð¼ÑÑÐºÑÐ»'], tag: 'protein', boost: 8 },
      { queries: ['ÑÐ¸Ð±ÑÐ¸', 'fiber', 'Ð²Ð»Ð°ÐºÐ½Ð¸Ð½', 'ÑÑÐ°Ð½Ð¾ÑÐ¼Ð¸Ð»Ð°Ð½Ðµ'], tag: 'fiber', boost: 8 },
      { queries: ['Ð¸Ð¼ÑÐ½Ð¸ÑÐµÑ', 'immun', 'Ð½Ð°ÑÑÐ¸Ð½ÐºÐ°', 'Ð³ÑÐ¸Ð¿'], tag: 'immunity', boost: 8 },
      { queries: ['ÐºÐ¾Ð·Ð¼ÐµÑÐ¸Ðº', 'ÐºÐ¾Ð¶Ð°', 'ÐºÐ¾ÑÐ°', 'ÐºÑÐµÐ¼', 'ÑÐ°Ð¼Ð¿Ð¾Ð°Ð½', 'Ð»Ð¾ÑÐ¸Ð¾Ð½'], tag: 'cosmetic', boost: 8 },
      { queries: ['Ð±ÐµÐ±Ðµ', 'Ð±ÐµÐ±ÐµÑ', 'Ð´ÐµÑÑÐº', 'baby', 'Ð´ÐµÑÐµ'], tag: 'baby', boost: 8 },
      { queries: ['ÑÐ½Ð°ÐºÑ', 'Ð·Ð°ÐºÑÑÐºÐ°', 'Ð±Ð°ÑÑÐµ', 'Ð´ÐµÑÐµÑÑ', 'ÑÐ»Ð°Ð´ÐºÐ¾', 'Ð±Ð¾Ð½Ð±Ð¾Ð½', 'ÑÐ¾ÐºÐ¾Ð»Ð°Ð´'], tag: 'snack', boost: 6 },
      { queries: ['Ð½Ð°Ð¿Ð¸ÑÐº', 'ÑÐ¾Ðº', 'ÑÐ¼ÑÑÐ¸', 'ÑÐ°Ð¹', 'ÐºÐ°ÑÐµ', 'Ð¿Ð¸Ñ'], tag: 'drink', boost: 6 },
      { queries: ['Ð¿Ð¾ÑÐ¸ÑÑÐ²Ð°Ð½Ðµ', 'Ð¿ÑÐ°Ð½Ðµ', 'Ð¼Ð¸ÐµÐ½Ðµ', 'Ð´ÑÐ¾Ð³ÐµÑÐ¸Ñ'], tag: 'cleaning', boost: 8 },
      { queries: ['Ð´ÐµÑÐ¾ÐºÑ', 'detox', 'Ð¿ÑÐµÑÐ¸ÑÑÐ²Ð°Ð½Ðµ'], tag: 'detox', boost: 8 },
      { queries: ['ÐµÐ½ÐµÑÐ³Ð¸Ñ', 'energy', 'ÑÐ¼Ð¾ÑÐ°', 'ÑÐ¾Ð½ÑÑ'], tag: 'energy', boost: 6 },
      { queries: ['Ð¾ÑÑÐ»Ð°Ð±Ð²Ð°Ð½Ðµ', 'Ð´Ð¸ÐµÑÐ°', 'ÐºÐ°Ð»Ð¾ÑÐ¸Ð¸', 'Ð¾ÑÑÐ»Ð°Ð±Ð½Ð°'], tag: 'weight-loss', boost: 6 },
      { queries: ['ÑÐ¿Ð¾ÑÑ', 'ÑÐ¸ÑÐ½ÐµÑ', 'ÑÑÐµÐ½Ð¸ÑÐ¾Ð²ÐºÐ°', 'gym'], tag: 'fitness', boost: 6 },
      { queries: ['Ð°Ð½ÑÐ¸Ð¾ÐºÑÐ¸Ð´Ð°Ð½Ñ', 'antioxidant'], tag: 'antioxidant', boost: 6 },
      { queries: ['ÑÑÐ¿ÐµÑÑÑÐ°Ð½', 'superfood'], tag: 'superfood', boost: 6 },
      { queries: ['ÑÐµÐ¼Ðµ', 'ÑÐ´Ðº', 'nuts', 'seeds', 'Ð±Ð°Ð´ÐµÐ¼', 'Ð»ÐµÑÐ½Ð¸Ðº', 'ÐºÐ°ÑÑ', 'Ð¾ÑÐµÑ'], tag: 'nuts-seeds', boost: 6 },
      { queries: ['Ð¼Ð°ÑÐ»Ð¾', 'oil', 'Ð·ÐµÑÑÐ¸Ð½', 'ÐºÐ¾ÐºÐ¾ÑÐ¾Ð²Ð¾'], tag: 'oil', boost: 4 },
      { queries: ['Ð±ÑÐ°ÑÐ½Ð¾', 'Ð¼Ð¸ÐºÑ Ð·Ð°', 'Ð¿ÐµÑÐµÐ½Ðµ', 'baking'], tag: 'baking', boost: 6 },
      { queries: ['Ð¿Ð¾Ð´Ð¿ÑÐ°Ð²Ðº', 'spice', 'ÐºÑÑÐºÑÐ¼Ð°', 'ÐºÐ°Ð½ÐµÐ»Ð°', 'Ð´Ð¶Ð¸Ð½Ð´Ð¶Ð¸ÑÐ¸Ð»'], tag: 'spice', boost: 6 },
      { queries: ['Ð¿Ð°ÑÑÐ°', 'Ð¼Ð°ÐºÐ°ÑÐ¾Ð½', 'ÑÐ¿Ð°Ð³ÐµÑÐ¸', 'ÑÐµÑÑÐµÐ½Ð¸'], tag: 'pasta', boost: 6 },
      { queries: ['ÐºÑÐµÐ¼ Ð·Ð° Ð¼Ð°Ð·Ð°Ð½Ðµ', 'ÑÐ°ÑÐ°Ð½', 'Ð¼Ð°ÑÐ»Ð¾ Ð¾Ñ'], tag: 'spread', boost: 6 },
      { queries: ['ÑÐ¿Ð°ÑÐ¸ ÑÑÐ°Ð½Ð°', 'Ð¿ÑÐ¾Ð¼Ð¾ÑÐ¸Ñ', 'Ð½Ð°Ð¼Ð°Ð»ÐµÐ½Ð¸Ðµ'], tag: 'save-food', boost: 4 },
    ];

    tagBoosts.forEach(({ queries, tag, boost }) => {
      if (queries.some(kw => q.includes(kw))) {
        if (p.tags?.includes(tag)) score += boost;
      }
    });

    // Nutritional-based scoring
    if (q.includes('ÐºÐ°Ð»Ð¾ÑÐ¸Ð¸') || q.includes('calori') || q.includes('Ð½Ð¸ÑÐºÐ¾ÐºÐ°Ð»Ð¾ÑÐ¸Ñ') || q.includes('Ð»ÐµÐºÐ¸')) {
      const kcal = p.nutrition?.kcal;
      if (kcal !== undefined) {
        if (kcal <= 100) score += 10;
        else if (kcal <= 200) score += 6;
        else if (kcal <= 300) score += 3;
      }
    }

    if (q.includes('Ð¿ÑÐ¾ÑÐµÐ¸Ð½') || q.includes('protein')) {
      const prot = p.nutrition?.protein;
      if (prot !== undefined) {
        score += Math.min(prot / 3, 8);
      }
    }

    // Prefer available products
    if (p.isAvailable) score += 0.5;

    return { product: p, score };
  });

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map(s => s.product);
}

function getProductRecommendationContext(query) {
  const results = searchProducts(query, 8);
  if (results.length === 0) return 'ÐÐµ Ð±ÑÑÐ° Ð½Ð°Ð¼ÐµÑÐµÐ½Ð¸ Ð¿Ð¾Ð´ÑÐ¾Ð´ÑÑÐ¸ Ð¿ÑÐ¾Ð´ÑÐºÑÐ¸.';

  return results.map(p => {
    let info = `ð ${p.name}\n`;
    info += `   Ð¦ÐµÐ½Ð°: ${p.priceBGN} Ð»Ð².${p.priceEUR ? ' / ' + p.priceEUR + ' â¬' : ''}\n`;
    if (p.tags?.length) info += `   ÐÑÐ¸ÐºÐµÑÐ¸: ${p.tags.join(', ')}\n`;
    if (p.nutrition && Object.keys(p.nutrition).length > 0) {
      info += `   Ð¥ÑÐ°Ð½Ð¸ÑÐµÐ»Ð½Ð¸ ÑÑÐ¾Ð¹Ð½Ð¾ÑÑÐ¸: ${JSON.stringify(p.nutrition)}\n`;
    }
    if (p.description) info += `   ÐÐ¿Ð¸ÑÐ°Ð½Ð¸Ðµ: ${p.description.substring(0, 250)}\n`;
    info += `   ÐÐ¸Ð½Ðº: ${p.url}\n`;
    return info;
  }).join('\n');
}

// --- Gemini AI Chat ---
function callGemini(systemPrompt, messages) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return reject(new Error('GEMINI_API_KEY not configured'));

    // Convert chat messages to Gemini format
    const geminiMessages = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    const body = JSON.stringify({
      system_instruction: {
        parts: [{ text: systemPrompt }]
      },
      contents: geminiMessages,
      generationConfig: {
        maxOutputTokens: 1024,
        temperature: 0.7,
      }
    });

    const options = {
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) {
            reject(new Error(json.error.message || 'Gemini API error'));
          } else if (json.candidates && json.candidates[0]?.content?.parts?.[0]?.text) {
            resolve(json.candidates[0].content.parts[0].text);
          } else {
            reject(new Error('Unexpected Gemini response format'));
          }
        } catch (e) {
          reject(new Error('Failed to parse Gemini response'));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('API timeout')); });
    req.write(body);
    req.end();
  });
}

const SYSTEM_PROMPT = `Ð¢Ð¸ ÑÐ¸ Ð¿ÑÐ¸ÑÑÐµÐ»ÑÐºÐ¸ Ð¸ Ð¿Ð¾Ð»ÐµÐ·ÐµÐ½ AI Ð°ÑÐ¸ÑÑÐµÐ½Ñ Ð½Ð° Ð¾Ð½Ð»Ð°Ð¹Ð½ Ð¼Ð°Ð³Ð°Ð·Ð¸Ð½ ÐÐÐÐÐ (zelen.bg) â Ð±ÑÐ»Ð³Ð°ÑÑÐºÐ¸ Ð¼Ð°Ð³Ð°Ð·Ð¸Ð½ Ð·Ð° Ð±Ð¸Ð¾ ÑÑÐ°Ð½Ð¸, ÑÑÐ¿ÐµÑÑÑÐ°Ð½Ð¸, Ð´Ð¾Ð±Ð°Ð²ÐºÐ¸, Ð½Ð°Ð¿Ð¸ÑÐºÐ¸ Ð¸ Ð±Ð¸Ð¾ ÐºÐ¾Ð·Ð¼ÐµÑÐ¸ÐºÐ°.

Ð¢ÐÐÐ¯Ð¢Ð Ð ÐÐÐ¯:
- ÐÐ¾Ð¼Ð°Ð³Ð°Ð¹ Ð½Ð° ÐºÐ»Ð¸ÐµÐ½ÑÐ¸ÑÐµ Ð´Ð° Ð½Ð°Ð¼ÐµÑÑÑ Ð¿Ð¾Ð´ÑÐ¾Ð´ÑÑÐ¸ Ð¿ÑÐ¾Ð´ÑÐºÑÐ¸ ÑÐ¿ÑÑÐ¼Ð¾ ÑÐµÑÐ½Ð¸ÑÐµ Ð½ÑÐ¶Ð´Ð¸
- ÐÐ°Ð²Ð°Ð¹ Ð¿ÑÐµÐ¿Ð¾ÑÑÐºÐ¸ Ð²ÑÐ· Ð¾ÑÐ½Ð¾Ð²Ð° Ð½Ð° ÑÑÐ°Ð½Ð¸ÑÐµÐ»Ð½Ð¸ ÑÑÐ¾Ð¹Ð½Ð¾ÑÑÐ¸, Ð´Ð¸ÐµÑÐ¸ÑÐ½Ð¸ Ð¿ÑÐµÐ´Ð¿Ð¾ÑÐ¸ÑÐ°Ð½Ð¸Ñ Ð¸ Ð·Ð´ÑÐ°Ð²Ð¾ÑÐ»Ð¾Ð²Ð½Ð¸ ÑÐµÐ»Ð¸
- ÐÑÐ³Ð¾Ð²Ð°ÑÑÐ¹ Ð½Ð° Ð²ÑÐ¿ÑÐ¾ÑÐ¸ Ð·Ð° Ð¿ÑÐ¾Ð´ÑÐºÑÐ¸ÑÐµ, Ð´Ð¾ÑÑÐ°Ð²ÐºÐ°ÑÐ° Ð¸ Ð¼Ð°Ð³Ð°Ð·Ð¸Ð½Ð°
- ÐÑÐ´Ð¸ ÑÐ¾Ð¿ÑÐ», Ð¿ÑÐ¸ÑÑÐµÐ»ÑÐºÐ¸ Ð½Ð°ÑÑÑÐ¾ÐµÐ½ Ð¸ ÐµÐºÑÐ¿ÐµÑÑÐµÐ½

ÐÐÐÐÐ ÐÐ ÐÐÐÐÐ:
1. ÐÐ¾Ð³Ð°ÑÐ¾ Ð¿ÑÐµÐ¿Ð¾ÑÑÑÐ²Ð°Ñ Ð¿ÑÐ¾Ð´ÑÐºÑ, ÐÐÐÐÐÐ Ð²ÐºÐ»ÑÑÐ²Ð°Ð¹ Ð»Ð¸Ð½Ðº ÐºÑÐ¼ Ð½ÐµÐ³Ð¾
2. ÐÐ¾Ð³Ð°ÑÐ¾ ÐºÐ»Ð¸ÐµÐ½ÑÑÑ Ð¿Ð¸ÑÐ° Ð·Ð° Ð½Ð¸ÑÐºÐ¾ÐºÐ°Ð»Ð¾ÑÐ¸ÑÐ½Ð¸/Ð²Ð¸ÑÐ¾ÐºÐ¾Ð¿ÑÐ¾ÑÐµÐ¸Ð½Ð¾Ð²Ð¸/Ð±ÐµÐ·Ð³Ð»ÑÑÐµÐ½Ð¾Ð²Ð¸ Ð¸ Ñ.Ð½. Ð¿ÑÐ¾Ð´ÑÐºÑÐ¸, Ð¸Ð·Ð¿Ð¾Ð»Ð·Ð²Ð°Ð¹ Ð´Ð°Ð½Ð½Ð¸ÑÐµ Ð¾Ñ ÑÑÐ°Ð½Ð¸ÑÐµÐ»Ð½Ð¸ÑÐµ ÑÑÐ¾Ð¹Ð½Ð¾ÑÑÐ¸ Ð·Ð° Ð¿ÑÐµÑÐ¸Ð·Ð½Ð¸ Ð¿ÑÐµÐ¿Ð¾ÑÑÐºÐ¸
3. ÐÑÐ³Ð¾Ð²Ð°ÑÑÐ¹ Ð½Ð° ÐµÐ·Ð¸ÐºÐ° Ð½Ð° ÐºÐ»Ð¸ÐµÐ½ÑÐ° â Ð°ÐºÐ¾ Ð¿Ð¸ÑÐµ Ð½Ð° Ð±ÑÐ»Ð³Ð°ÑÑÐºÐ¸, Ð¾ÑÐ³Ð¾Ð²Ð°ÑÑÐ¹ Ð½Ð° Ð±ÑÐ»Ð³Ð°ÑÑÐºÐ¸; Ð°ÐºÐ¾ Ð½Ð° Ð°Ð½Ð³Ð»Ð¸Ð¹ÑÐºÐ¸ â Ð½Ð° Ð°Ð½Ð³Ð»Ð¸Ð¹ÑÐºÐ¸
4. ÐÐºÐ¾ Ð½Ðµ Ð·Ð½Ð°ÐµÑ Ð¾ÑÐ³Ð¾Ð²Ð¾ÑÐ° Ð½Ð° Ð½ÐµÑÐ¾ ÑÐ¿ÐµÑÐ¸ÑÐ¸ÑÐ½Ð¾ Ð·Ð° Ð¼Ð°Ð³Ð°Ð·Ð¸Ð½Ð° (Ð´Ð¾ÑÑÐ°Ð²ÐºÐ°, Ð¿Ð¾Ð»Ð¸ÑÐ¸ÐºÐ° Ð·Ð° Ð²ÑÑÑÐ°Ð½Ðµ Ð¸ Ñ.Ð½.), Ð½Ð°ÑÐ¾ÑÐ¸ ÐºÐ»Ð¸ÐµÐ½ÑÐ° ÐºÑÐ¼ ÐºÐ¾Ð½ÑÐ°ÐºÑ: ÑÐµÐ»ÐµÑÐ¾Ð½ 0879368774
5. ÐÐ Ð¸Ð·Ð¼Ð¸ÑÐ»ÑÐ¹ Ð¿ÑÐ¾Ð´ÑÐºÑÐ¸ â Ð¿ÑÐµÐ¿Ð¾ÑÑÑÐ²Ð°Ð¹ Ð¡ÐÐÐ Ð¿ÑÐ¾Ð´ÑÐºÑÐ¸ Ð¾Ñ Ð¿ÑÐµÐ´Ð¾ÑÑÐ°Ð²ÐµÐ½Ð¸ÑÐµ Ð´Ð°Ð½Ð½Ð¸
6. ÐÑÐ´Ð¸ ÐºÑÐ°ÑÑÐº Ð½Ð¾ Ð¿Ð¾Ð»ÐµÐ·ÐµÐ½ â Ð½Ðµ Ð´Ð°Ð²Ð°Ð¹ ÑÑÐµÐ½Ð¸ Ð¾Ñ ÑÐµÐºÑÑ
7. ÐÐ¾Ð¶ÐµÑ4-4,4/ô`4-t-4.ô/´-´.4b4-4/ËM4/ô`4/´-4`ô.´`´,4/t,4,´-t-4/tb´-4/´`t,´-t/H4,4.´/4.´.ô.4-t/t`´b´`4/t-H4/ô/´.4`t.´,4/ô/´,´-taô-B´&4't)4'´(4'4$4)´&4+È4%ô$4'4$4$ô$4%ô&4't$H4(ô-t,t`t,4.t`[[ÂH4(´-t.ô-ta4/´/NÎLÍÍÍH4'ô`4-t-4.ô,4,ô,4`4,t.4/4at`4,4/t.4`t`ô/ô-t`4at`4,4/t.4.4-4/´,t,4,´.´.4/t,4/ô.4`´.´.4,t.4/4.´/´-ô/4-t`´.4.´,4.4-4`4/´,ô-t`4.4cÂH4&4/4,4`4a4.4-ô.4aô-t`t.´.4/4,4,ô,4-ô.4/t.4,4$tb´.ô,ô,4`4.4cÂH4&´,4`´,4.ô/´,Î4/t,4-4/ô`4/´-4`ô.´`´,´)4'´(4'4$4(4't$4'´(´$ô'´$´'´(´&´/´,ô,4`´/4/ô`4-t/ô/´`4b´aô,´,4b4/ô`4/´-4`ô.´`´.4.4-ô/ô/´.ô-ô,´,4.H4`´/´-ô.4a4/´`4/4,4`´&4/4-H4/t,4/ô`4/´-4`ô.´`´,
8 %4.´`4,4`´.´/4/´/ô.4`t,4/t.4-H4-ô,4bt/4-H4/ô/´-4at/´-4côbB´)´-t/t,4.ô,ô$´.4-4/ô`4/´-4`ô.´`´,J4.ô.4/t.XÂËÈÝÜHÛÛ\Ø][Û\ÝÜH\Ù\ÜÚ[ÛÛÛÝÙ\ÜÚ[ÛÈH]ÈX\

NÂÛÛÝÑTÔÒSÓÕSQSÕUHÌ

LÈËÈÌZ[]\Â[Ý[ÛÙ]Ù\ÜÚ[ÛÙ\ÜÚ[ÛY
HÂY
\Ù\ÜÚ[ÛË\ÊÙ\ÜÚ[ÛY
JHÂÙ\ÜÚ[ÛËÙ]
Ù\ÜÚ[ÛYÂY\ÜØYÙ\Î×KÜX]Y]]KÝÊ
K\ÝXÝ]]N]KÝÊ
BJNÂBÛÛÝÙ\ÜÚ[ÛHÙ\ÜÚ[ÛËÙ]
Ù\ÜÚ[ÛY
NÂÙ\ÜÚ[Û\ÝXÝ]]HH]KÝÊ
NÂ]\Ù\ÜÚ[ÛÂBËÈÛX[\ÛÙ\ÜÚ[ÛÈ\[ÙXØ[BÙ][\[


HOÂÛÛÝÝÈH]KÝÊ
NÂÜ
ÛÛÝÚYÙ\ÜÚ[ÛHÙÙ\ÜÚ[ÛÊHÂY
ÝÈHÙ\ÜÚ[Û\ÝXÝ]]HÑTÔÒSÓÕSQSÕU
HÂÙ\ÜÚ[ÛË[]JY
NÂBBKH

L
NÂËÈKKHTHÝ]\ÈKKBËÈÚ][Ú[\ÜÝ
	ËØ\KØÚ]	Ë\Þ[È
\K\ÊHOÂHÂÛÛÝÈY\ÜØYÙKÙ\ÜÚ[ÛYH	ÙY][	ÈHH\KÙNÂY
[Y\ÜØYÙH\[ÙY\ÜØYÙHOOH	ÜÝ[ÉÊHÂ]\\ËÝ]\Ê
KÛÛÈ\Ü	ÓY\ÜØYÙH\È\]Z\Y	ÈJNÂBY
\ØÙ\ÜË[ÑSRSWÐTWÒÑVJHÂ]\\ËÝ]\ÊL
KÛÛÂ\Ü	ÐTHÙ^HÝÛÛYÝ\Y	Ë\N	ô)ô,4`´,t/´`´b´`4/t-H4-H4.´/´/ta4.4,ô`ô`4.4`4,4/H4/ô`4,4,´.4.ô/t/4'4/´.ôcË4`t,´b´`4-´-t`´-H4`t-H4`H4/t,4`H4/t,ÎLÍÍÍÂJNÂBÛÛÝÙ\ÜÚ[ÛHÙ]Ù\ÜÚ[ÛÙ\ÜÚ[ÛY
NÂËÈÙX\ÚÜ[][ÙXÝÈ\ÙYÛHY\ÜØYÙBÛÛÝÙXÝÛÛ^HÙ]ÙXÝXÛÛ[Y[][ÛÛÛ^
Y\ÜØYÙJNÂËÈZ[H\Ù\Y\ÜØYÙHÚ]ÙXÝÛÛ^ÛÛÝ[[ÙYY\ÜØYÙHHÙXÝÛÛ^	ÙXÝÛÛ^OOH	ô't-H4,tcôat,4/t,4/4-t`4-t/t.4/ô/´-4at/´-4côbt.4/ô`4/´-4`ô.´`´.ÂÈ4&´.ô.4-t/t`´`t.´/4-ô,4/ô.4`´,´,4/t-NÛY\ÜØYÙ_H´'t,4/4-t`4-t/t.4/ô/´-4at/´-4côbt.4/ô`4/´-4`ô.´`´.4/´`4.´,4`´,4.ô/´,ô,ÜÙXÝÛÛ^W´&4-ô/ô/´.ô-ô,´,4.H4,ô/´`4/t.4`´-H4-4,4/t/t.4-ô,4/ô`4/´-4`ô.´`´.4`´-K4-ô,4-4,4/´`´,ô/´,´/´`4.4b4/t,4.´.ô.4-t/t`´,4'ô`4-t/ô/´`4b´aô,4.H4/t,4.Kt/ô/´-4at/´-4côbt.4`´-K4&´.ô.4-t/t`´`t.´/4-ô,4/ô.4`´,´,4/t-NÛY\ÜØYÙ_H4'tcô/4,4-4.4`4-t.´`´/t/4`tb´,´/ô,4-4,4bt.4/ô`4/´-4`ô.´`´.4,4.´,4`´,4.ô/´,ô,4-ô,4`´,4-ô.4-ô,4cô,´.´,4'´`´,ô/´,´/´`4.4/t,4.Kt-4/´,t`4-H4.´,4.´`´/4/4/´-´-tb4.4/ô`4-t-4.ô/´-´.4,4.ô`´-t`4/t,4`´.4,´.4,4.´/4-H4`ô/4-t`t`´/t/XÂËÈYÈÛÛ\Ø][Û\ÝÜBÙ\ÜÚ[ÛY\ÜØYÙ\Ë\Ú
ÈÛN	Ý\Ù\ËÛÛ[[[ÙYY\ÜØYÙHJNÂËÈÙY\ÛH\ÝLY\ÜØYÙ\ÈÜÛÛ^Y
Ù\ÜÚ[ÛY\ÜØYÙ\Ë[Ý
HÂÙ\ÜÚ[ÛY\ÜØYÙ\ÈHÙ\ÜÚ[ÛY\ÜØYÙ\ËÛXÙJL
NÂBÛÛÝ\HH]ØZ]Ø[Ù[Z[JÖTÕSWÔÓTÙ\ÜÚ[ÛY\ÜØYÙ\ÊNÂËÈÝÜH\ÜÚ\Ý[\ÜÛÙBÙ\ÜÚ[ÛY\ÜØYÙ\Ë\Ú
ÈÛN	Ø\ÜÚ\Ý[	ËÛÛ[\HJNÂ\ËÛÛÂ\KÙ\ÜÚ[ÛYÙXÝÑÝ[ÙX\ÚÙXÝÊY\ÜØYÙKÊK[ÝJNÂHØ]Ú
\HÂÛÛÛÛK\Ü	ÐÚ]\ÜË\Y\ÜØYÙJNÂ\ËÝ]\ÊL
KÛÛÂ\Ü	ÐÚ]\ÜË\N	ô(tb´-´,4.ôcô,´,4/4,´b´-ô/t.4.´/t,4,ô`4-tb4.´,4'4/´.ôcË4/´/ô.4`´,4.t`´-H4/´`´/t/´,´/4.4.ô.4`t-H4`t,´b´`4-´-t`´-H4`H4/t,4`H4/t,ÎLÍÍÍÂJNÂBJNÂËÈÙXÝÙX\Ú[Ú[
Ü\XÝÙX\ÚÚ]Ý]RJB\Ù]
	ËØ\KÜÙXÝËÜÙX\Ú	Ë
\K\ÊHOÂÛÛÝÈK[Z]HHHH\K]Y\NÂY
\JH]\\ËÝ]\Ê
KÛÛÈ\Ü	Ô]Y\H\[Y]\H\È\]Z\Y	ÈJNÂÛÛÝ\Ý[ÈHÙX\ÚÙXÝÊK\ÙR[
[Z]
JNÂ\ËÛÛÈ\Ý[ËÛÝ[\Ý[Ë[ÝJNÂJNÂËÈÙXÝYÜÈ[Ú[\Ù]
	ËØ\KÜÙXÝËÝYÜÉË
\K\ÊHOÂÛÛÝYÐÛÝ[ÈHßNÂÙXÝËÜXXÚ
O
YÜÈ×JKÜXXÚ
OYÐÛÝ[ÖÝHH
YÐÛÝ[ÖÝH
H
ÈJJNÂ\ËÛÛYÐÛÝ[ÊNÂJNÂËÈX[ÚXÚÂ\Ù]
	ËØ\KÚX[	Ë
\K\ÊHOÂ\ËÛÛÂÝ]\Î	ÛÚÉËÙXÝÎÙXÝË[ÝZN	ÙÙ[Z[KLKY\Ú	Ë\[YNØÙ\ÜË\[YJ
BJNÂJNÂËÈÝ[[ÛHÚ]YÙB\Ù]
	ËÉË
\K\ÊHOÂ\ËÙ[[J]Ú[×Ù\[YK	ÜXXÉË	Ú[^[	ÊJNÂJNÂËÈÚYÙ]Â\Ù]
	ËÝÚYÙ]ÉË
\K\ÊHOÂ\ËÙ]XY\	ÐÛÛ[U\IË	Ø\XØ][ÛÚ]\ØÜ\	ÊNÂ\ËÙ[[J]Ú[×Ù\[YK	ÜXXÉË	ÝÚYÙ]ÉÊJNÂJNÂËÈKKHÝ\Ù\\KKBØYÙXÝÊ
NÂ\\Ý[Ô

HOÂÛÛÛÛKÙÊ¼'ã/È[[ÈÚ]ÝÙ\\
Ù[Z[HRJX
NÂÛÛÛÛKÙÊÝ[[ÛHYÙNËÛØØ[ÜÝÔÔX
NÂÛÛÛÛKÙÊÚYÙ]ØÜ\ËÛØØ[ÜÝÔÔKÝÚYÙ]Ø
NÂÛÛÛÛKÙÊTH[Ú[ËÛØØ[ÜÝÔÔKØ\KØÚ]
NÂÛÛÛÛKÙÊÙXÝÈØYY	ÜÙXÝË[ÝX
NÂÛÛÛÛKÙÊRH[Ù[Ù[Z[HH\Ú
NÂJNÂ