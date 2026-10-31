import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COLLECTION_CERTIFICATES,
  COLLECTION_COURSES,
  COLLECTION_USERS,
  COLLECTION_USER_PROGRESS,
  COLLECTION_USER_LESSON_PROGRESS,
  COLLECTION_ENROLLMENTS,
  COLLECTION_USER_COURSES,
  COLLECTION_LESSONS,
  formatVietnamVerificationTime,
  formatVietnamIssuedDate,
  formatEnglishIssuedDate,
  normalizeCertificateCode,
  buildCertificateQrUrl,
  generateCertificateCode,
  formatCertificateDto,
  verifyCertificateByCode,
  getCertificateDownload,
  getUserCertificates,
  issueCertificateForUser,
} from '../certificate.user.js';
import { getMongoDb, closeMongoDb } from '../../db.js';

test('Certificate Backend Service Test Suite (SPEC-CERT-MNG-01 & SPEC-CERT-VERIFY-01)', async (t) => {
  const db = await getMongoDb();
  const certColl = db.collection(COLLECTION_CERTIFICATES);

  const testUserId = 'test_user_cert_123456';
  const testCourseId = 'test_course_react_pro';
  const claimCourseId = 'course_ai_prompt_engineering';
  const ineligibleUserId = 'test_user_cert_ineligible';
  const unownedUserId = 'test_user_cert_unowned';
  const revokedUserId = 'test_user_cert_revoked';
  const newClaimUserId = 'test_user_cert_new_claim';
  const testCodeValid = 'TEST-CERT-2026';

  const cleanTestData = async () => {
    await Promise.all([
      certColl.deleteMany({ user_id: { $in: [testUserId, ineligibleUserId, unownedUserId, revokedUserId, newClaimUserId] } }),
      db.collection(COLLECTION_USERS).deleteMany({ id: { $in: [testUserId, ineligibleUserId, unownedUserId, revokedUserId, newClaimUserId] } }),
      db.collection(COLLECTION_COURSES).deleteMany({ course_id: claimCourseId }),
      db.collection(COLLECTION_LESSONS).deleteMany({ course_id: claimCourseId }),
      db.collection(COLLECTION_USER_LESSON_PROGRESS).deleteMany({ course_id: claimCourseId }),
      db.collection(COLLECTION_USER_PROGRESS).deleteMany({ course_id: claimCourseId }),
      db.collection(COLLECTION_ENROLLMENTS).deleteMany({ course_id: claimCourseId }),
      db.collection(COLLECTION_USER_COURSES).deleteMany({ course_id: claimCourseId }),
    ]);
  };

  // Dọn dẹp dữ liệu test trước khi thực hiện
  await cleanTestData();
  await certColl.deleteMany({ $or: [{ code: testCodeValid }, { code: 'MOCK-INVALID-CODE' }] });

  t.after(async () => {
    // Dọn dẹp dữ liệu test sau khi hoàn tất
    await cleanTestData();
    await certColl.deleteMany({ $or: [{ code: testCodeValid }, { code: 'MOCK-INVALID-CODE' }] });
    await closeMongoDb();
  });

  await t.test('1. Tiện ích thời gian & chuỗi chuẩn hóa', () => {
    // 1.1 Format thời gian theo giờ Việt Nam
    const sampleDate = new Date('2026-10-29T07:30:00.000Z'); // 07:30 UTC = 14:30 VN (UTC+7)
    const vnTime = formatVietnamVerificationTime(sampleDate);
    assert.equal(vnTime, '14:30 29/10/2026', 'Thời gian xác thực phải hiển thị theo đúng múi giờ Việt Nam');

    const vnIssued = formatVietnamIssuedDate(sampleDate);
    assert.equal(vnIssued, '29/10/2026', 'Ngày cấp dạng VN phải là dd/MM/yyyy');

    const enIssued = formatEnglishIssuedDate(sampleDate);
    assert.ok(enIssued.includes('2026'), 'Ngày cấp dạng tiếng Anh phải có năm');

    // 1.2 Chuẩn hóa mã chứng chỉ
    assert.equal(normalizeCertificateCode('  hop-le-123  '), 'HOP-LE-123', 'Mã chứng chỉ phải được trim và viết hoa');

    // 1.3 URL mã QR
    const qrUrl = buildCertificateQrUrl('HOP-LE-123');
    assert.ok(qrUrl.includes('/tra-cuu?code=HOP-LE-123'), 'URL mã QR phải trỏ tới trang /tra-cuu?code=...');

    // 1.4 Sinh mã ngẫu nhiên
    const code = generateCertificateCode();
    assert.match(code, /^[A-Z0-9]{4}-[A-Z0-9]{4}$/, 'Mã sinh ra phải có format XXXX-XXXX');
  });

  await t.test('2. Đồng nhất studentName và certificateName & Không xuất studentCode', () => {
    const rawDoc = {
      code: 'TEST-CODE-01',
      student_name: 'Trần Thị Mai',
      course_title: 'UI/UX Design Master',
      issued_at_vn: '20/10/2026',
      issued_at_en: 'Oct 20, 2026',
      status: 'valid',
      student_code: '098123456789', // Giả sử trong DB có lưu
    };

    const dto = formatCertificateDto(rawDoc);
    assert.equal(dto.studentName, 'Trần Thị Mai');
    assert.equal(dto.certificateName, 'Trần Thị Mai', 'studentName và certificateName bắt buộc phải giống nhau');
    assert.equal(dto.studentCode, undefined, 'Tuyệt đối không xuất trường studentCode');
    assert.ok(dto.qrUrl.includes('/tra-cuu?code=TEST-CODE-01'), 'Phải gắn url qr code động');
  });

  await t.test('3. Tra cứu chứng chỉ công khai (SPEC-CERT-VERIFY-01)', async () => {
    // 3.1 Thêm bản ghi chứng chỉ hợp lệ vào CSDL
    await certColl.insertOne({
      code: testCodeValid,
      user_id: testUserId,
      course_id: testCourseId,
      student_name: 'Nguyễn Văn Minh',
      certificate_name: 'Nguyễn Văn Minh',
      course_title: 'Lập trình Node.js Chuyên Sâu',
      status: 'valid',
      issued_at: new Date(),
      issued_at_vn: '29/10/2026',
      issued_at_en: 'Oct 29, 2026',
      created_at: new Date(),
    });

    // 3.2 Tra cứu mã hợp lệ (TC-VRF-02)
    const result = await verifyCertificateByCode('test-cert-2026'); // test không phân biệt hoa thường
    assert.ok(result);
    assert.equal(result.certificate.code, testCodeValid);
    assert.equal(result.certificate.studentName, 'Nguyễn Văn Minh');
    assert.equal(result.certificate.certificateName, 'Nguyễn Văn Minh');
    assert.ok(result.verifiedAt, 'Phải có trường verifiedAt trả về cho UI');

    await assert.rejects(
      () => getCertificateDownload(testCodeValid),
      error => error.status === 501 && error.code === 'CERTIFICATE_PDF_UNAVAILABLE',
    );

    // 3.3 Tra cứu mã không tồn tại (TC-VRF-04)
    await assert.rejects(
      async () => {
        await verifyCertificateByCode('KHONG-TON-TAI-999');
      },
      (err) => {
        assert.equal(err.status, 404);
        assert.equal(err.code, 'CERTIFICATE_NOT_FOUND');
        return true;
      }
    );
    await assert.rejects(
      () => getCertificateDownload('KHONG-TON-TAI-999'),
      error => error.status === 404 && error.code === 'CERTIFICATE_NOT_FOUND',
    );

    // 3.4 Tra cứu để trống mã
    await assert.rejects(
      async () => {
        await verifyCertificateByCode('');
      },
      (err) => {
        assert.equal(err.status, 400);
        return true;
      }
    );
  });

  await t.test('4. Lấy danh sách chứng chỉ của học viên (SPEC-CERT-MNG-01)', async () => {
    // 4.1 Lấy danh sách thành công
    const list = await getUserCertificates(testUserId);
    assert.ok(Array.isArray(list));
    assert.equal(list.length, 1);
    assert.equal(list[0].code, testCodeValid);

    // 4.2 Học viên chưa có chứng chỉ nào
    const emptyList = await getUserCertificates('unregistered_user_id');
    assert.ok(Array.isArray(emptyList));
    assert.equal(emptyList.length, 0);

    // 4.3 Chưa đăng nhập báo lỗi 401
    await assert.rejects(
      async () => {
        await getUserCertificates(null);
      },
      (err) => {
        assert.equal(err.status, 401);
        return true;
      }
    );
  });

  await t.test('5. Cấp chứng chỉ mới (Claim Certificate)', async () => {
    await db.collection(COLLECTION_USERS).insertMany([
      { id: testUserId, full_name: 'Nguyễn Văn Chứng Chỉ' },
      { id: ineligibleUserId, full_name: 'Học viên chưa đủ điều kiện' },
      { id: unownedUserId, full_name: 'Học viên chưa ghi danh' },
      { id: revokedUserId, full_name: 'Học viên có chứng chỉ đã thu hồi' },
      { id: newClaimUserId, full_name: 'Học viên yêu cầu cấp mới' },
    ]);
    await db.collection(COLLECTION_COURSES).insertOne({
      course_id: claimCourseId,
      title: 'AI Prompt Engineering',
    });
    await db.collection(COLLECTION_ENROLLMENTS).insertMany([
      { user_id: testUserId, course_id: claimCourseId },
      { user_id: ineligibleUserId, course_id: claimCourseId },
      { user_id: revokedUserId, course_id: claimCourseId },
      { user_id: newClaimUserId, course_id: claimCourseId },
    ]);
    const lessons = [
      { lesson_id: 'claim-lesson-1', lesson_type: 'video' },
      { lesson_id: 'claim-lesson-2', lesson_type: 'article' },
      { lesson_id: 'claim-lesson-3', lesson_type: 'quiz' },
      { lesson_id: 'claim-lesson-4', lesson_type: 'video' },
      { lesson_id: 'claim-lesson-5', lesson_type: 'video' },
    ].map(lesson => ({ ...lesson, course_id: claimCourseId }));
    await db.collection(COLLECTION_LESSONS).insertMany(lessons);
    await certColl.insertMany([
      { code: 'CERT-ALREADY-VALID', user_id: testUserId, course_id: claimCourseId, student_name: 'Nguyễn Văn Chứng Chỉ', course_title: 'AI Prompt Engineering', status: 'valid' },
      { code: 'CERT-ALREADY-REVOKED', user_id: revokedUserId, course_id: claimCourseId, student_name: 'Học viên có chứng chỉ đã thu hồi', course_title: 'AI Prompt Engineering', status: 'revoked' },
    ]);
    await db.collection(COLLECTION_USER_LESSON_PROGRESS).insertMany([
      ...lessons.slice(0, 4).map(lesson => ({
        user_id: testUserId,
        course_id: claimCourseId,
        lesson_id: lesson.lesson_id,
        status: 'completed',
        is_completed: true,
      })),
      ...lessons.slice(0, 4).map(lesson => ({
        user_id: newClaimUserId,
        course_id: claimCourseId,
        lesson_id: lesson.lesson_id,
        status: 'completed',
        is_completed: true,
      })),
    ]);


    await assert.rejects(
      () => issueCertificateForUser({ userId: unownedUserId, courseId: claimCourseId }),
      error => error.status === 403 && error.code === 'COURSE_ENROLLMENT_REQUIRED',
    );
    await assert.rejects(
      () => issueCertificateForUser({ userId: ineligibleUserId, courseId: claimCourseId }),
      error => error.status === 403 && error.code === 'CERTIFICATE_NOT_ELIGIBLE',
    );

    // Các progress legacy có vẻ đạt ngưỡng vẫn không đủ bằng chứng để cấp chứng chỉ mới.
    await assert.rejects(
      () => issueCertificateForUser({ userId: newClaimUserId, courseId: claimCourseId }),
      error => error.status === 409 && error.code === 'CERTIFICATE_ELIGIBILITY_UNVERIFIED',
    );
    assert.equal(await certColl.countDocuments({ user_id: newClaimUserId, course_id: claimCourseId }), 0);

    // Chứng chỉ hợp lệ đã phát hành được giữ nguyên, không tính lại điều kiện.
    const existingValid = await issueCertificateForUser({ userId: testUserId, courseId: claimCourseId });
    assert.equal(existingValid.code, 'CERT-ALREADY-VALID');
    assert.equal(existingValid.status, 'valid');

    // Chứng chỉ bị thu hồi không được claim lại hoặc hồi sinh.
    await assert.rejects(
      () => issueCertificateForUser({ userId: revokedUserId, courseId: claimCourseId }),
      error => error.status === 410 && error.code === 'CERTIFICATE_REVOKED',
    );
    assert.equal(await certColl.countDocuments({ user_id: revokedUserId, course_id: claimCourseId }), 1);
  });
});
