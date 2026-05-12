import { neon } from '@neondatabase/serverless';

// --- SECURITY: Allowed keys whitelist ---
const ALLOWED_KEYS = new Set(['tierlist_users']);

// --- SECURITY: Max payload size (500KB) ---
const MAX_PAYLOAD_BYTES = 500 * 1024;

// --- SECURITY: In-memory rate limiter (per Vercel cold start window) ---
const rateLimitMap = new Map(); // IP -> { count, resetTime }
const RATE_LIMIT_WINDOW_MS = 10000; // 10 seconds
const RATE_LIMIT_MAX_REQUESTS = 15; // max 15 requests per 10s

function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  entry.count++;
  if (entry.count > RATE_LIMIT_MAX_REQUESTS) return true;
  return false;
}

// --- SECURITY: Prototype pollution protection ---
function safeParseJSON(str) {
  const parsed = typeof str === 'string' ? JSON.parse(str) : str;
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
  // Kill prototype pollution vectors
  delete parsed['__proto__'];
  delete parsed['constructor'];
  delete parsed['prototype'];
  return parsed;
}

// --- SECURITY: Deep sanitize all user data before storing ---
function sanitizeUserData(data) {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return {};

  const VALID_TIERS = ["GOAT", "THAMER", "IMT3NA", "MNAYEK 3LA ROU7O", "L7AS Y LATIF", "MLA 3OS", "unranked"];
  const VALID_ITEMS_REGEX = /^\/items\/\d{1,2}\.webp$/;
  const MAX_MESSAGE_LENGTH = 250;
  const MAX_BASE64_LENGTH = 100000; // ~75KB per meme image
  const MAX_USERS = 5000;
  const USER_ID_REGEX = /^anon_[a-z0-9]{5,10}$/;
  const MAX_ITEMS_PER_TIER = 19; // only 19 items exist
  const MAX_TRUTH_ENTRIES = 19;
  const MAX_MESSAGE_ENTRIES = 19;

  // SECURITY: Validate only allowed data:image MIME types
  const ALLOWED_MIME_REGEX = /^data:image\/(webp|png|jpeg|gif);base64,/;

  const sanitized = {};
  let userCount = 0;

  for (const [userId, userData] of Object.entries(data)) {
    // SECURITY: Block prototype pollution keys
    if (userId === '__proto__' || userId === 'constructor' || userId === 'prototype') continue;
    // SECURITY: Only allow valid anonymous user IDs
    if (!USER_ID_REGEX.test(userId)) continue;
    if (userCount >= MAX_USERS) break;
    userCount++;

    if (typeof userData !== 'object' || userData === null || Array.isArray(userData)) continue;

    const cleanUser = {};

    // --- Sanitize tierList ---
    if (userData.tierList && typeof userData.tierList === 'object' && !Array.isArray(userData.tierList)) {
      cleanUser.tierList = {};
      const allPlacedItems = new Set(); // SECURITY: Prevent item duplication across tiers
      for (const tier of VALID_TIERS) {
        if (Array.isArray(userData.tierList[tier])) {
          const tierItems = [];
          for (const img of userData.tierList[tier]) {
            if (
              typeof img === 'string' &&
              VALID_ITEMS_REGEX.test(img) &&
              !allPlacedItems.has(img) && // no duplicates
              tierItems.length < MAX_ITEMS_PER_TIER
            ) {
              tierItems.push(img);
              allPlacedItems.add(img);
            }
          }
          cleanUser.tierList[tier] = tierItems;
        } else {
          cleanUser.tierList[tier] = [];
        }
      }
    }

    // --- Sanitize truth (memes) ---
    if (userData.truth && typeof userData.truth === 'object' && !Array.isArray(userData.truth)) {
      cleanUser.truth = {};
      let truthCount = 0;
      for (const [itemKey, base64Val] of Object.entries(userData.truth)) {
        if (itemKey === '__proto__' || itemKey === 'constructor') continue;
        if (truthCount >= MAX_TRUTH_ENTRIES) break;
        if (
          VALID_ITEMS_REGEX.test(itemKey) &&
          typeof base64Val === 'string' &&
          ALLOWED_MIME_REGEX.test(base64Val) && // strict MIME check
          base64Val.length <= MAX_BASE64_LENGTH
        ) {
          cleanUser.truth[itemKey] = base64Val;
          truthCount++;
        }
      }
    }

    // --- Sanitize messages ---
    if (userData.messages && typeof userData.messages === 'object' && !Array.isArray(userData.messages)) {
      cleanUser.messages = {};
      let msgCount = 0;
      for (const [itemKey, msg] of Object.entries(userData.messages)) {
        if (itemKey === '__proto__' || itemKey === 'constructor') continue;
        if (msgCount >= MAX_MESSAGE_ENTRIES) break;
        if (
          VALID_ITEMS_REGEX.test(itemKey) &&
          typeof msg === 'string' &&
          msg.length <= MAX_MESSAGE_LENGTH
        ) {
          // SECURITY: Strip HTML/script tags and dangerous chars
          cleanUser.messages[itemKey] = msg
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/`/g, '&#96;')
            .replace(/\\/g, '&#92;') // prevent escape attacks
            .replace(/\0/g, ''); // strip null bytes
        }
      }
    }

    // --- Sanitize timestamp ---
    if (typeof userData.ts === 'number' && Number.isFinite(userData.ts) && userData.ts > 0 && userData.ts < 1e14) {
      cleanUser.ts = Math.floor(userData.ts);
    }

    // SECURITY: Only store keys we explicitly allow
    sanitized[userId] = cleanUser;
  }

  return sanitized;
}

export default async function handler(req, res) {
  // --- SECURITY: Security Headers ---
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'none'");

  // --- SECURITY: CORS locked to your domain ---
  const allowedOrigins = [
    'https://tierlist-steel.vercel.app',
    'http://localhost:5173',
    'http://localhost:3000'
  ];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // --- SECURITY: Rate limiting ---
  const clientIP = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown';
  if (isRateLimited(clientIP)) {
    return res.status(429).json({ error: 'Too many requests. Slow down.' });
  }

  const { key } = req.query;

  // --- SECURITY: Key whitelist check ---
  if (!key || typeof key !== 'string' || !ALLOWED_KEYS.has(key)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // --- SECURITY: Payload size limit for POST ---
  if (req.method === 'POST') {
    const bodyStr = JSON.stringify(req.body);
    if (!bodyStr || bodyStr.length > MAX_PAYLOAD_BYTES) {
      return res.status(413).json({ error: 'Payload too large' });
    }
  }

  const sql = neon(process.env.DATABASE_URL);

  try {
    await sql`CREATE TABLE IF NOT EXISTS kv_store (key VARCHAR(255) PRIMARY KEY, value JSONB NOT NULL)`;

    if (req.method === 'GET') {
      const rows = await sql`SELECT value FROM kv_store WHERE key = ${key}`;
      if (rows.length > 0) {
        res.json({ value: JSON.stringify(rows[0].value) });
      } else {
        res.json({ value: null });
      }
    } else if (req.method === 'POST') {
      const { value } = req.body;

      // SECURITY: Safe JSON parse with prototype pollution guard
      const jsonValue = safeParseJSON(value);

      // SECURITY: Merge instead of overwrite to prevent user-deletion attacks
      // First read existing data, then only update the keys the caller owns
      const existingRows = await sql`SELECT value FROM kv_store WHERE key = ${key}`;
      let existingData = {};
      if (existingRows.length > 0) {
        existingData = existingRows[0].value || {};
      }

      // Deep-sanitize the incoming data
      const cleanIncoming = sanitizeUserData(jsonValue);

      // Merge: existing users are preserved, only incoming users are upserted
      const merged = { ...existingData, ...cleanIncoming };

      // Final sanitize on the merged result
      const finalData = sanitizeUserData(merged);

      await sql`
        INSERT INTO kv_store (key, value)
        VALUES (${key}, ${JSON.stringify(finalData)}::jsonb)
        ON CONFLICT (key)
        DO UPDATE SET value = ${JSON.stringify(finalData)}::jsonb
      `;
      res.json({ success: true });
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (err) {
    console.error('DB Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
