import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { generateKeyPairSync } from 'node:crypto';
import { getMongoDb, closeMongoDb } from '../../db.js';
import {
  loginWithCredentials,
  loginWithGoogle,
  loginWithFacebook,
  getCurrentUser,
  verifyAuthSession,
} from '../signin.user.js';

test('TestSuite: Đăng Nhập Học Viên với Database Thật (MongoDB Atlas)', async (t) => {
  let db;
  const sampleEmail = 'test_signin_sample@thinkup.vn';
  const samplePhone = `09${String(Date.now()).slice(-8)}`;
  const cleanFixtures = async () => {
    const users = await db.collection('users').find({ email: /^test_signin_/ }, { projection: { _id: 1 } }).toArray();
    const userIds = users.map(user => String(user._id));
    if (userIds.length) {
      await Promise.all([
        db.collection('user_sessions').deleteMany({ user_id: { $in: userIds } }),
        db.collection('security_audit_logs').deleteMany({ user_id: { $in: userIds } }),
        db.collection('notifications').deleteMany({ user_id: { $in: userIds } }),
      ]);
    }
    await db.collection('users').deleteMany({ email: /^test_signin_/ });
  };

  t.before(async () => {
    db = await getMongoDb();
    await cleanFixtures();
  });

  t.after(async () => {
    if (db) {
      await cleanFixtures();
    }
    await closeMongoDb();
  });

  t.beforeEach(async () => {
    // Reset học viên mẫu trong DB thật trước mỗi test
    await cleanFixtures();
    const hash = await bcrypt.hash('CorrectPass123!', 12);
    await db.collection('users').insertOne({
      full_name: 'Học Viên Mẫu Live',
      email: sampleEmail,
      phone: samplePhone,
      password_hash: hash,
      provider: 'local',
      role: 'student',
      status: 'active',
      is_active: true,
      email_verified: true,
      onboarding_completed: true,
      failed_login_attempts: 0,
      locked_until: null,
      created_at: new Date(),
    });
  });

  await t.test('AC-07 & AC-08: Bảo mật phản hồi lỗi trên DB thật (Post-Submit Obfuscation)', async () => {
    // 1. Sai email (không tồn tại)
    await assert.rejects(
      async () => {
        await loginWithCredentials({ email: 'test_signin_nonexistent@thinkup.vn', password: 'AnyPassword123!' }, { db });
      },
      (err) => err.status === 401 && err.message === 'Email hoặc mật khẩu không chính xác. Vui lòng kiểm tra lại!'
    );

    // 2. Đúng email nhưng sai mật khẩu
    await assert.rejects(
      async () => {
        await loginWithCredentials({ email: sampleEmail, password: 'WrongPassword123!' }, { db });
      },
      (err) => err.status === 401 && err.message === 'Email hoặc mật khẩu không chính xác. Vui lòng kiểm tra lại!'
    );
  });

  await t.test('AC-09: Cơ chế chống dò quét mật khẩu Brute-force trên DB thật (BR-AUTH-03)', async () => {
    // Nhập sai 4 lần
    for (let i = 1; i <= 4; i++) {
      await assert.rejects(
        async () => {
          await loginWithCredentials({ email: sampleEmail, password: 'WrongPassword!' }, { db });
        },
        (err) => err.status === 401
      );
    }

    // Lần thứ 5 sai -> Phải kích hoạt khóa 15 phút (BRUTE_FORCE_LOCKED)
    await assert.rejects(
      async () => {
        await loginWithCredentials({ email: sampleEmail, password: 'WrongPassword!' }, { db });
      },
      (err) =>
        err.status === 403 &&
        err.code === 'BRUTE_FORCE_LOCKED' &&
        err.message.includes('Bạn đã nhập sai 5 lần. Vui lòng thử lại sau 15 phút')
    );

    // Kiểm tra DB thật đã cập nhật locked_until
    const userInDb = await db.collection('users').findOne({ email: sampleEmail });
    assert.strictEqual(userInDb.failed_login_attempts, 5);
    assert.ok(userInDb.locked_until);
  });

  await t.test('AC-17: Chính sách tài khoản bị vô hiệu hóa trên DB thật (ACCOUNT_SUSPENDED)', async () => {
    await db.collection('users').updateOne(
      { email: sampleEmail },
      { $set: { status: 'locked', is_active: false } }
    );

    await assert.rejects(
      async () => {
        await loginWithCredentials({ email: sampleEmail, password: 'CorrectPass123!' }, { db });
      },
      (err) =>
        err.status === 403 &&
        err.code === 'ACCOUNT_SUSPENDED' &&
        err.message.includes('Tài khoản của bạn đang bị tạm khóa. Vui lòng liên hệ support@thinkup.vn')
    );
  });

  await t.test('AC-01 & BR-AUTH-04: Đăng nhập thành công và Ghi nhớ đăng nhập trên DB thật', async () => {
    // Không tích Remember Me
    const resNoRemember = await loginWithCredentials(
      { email: sampleEmail, password: 'CorrectPass123!', rememberMe: false },
      { db }
    );
    assert.strictEqual(resNoRemember.message, 'Đăng nhập thành công!');
    assert.ok(resNoRemember.accessToken);
    assert.strictEqual(resNoRemember.user.email, sampleEmail);

    // Có tích Remember Me
    const resRemember = await loginWithCredentials(
      { email: sampleEmail, password: 'CorrectPass123!', rememberMe: true },
      { db }
    );
    assert.ok(resRemember.refreshToken);

    // Kiểm tra DB thật: failed_login_attempts đã được reset về 0 và có last_login_at
    const updatedUser = await db.collection('users').findOne({ email: sampleEmail });
    assert.strictEqual(updatedUser.failed_login_attempts, 0);
    assert.ok(updatedUser.last_login_at);
  });

  await t.test('AC-14: Google không tự liên kết theo email và tiếp tục đăng nhập sau khi tài khoản được nâng role', async () => {
    const clientId = 'thinkup-test-google-client';
    const previousClientId = process.env.GOOGLE_CLIENT_ID;
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const keyId = 'thinkup-test-google-key';
    const idToken = jwt.sign({ email: sampleEmail, email_verified: true, name: 'Google User', sub: 'gg_id_live_999' }, privateKey, {
      algorithm: 'RS256', keyid: keyId, audience: clientId, issuer: 'https://accounts.google.com', expiresIn: '1h',
    });
    const publicJwk = { ...publicKey.export({ format: 'jwk' }), kid: keyId, alg: 'RS256', use: 'sig' };
    process.env.GOOGLE_CLIENT_ID = clientId;
    const googleOptions = {
      db,
      fetch: async () => ({ ok: true, json: async () => ({ keys: [publicJwk] }) }),
    };
    try {
      await assert.rejects(() => loginWithGoogle({ idToken }, googleOptions), error => error.code === 'ACCOUNT_LINK_REQUIRED');
      assert.equal((await db.collection('users').findOne({ email: sampleEmail })).google_id, undefined);
      await db.collection('users').updateOne({ email: sampleEmail }, {
        $set: { google_id: 'gg_id_live_999', role: 'instructor', instructor_id: 'instructor-test-999' },
      });
      const ggRes = await loginWithGoogle({ idToken }, googleOptions);
      assert.strictEqual(ggRes.user.email, sampleEmail);
      assert.strictEqual(ggRes.user.role, 'instructor');
    } finally {
      if (previousClientId === undefined) delete process.env.GOOGLE_CLIENT_ID;
      else process.env.GOOGLE_CLIENT_ID = previousClientId;
    }

    const allUsers = await db.collection('users').find({ email: sampleEmail }).toArray();
    assert.strictEqual(allUsers.length, 1);
    assert.strictEqual(allUsers[0].google_id, 'gg_id_live_999');
  });

  await t.test('Lấy hồ sơ tài khoản hiện tại (getCurrentUser) trên DB thật', async () => {
    const user = await db.collection('users').findOne({ email: sampleEmail });
    const profile = await getCurrentUser(user._id.toString(), { db });

    assert.strictEqual(profile.user.name, 'Học Viên Mẫu Live');
    assert.strictEqual(profile.user.email, sampleEmail);
    assert.strictEqual(profile.user.password_hash, undefined);
  });

  await t.test('Xác nhận trạng thái đăng nhập cho Header (verifyAuthSession) trên DB thật', async () => {
    const loginRes = await loginWithCredentials(
      { email: sampleEmail, password: 'CorrectPass123!' },
      { db }
    );

    const sessionOk = await verifyAuthSession(loginRes.accessToken, { db });
    assert.strictEqual(sessionOk.isAuthenticated, true);
    assert.strictEqual(sessionOk.user.name, 'Học Viên Mẫu Live');
    assert.strictEqual(sessionOk.user.email, sampleEmail);

    const sessionBearer = await verifyAuthSession(`Bearer ${loginRes.accessToken}`, { db });
    assert.strictEqual(sessionBearer.isAuthenticated, true);

    const sessionInvalid = await verifyAuthSession('invalid.jwt.token', { db });
    assert.strictEqual(sessionInvalid.isAuthenticated, false);
    assert.strictEqual(sessionInvalid.user, null);

    const sessionEmpty = await verifyAuthSession('', { db });
    assert.strictEqual(sessionEmpty.isAuthenticated, false);
    assert.strictEqual(sessionEmpty.user, null);
  });
});
