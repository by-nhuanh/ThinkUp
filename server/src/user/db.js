import { MongoClient } from 'mongodb';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
try {
  dotenv.config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });
} catch {
  dotenv.config({ quiet: true });
}

import dns from 'node:dns';
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch {
  // Bỏ qua lỗi thiết lập DNS nếu môi trường không cho phép
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

let smtpTransporter;
let smtpConfigKey = '';

export async function sendEmail({ to, subject, html, text }) {
  const user = process.env.SMTP_USER || process.env.GMAIL_USER;
  const from = process.env.SMTP_FROM || (user ? `"ThinkUp" <${user}>` : '"ThinkUp" <noreply@thinkup.vn>');
  // Send mail directly via the configured SMTP transport.
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    return { sent: false, reason: 'Email transport not configured (missing OAuth2 or SMTP credentials)' };
  }

  const isGmail = host.includes('gmail');
  const nextSmtpConfigKey = JSON.stringify({ user, pass, host, port, isGmail });
  if (!smtpTransporter || smtpConfigKey !== nextSmtpConfigKey) {
    smtpTransporter?.close();
    smtpTransporter = nodemailer.createTransport({
      ...(isGmail ? { service: 'gmail' } : { host, port }),
      secure: port === 465,
      auth: { user, pass },
      tls: { rejectUnauthorized: false },
      connectionTimeout: 10000,
      greetingTimeout: 5000,
      socketTimeout: 15000,
      pool: true,
      maxConnections: 2,
      maxMessages: 100,
    });
    smtpConfigKey = nextSmtpConfigKey;
  }

  return await smtpTransporter.sendMail({ from, to, subject, html, text });
}
