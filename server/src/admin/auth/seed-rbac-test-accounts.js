import crypto from 'crypto';
import { getMongoDb } from '../../user/db.js';

const dbName = process.env.MONGODB_DB_NAME || '';
if (!dbName.startsWith('ThinkUp_admin_auth_test_')) {
  throw new Error('Refusing to create accounts: MONGODB_DB_NAME must use the isolated ThinkUp_admin_auth_test_ prefix.');
}

const db = await getMongoDb();
const admins = db.collection('admins');
const roles = [
  { role: 'SA', full_name: 'RBAC Test Super Admin' },
  { role: 'CA', full_name: 'RBAC Test Content Admin' },
  { role: 'FA', full_name: 'RBAC Test Finance Admin' },
  { role: 'CS', full_name: 'RBAC Test Customer Support' },
];
const now = new Date();
const accounts = roles.map(({ role, full_name }) => ({
  email: `rbac-${role.toLowerCase()}@test.invalid`,
  full_name,
  role,
  status: 'INVITED',
  is_active: false,
  invite_token: crypto.randomBytes(32).toString('hex'),
  invite_expires_at: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
  onboarding_step: 'INVITED',
  created_at: now,
  updated_at: now,
}));

const emails = accounts.map(account => account.email);
const existing = await admins.find({ email: { $in: emails } }, { projection: { email: 1 } }).toArray();
if (existing.length) {
  throw new Error(`Refusing partial or destructive reseed; these test accounts already exist: ${existing.map(item => item.email).join(', ')}`);
}

await admins.insertMany(accounts);
for (const account of accounts) {
  console.log(`${account.role}\t${account.email}\t${account.invite_token}`);
}
console.log('Created four first-login invitation accounts. Tokens are valid for seven days.');
process.exit(0);

