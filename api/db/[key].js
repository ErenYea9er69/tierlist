import { neon } from '@neondatabase/serverless';

// --- SECURITY: Allowed keys whitelist ---
// Only these exact DB keys can ever be read or written.
// This prevents attackers from reading/writing arbitrary keys.
const ALLOWED_KEYS = new Set(['tierlist_users']);

// --- SECURITY: Max payload size (500KB) ---
const MAX_PAYLOAD_BYTES = 500 * 1024;

// --- SECURITY: Sanitize user data before storing ---
function sanitizeUserData(data) {
  if (typeof data !== 'object' || data === null) return {};

  const VALID_TIERS = ["GOAT", "THAMER", "IMT3NA", "MNAYEK 3LA ROU7O", "L7AS Y LATIF", "MLA 3OS", "unranked"];
  const VALID_ITEMS_REGEX = /^\/items\/\d{1,2}\.webp$/;
  const MAX_MESSAGE_LENGTH = 250;
  const MAX_BASE64_LENGTH = 100000; // ~75KB per meme image
  const MAX_USERS = 5000;
  const USER_ID_REGEX = /^anon_[a-z0-9]{5,10}$/;

  const sanitized = {};
  let userCount = 0;

  for (const [userId, userData] of Object.entries(data)) {
    // SECURITY: Only allow valid anonymous user IDs
    if (!USER_ID_REGEX.test(userId)) continue;
    // SECURITY: Cap the number of users stored
    if (userCount >= MAX_USERS) break;
    userCount++;

    if (typeof userData !== 'object' || userData === null) continue;

    const cleanUser = {};

    // --- Sanitize tierList ---
    if (userData.tierList && typeof userData.tierList === 'object') {
      cleanUser.tierList = {};
      for (const tier of VALID_TIERS) {
        if (Array.isArray(userData.tierList[tier])) {
          // Only allow valid item paths
          cleanUser.tierList[tier] = userData.tierList[tier].filter(
            img => typeof img === 'string' && VALID_ITEMS_REGEX.test(img)
          );
        } else {
          cleanUser.tierList[tier] = [];
        }
      }
    }

    // --- Sanitize truth (memes) ---
    if (userData.truth && typeof userData.truth === 'object') {
      cleanUser.truth = {};
      for (const [itemKey, base64Val] of Object.entries(userData.truth)) {
        // Only allow valid item keys, and only data: URIs under size limit
        if (
          VALID_ITEMS_REGEX.test(itemKey) &&
          typeof base64Val === 'string' &&
          base64Val.startsWith('data:image/') &&
          base64Val.length <= MAX_BASE64_LENGTH
        ) {
          cleanUser.truth[itemKey] = base64Val;
        }
      }
    }

    // --- Sanitize messages ---
    if (userData.messages && typeof userData.messages === 'object') {
      cleanUser.messages = {};
      for (const [itemKey, msg] of Object.entries(userData.messages)) {
        if (
          VALID_ITEMS_REGEX.test(itemKey) &&
          typeof msg === 'string' &&
          msg.length <= MAX_MESSAGE_LENGTH
        ) {
          // SECURITY: Strip HTML tags and dangerous characters to prevent XSS
          cleanUser.messages[itemKey] = msg
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/`/g, '&#96;');
        }
      }
    }

    // --- Sanitize timestamp ---
    if (typeof userData.ts === 'number' && userData.ts > 0) {
      cleanUser.ts = userData.ts;
    }

    sanitized[userId] = cleanUser;
  }

  return sanitized;
}

export default async function handler(req, res) {
  // --- SECURITY: CORS locked to your domain in production ---
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

  const { key } = req.query;

  // --- SECURITY: Key whitelist check ---
  if (!key || !ALLOWED_KEYS.has(key)) {
    return res.status(403).json({ error: 'Forbidden: invalid key' });
  }

  // --- SECURITY: Payload size limit for POST ---
  if (req.method === 'POST') {
    const bodyStr = JSON.stringify(req.body);
    if (bodyStr && bodyStr.length > MAX_PAYLOAD_BYTES) {
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
      const jsonValue = typeof value === 'string' ? JSON.parse(value) : value;

      // --- SECURITY: Deep-sanitize all user data before storing ---
      const cleanData = sanitizeUserData(jsonValue);

      await sql`
        INSERT INTO kv_store (key, value)
        VALUES (${key}, ${JSON.stringify(cleanData)}::jsonb)
        ON CONFLICT (key)
        DO UPDATE SET value = ${JSON.stringify(cleanData)}::jsonb
      `;
      res.json({ success: true });
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (err) {
    // --- SECURITY: Never leak internal error details to the client ---
    console.error('DB Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
