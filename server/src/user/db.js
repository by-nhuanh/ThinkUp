import { MongoClient } from 'mongodb';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import MailComposer from 'nodemailer/lib/mail-composer/index.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
try {
  dotenv.config({ path: path.resolve(__dirname, '../../../server/.env'), quiet: true });
} catch {
  dotenv.config({ quiet: true });
}

let _mongoClient = null;
let _mongoDb = null;

/**
 * Lấy kết nối cơ sở dữ liệu MongoDB (Singleton).
 */
export async function getMongoDb(customUri, customDbName) {
  if (_mongoDb) return _mongoDb;

  const uri = customUri || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/thinkup_db';
  const dbName = customDbName || process.env.MONGODB_DB_NAME || 'Thinkup';

  _mongoClient = new MongoClient(uri);
  await _mongoClient.connect();
  _mongoDb = _mongoClient.db(dbName);

  try {
    await _mongoDb.collection('users').createIndex({ email: 1 }, { unique: true, sparse: true });
    await _mongoDb.collection('users').createIndex({ phone: 1 }, { unique: true, sparse: true });
    await _mongoDb.collection('otps').createIndex({ email: 1, purpose: 1 });
  } catch {
    // Bỏ qua lỗi tạo index nếu đã tồn tại
  }

  return _mongoDb;
}

export async function closeMongoDb() {
  if (_mongoClient) {
    await _mongoClient.close();
    _mongoClient = null;
    _mongoDb = null;
  }
}

export function getJwtSecret() {
  return process.env.JWT_SECRET || 'thinkup_super_secret_jwt_key_development_2026_change_in_production';
}

export function signJwt(payload, expiresIn = '24h') {
  return jwt.sign(payload, getJwtSecret(), { expiresIn });
}

export function verifyJwt(token) {
  try {
    return jwt.verify(token, getJwtSecret());
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      const e = new Error('Mã liên kết hoặc phiên đã hết hạn. Vui lòng thử lại.');
      e.code = 'TOKEN_EXPIRED';
      e.status = 400;
      throw e;
    }
    const e = new Error('Mã liên kết hoặc phiên không hợp lệ.');
    e.code = 'TOKEN_INVALID';
    e.status = 400;
    throw e;
  }
}

export function maskEmail(email) {
  if (!email || !email.includes('@')) return email;
  const [local, domain] = email.split('@');
  if (local.length <= 1) return `*@${domain}`;
  return `${local[0]}***@${domain}`;
}

async function sendViaGmailRestApi({ clientId, clientSecret, refreshToken, from, to, subject, html, text }) {
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  const tokenData = await tokenRes.json();
  if (!tokenRes.ok || !tokenData.access_token) {
    throw new Error(`Gmail OAuth2 Token Error: ${tokenData.error_description || tokenData.error || 'Failed to refresh token'}`);
  }

  const mail = new MailComposer({ from, to, subject, html, text });
  const compiled = await mail.compile().build();
  const raw = Buffer.from(compiled).toString('base64url');

  const sendRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  });

  const sendData = await sendRes.json();
  if (!sendRes.ok) {
    throw new Error(`Gmail REST API Error: ${sendData.error?.message || 'Send message failed'}`);
  }

  return { accepted: [to], messageId: sendData.id, response: '250 2.0.0 OK (Gmail REST API HTTPS 443)' };
}

export async function sendEmail({ to, subject, html, text }) {
  const user = process.env.SMTP_USER || process.env.GMAIL_USER;
  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN || process.env.GMAIL_REFRESH_TOKEN;
  const from = process.env.SMTP_FROM || (user ? `"ThinkUp" <${user}>` : '"ThinkUp" <noreply@thinkup.vn>');

  // 1. Ưu tiên: Sử dụng Google Gmail REST API qua cổng HTTPS 443 (100% không bị Railway / ISP chặn SMTP timeout)
  if (clientId && clientSecret && refreshToken) {
    try {
      return await sendViaGmailRestApi({ clientId, clientSecret, refreshToken, from, to, subject, html, text });
    } catch (apiErr) {
      console.warn('[Gmail REST API] Warning:', apiErr.message, '-> Fallback to SMTP...');
    }
  }

  // 2. Dự phòng: Sử dụng SMTP truyền thống (Gmail App Password, Brevo, Resend...)
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    return { sent: false, reason: 'Email transport not configured (missing OAuth2 or SMTP credentials)' };
  }

  const isGmail = host.includes('gmail');
  const transporter = nodemailer.createTransport({
    ...(isGmail ? { service: 'gmail' } : { host, port }),
    secure: port === 465,
    auth: { user, pass },
    tls: {
      rejectUnauthorized: false,
    },
    connectionTimeout: 10000,
    greetingTimeout: 5000,
    socketTimeout: 15000,
  });

  return await transporter.sendMail({ from, to, subject, html, text });
}
