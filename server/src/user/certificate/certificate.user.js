import { ObjectId } from 'mongodb';
import { createHash } from 'node:crypto';
import { getMongoDb } from '../db.js';
import { getCourseStudyCurriculum } from '../lesson/lesson.user.js';
import { createNotificationForEvent } from '../notification/notification.user.js';

// ─── 0. Tên Collection MongoDB ───────────────────────────────────────────────
export const COLLECTION_CERTIFICATES = 'certificates';
export const COLLECTION_COURSES = 'courses';
export const COLLECTION_USERS = 'users';
export const COLLECTION_USER_PROGRESS = 'user_course_progress';
export const COLLECTION_USER_LESSON_PROGRESS = 'user_lesson_progress';
export const COLLECTION_LESSONS = 'lessons';
export const COLLECTION_SECTIONS = 'course_sections';
export const COLLECTION_ENROLLMENTS = 'user_enrollments';
export const COLLECTION_USER_COURSES = 'user_courses';
export const COLLECTION_INSTRUCTORS = 'instructor_profiles';

// Base URL công khai chuẩn hóa theo hệ thống ThinkUp
export const PUBLIC_WEB_ORIGIN = process.env.CLIENT_URL?.split(',')[0]?.trim()?.replace(/\/+$/, '') || 'https://thinkup.vn';

// ─── 1. Tiện ích Định dạng & Xử lý Thời gian chuẩn Việt Nam (UTC+7) ──────────

/**
 * Lấy chuỗi thời gian xác thực hiện tại theo múi giờ Việt Nam (Asia/Ho_Chi_Minh).
 * Định dạng: "HH:mm dd/MM/yyyy" (ví dụ: "14:30 29/10/2026")
 * @param {Date} [date]
 * @returns {string}
 */
export function formatVietnamVerificationTime(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const partMap = {};
  for (const part of parts) {
    partMap[part.type] = part.value;
  }

  return `${partMap.hour}:${partMap.minute} ${partMap.day}/${partMap.month}/${partMap.year}`;
}

/**
 * Format ngày cấp theo chuẩn dd/MM/yyyy theo múi giờ Việt Nam
 * @param {Date} [date]
 * @returns {string}
 */
export function formatVietnamIssuedDate(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const parts = formatter.formatToParts(date);
  const partMap = {};
  for (const part of parts) {
    partMap[part.type] = part.value;
  }
  return `${partMap.day}/${partMap.month}/${partMap.year}`;
}

/**
 * Format ngày cấp tiếng Anh cho artwork: "MMM d, yyyy" (vd: "May 15, 2026")
 * @param {Date} [date]
 * @returns {string}
 */
export function formatEnglishIssuedDate(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Ho_Chi_Minh',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return formatter.format(date);
}

/**
 * Chuẩn hóa mã chứng chỉ: loại bỏ khoảng trắng thừa và viết hoa
 * @param {string} code
 * @returns {string}
 */
export function normalizeCertificateCode(code) {
  if (typeof code !== 'string') return '';
  return code.trim().toUpperCase();
}

/**
 * Tạo URL tra cứu chứng chỉ (Dùng để gắn vào QR Code của chứng chỉ)
 * Định dạng: https://thinkup.vn/tra-cuu?code={Mã_chứng_chỉ}
 * Khi người dùng dùng camera/Zalo quét, web sẽ tự điền ô input và tự gọi API tra cứu.
 * @param {string} code
 * @returns {string}
 */
export function buildCertificateQrUrl(code) {
  const cleanCode = normalizeCertificateCode(code);
  return `${PUBLIC_WEB_ORIGIN}/tra-cuu?code=${encodeURIComponent(cleanCode)}`;
}

/**
 * Sinh mã chứng chỉ ngẫu nhiên theo định dạng XXXX-XXXX (A-Z, 0-9)
 * @returns {string}
 */
export function generateCertificateCode() {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // Tránh 0, O, 1, I gây nhầm lẫn
  let p1 = '';
  let p2 = '';
  for (let i = 0; i < 4; i++) {
    p1 += chars.charAt(Math.floor(Math.random() * chars.length));
    p2 += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${p1}-${p2}`;
}

// ─── 2. Nghiệp vụ Tra cứu & Quản lý Chứng chỉ ──────────────────────────────

/**
 * Chuẩn hóa entity document trong DB sang cấu trúc DTO trả về cho Frontend:
 * - studentName và certificateName hoàn toàn giống nhau (Họ và tên học viên).
 * - Không xuất mã định danh (studentCode).
 * - Chứa qrUrl động phục vụ kết nối artwork / quét mã.
 * @param {Object} doc
 * @returns {Object}
 */
export function formatCertificateDto(doc) {
  if (!doc) return null;
  const name = doc.student_name || doc.studentName || 'Học viên ThinkUp';
  const code = doc.code;
  const qrUrl = doc.qr_url || buildCertificateQrUrl(code);

  return {
    code: code,
    studentName: name,
    certificateName: name, // Đồng nhất studentName và certificateName
    courseTitle: doc.course_title || doc.courseTitle || 'Khóa học ThinkUp',
    courseId: doc.course_id ? String(doc.course_id) : undefined,
    issuedAt: doc.issued_at_vn || (doc.issued_at ? formatVietnamIssuedDate(new Date(doc.issued_at)) : ''),
    issuedAtEn: doc.issued_at_en || (doc.issued_at ? formatEnglishIssuedDate(new Date(doc.issued_at)) : ''),
    status: doc.status || 'valid',
    qrUrl: qrUrl, // Cung cấp URL gắn vào QR riêng cho từng chứng chỉ
    pdfDownloadUrl: `/api/v1/certificates/${encodeURIComponent(code)}/download`,
    instructorName: doc.instructor_name || doc.instructorName || 'Giảng viên ThinkUp',
    signatureUrl: doc.signature_url || doc.signatureUrl || null,
  };
}

async function enrichCertificateInstructor(db, doc) {
  if (doc.instructor_name) return doc;
  const rawCourseId = doc.course_id;
  const courseId = String(rawCourseId || '');
  const course = await db.collection(COLLECTION_COURSES).findOne({ $or: [
    { _id: rawCourseId }, { course_id: courseId }, { id: courseId }, { slug: courseId },
    ...(ObjectId.isValid(courseId) ? [{ _id: new ObjectId(courseId) }] : []),
  ] });
  const instructorId = String(course?.instructor_id || course?.instructorId || '');
  const profile = instructorId ? await db.collection(COLLECTION_INSTRUCTORS).findOne({
    $or: [{ user_id: instructorId }, { instructor_id: instructorId }],
  }) : null;
  const objectId = ObjectId.isValid(instructorId) ? new ObjectId(instructorId) : null;
  const instructor = instructorId ? await db.collection(COLLECTION_USERS).findOne({ $or: [
    { id: instructorId }, { user_id: instructorId }, ...(objectId ? [{ _id: objectId }] : []),
  ] }) : null;
  const values = { instructor_id: instructorId || null,
    instructor_name: profile?.full_name || profile?.name || instructor?.full_name || instructor?.name || 'Giảng viên ThinkUp',
    signature_url: profile?.signature_url || profile?.signatureUrl || null };
  if (doc._id) await db.collection(COLLECTION_CERTIFICATES).updateOne({ _id: doc._id }, { $set: values });
  return { ...doc, ...values };
}

function certificateClaimResult(doc) {
  if (doc.status === 'valid') return formatCertificateDto(doc);

  const error = new Error(
    doc.status === 'revoked'
      ? 'Chứng chỉ đã bị Admin thu hồi và không thể cấp lại tự động.'
      : 'Trạng thái chứng chỉ hiện có chưa được xác minh.',
  );
  error.status = doc.status === 'revoked' ? 410 : 409;
  error.code = doc.status === 'revoked' ? 'CERTIFICATE_REVOKED' : 'CERTIFICATE_STATUS_UNVERIFIED';
  throw error;
}

/**
 * Tra cứu chứng chỉ công khai theo mã (Không cần đăng nhập).
 * Quy tắc:
 * - Kiểm tra định dạng mã hợp lệ (A-Z, 0-9, gạch ngang).
 * - Tìm kiếm trong CSDL với mã viết hoa và status = 'valid'.
 * - Trả về { certificate, verifiedAt } với verifiedAt theo giờ Việt Nam.
 * @param {string} rawCode
 * @returns {Promise<{ certificate: Object, verifiedAt: string }>}
 */
export async function verifyCertificateByCode(rawCode) {
  const code = normalizeCertificateCode(rawCode);
  if (!code) {
    const error = new Error('Vui lòng cung cấp mã chứng chỉ để tra cứu.');
    error.status = 400;
    error.code = 'INVALID_CODE';
    throw error;
  }

  // Cho phép chữ cái, chữ số và dấu gạch ngang
  if (!/^[A-Z0-9-]+$/.test(code)) {
    const error = new Error(`Không tìm thấy chứng chỉ với mã ${code}`);
    error.status = 404;
    error.code = 'CERTIFICATE_NOT_FOUND';
    throw error;
  }

  const db = await getMongoDb();
  const certDoc = await db.collection(COLLECTION_CERTIFICATES).findOne({
    code: code,
    status: 'valid',
  });

  if (!certDoc) {
    const error = new Error(`Không tìm thấy chứng chỉ với mã ${code}`);
    error.status = 404;
    error.code = 'CERTIFICATE_NOT_FOUND';
    throw error;
  }

  return {
    certificate: formatCertificateDto(await enrichCertificateInstructor(db, certDoc)),
    verifiedAt: formatVietnamVerificationTime(new Date()),
  };
}

/**
 * Tạo và tải trực tiếp tệp PDF chứng chỉ chất lượng cao với font tiếng Việt chuẩn Noto Sans.
 * @param {string} code - Mã chứng chỉ
 * @param {import('express').Response} [res] - Express Response nếu gọi qua API router
 * @returns {Promise<Buffer>}
 */
export async function getCertificateDownload(code, res = null) {
  const { certificate } = await verifyCertificateByCode(code);
  const PDFDocument = (await import('pdfkit')).default;
  const QRCode = (await import('qrcode')).default;
  const path = await import('node:path');
  const fs = await import('node:fs');
  const { fileURLToPath } = await import('node:url');

  const regularFont = fileURLToPath(new URL('../../../node_modules/@fontsource/noto-sans/files/noto-sans-vietnamese-400-normal.woff', import.meta.url));
  const boldFont = fileURLToPath(new URL('../../../node_modules/@fontsource/noto-sans/files/noto-sans-vietnamese-700-normal.woff', import.meta.url));
  const bgPath = path.resolve(fileURLToPath(new URL('../../../../web/public/assets/certificate/certificate-bg.png', import.meta.url)));

  const qrUrl = certificate.verificationUrl || buildCertificateQrUrl(certificate.code);
  const qrBuffer = await QRCode.toBuffer(qrUrl, { margin: 0, width: 240, errorCorrectionLevel: 'M' });

  const pdfBuffer = await new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: [1375, 1024],
      margin: 0,
      info: {
        Title: 'ThinkUp_Certificate_' + certificate.code,
        Author: 'ThinkUp Education',
      },
    });

    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    if (fs.existsSync(bgPath)) {
      doc.image(bgPath, 0, 0, { width: 1375, height: 1024 });
    }

    if (fs.existsSync(regularFont) && fs.existsSync(boldFont)) {
      doc.registerFont('NotoSans', regularFont).registerFont('NotoSansBold', boldFont);
    }

    // Họ tên học viên
    doc.font(fs.existsSync(boldFont) ? 'NotoSansBold' : 'Helvetica-Bold')
      .fontSize(34)
      .fillColor('#0B63E5')
      .text(certificate.certificateName || certificate.studentName, 418, 466, { width: 840, lineBreak: false });

    // Tên khóa học
    doc.font(fs.existsSync(boldFont) ? 'NotoSansBold' : 'Helvetica-Bold')
      .fontSize(41)
      .fillColor('#081433')
      .text(certificate.courseTitle, 418, 652, { width: 680, height: 120, ellipsis: true });

    // Ngày cấp & Mã chứng chỉ
    doc.font(fs.existsSync(regularFont) ? 'NotoSans' : 'Helvetica')
      .fontSize(20)
      .fillColor('#050B19')
      .text(certificate.issuedAtEn || certificate.issuedAtVn || '', 304, 806);

    doc.font(fs.existsSync(regularFont) ? 'NotoSans' : 'Helvetica')
      .fontSize(20)
      .fillColor('#050B19')
      .text(certificate.code, 304, 859);

    // QR Code
    doc.image(qrBuffer, 446, 791, { width: 160, height: 148 });

    doc.end();
  });

  if (res) {
    const filename = 'ThinkUp_Certificate_' + certificate.code + '.pdf';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  }

  return pdfBuffer;
}

/**
 * Lấy danh sách chứng chỉ của học viên đang đăng nhập (Private).
 * Sắp xếp theo ngày cấp mới nhất.
 * @param {string} userId
 * @returns {Promise<Array<Object>>}
 */
export async function getUserCertificates(userId) {
  if (!userId) {
    const error = new Error('Yêu cầu đăng nhập để xem danh sách chứng chỉ.');
    error.status = 401;
    error.code = 'UNAUTHORIZED';
    throw error;
  }

  const db = await getMongoDb();
  const uid = String(userId).trim();
  const userObjectId = ObjectId.isValid(uid) ? new ObjectId(uid) : null;
  const user = await db.collection(COLLECTION_USERS).findOne({
    $or: [
      { id: uid },
      { user_id: uid },
      { student_id: uid },
      ...(userObjectId ? [{ _id: userObjectId }] : []),
    ],
  });
  const canonicalUserId = user ? String(user.id || user.user_id || user._id || uid) : uid;
  const userAliases = [...new Set([uid, canonicalUserId, user?._id ? String(user._id) : null].filter(Boolean))];
  const userDbAliases = [...userAliases, ...(user?._id ? [user._id] : []), ...(userObjectId ? [userObjectId] : [])];

  const certDocs = await db.collection(COLLECTION_CERTIFICATES)
    .find({
      $or: [
        ...userDbAliases.flatMap(id => [{ user_id: id }, { userId: id }]),
      ],
    })
    .sort({ created_at: -1, issued_at: -1 })
    .toArray();

  return Promise.all(certDocs.map(async doc => formatCertificateDto(await enrichCertificateInstructor(db, doc))));
}

/**
 * Cấp chứng chỉ mới cho học viên hoàn thành khóa học (Claim Certificate)
 * @param {Object} params
 * @param {string} params.userId
 * @param {string} params.courseId
 * @returns {Promise<Object>}
 */
export async function issueCertificateForUser({ userId, courseId }) {
  if (!userId) {
    const error = new Error('Yêu cầu đăng nhập để nhận chứng chỉ.');
    error.status = 401;
    error.code = 'UNAUTHORIZED';
    throw error;
  }
  if (!courseId) {
    const error = new Error('Mã khóa học không được để trống.');
    error.status = 400;
    error.code = 'INVALID_COURSE_ID';
    throw error;
  }

  const db = await getMongoDb();
  const uid = String(userId).trim();
  const requestedCourseId = String(courseId).trim();
  const userObjectId = ObjectId.isValid(uid) ? new ObjectId(uid) : null;
  const courseObjectId = ObjectId.isValid(requestedCourseId) ? new ObjectId(requestedCourseId) : null;
  const userConditions = [
    { id: uid },
    { user_id: uid },
    { student_id: uid },
    ...(userObjectId ? [{ _id: userObjectId }] : []),
  ];
  const courseConditions = [
    { course_id: requestedCourseId },
    { slug: requestedCourseId },
    { id: requestedCourseId },
    ...(courseObjectId ? [{ _id: courseObjectId }] : []),
  ];

  const [user, course] = await Promise.all([
    db.collection(COLLECTION_USERS).findOne({ $or: userConditions }),
    db.collection(COLLECTION_COURSES).findOne({ $or: courseConditions }),
  ]);
  if (!user) {
    const error = new Error('Không tìm thấy tài khoản học viên.');
    error.status = 404;
    error.code = 'USER_NOT_FOUND';
    throw error;
  }
  if (!course) {
    const error = new Error('Khóa học không tồn tại.');
    error.status = 404;
    error.code = 'COURSE_NOT_FOUND';
    throw error;
  }

  const canonicalUserId = String(user.id || user.user_id || user._id || uid);
  const canonicalCourseId = String(course.course_id || course._id || course.id || requestedCourseId);
  const userAliases = [...new Set([uid, canonicalUserId, user._id ? String(user._id) : null].filter(Boolean))];
  const userDbAliases = [...userAliases, ...(user._id ? [user._id] : [])];
  const courseAliases = [...new Set([
    requestedCourseId,
    canonicalCourseId,
    course.course_id ? String(course.course_id) : null,
    course._id ? String(course._id) : null,
    course.slug ? String(course.slug) : null,
  ].filter(Boolean))];
  const courseDbAliases = [...courseAliases, ...(course._id ? [course._id] : [])];
  const ownershipFilter = {
    $and: [
      { $or: userDbAliases.flatMap(id => [{ user_id: id }, { userId: id }]) },
      { $or: courseDbAliases.flatMap(id => [{ course_id: id }, { courseId: id }]) },
    ],
  };

  const existingCert = await db.collection(COLLECTION_CERTIFICATES).findOne({
    $and: [
      { $or: userDbAliases.flatMap(id => [{ user_id: id }, { userId: id }]) },
      { $or: courseDbAliases.flatMap(id => [{ course_id: id }, { courseId: id }]) },
    ],
  });

  if (existingCert) {
    return certificateClaimResult(existingCert);
  }

  const [enrollment, ownedCourse, directLessons, sections] = await Promise.all([
    db.collection(COLLECTION_ENROLLMENTS).findOne(ownershipFilter),
    db.collection(COLLECTION_USER_COURSES).findOne(ownershipFilter),
    db.collection(COLLECTION_LESSONS).find({ course_id: { $in: courseDbAliases } }).toArray(),
    db.collection(COLLECTION_SECTIONS).find({ course_id: { $in: courseDbAliases } }).toArray(),
  ]);
  const sectionIds = sections.flatMap(sec => [sec._id, sec.section_id]).filter(Boolean);
  const sectionLessons = sectionIds.length > 0
    ? await db.collection(COLLECTION_LESSONS).find({ section_id: { $in: [...sectionIds, ...sectionIds.map(String)] } }).toArray()
    : [];
  const lessonMap = new Map();
  for (const l of [...directLessons, ...sectionLessons]) {
    const key = String(l.lesson_id || l._id);
    lessonMap.set(key, l);
  }
  const courseLessons = Array.from(lessonMap.values());
  if (!enrollment && !ownedCourse) {
    const error = new Error('Bạn chưa được ghi danh khóa học này.');
    error.status = 403;
    error.code = 'COURSE_ENROLLMENT_REQUIRED';
    throw error;
  }
  if (courseLessons.length === 0) {
    const error = new Error('Chưa có dữ liệu bài học để xác minh điều kiện cấp chứng chỉ.');
    error.status = 403;
    error.code = 'CERTIFICATE_NOT_ELIGIBLE';
    throw error;
  }

  const [lessonProgress, userCourseProgress] = await Promise.all([
    db.collection(COLLECTION_USER_LESSON_PROGRESS).find({
      $and: [
        { $or: userDbAliases.flatMap(id => [{ user_id: id }, { userId: id }]) },
        { $or: courseDbAliases.flatMap(id => [{ course_id: id }, { courseId: id }]) },
      ],
    }).toArray(),
    db.collection(COLLECTION_USER_PROGRESS).findOne({
      $and: [
        { $or: userDbAliases.flatMap(id => [{ user_id: id }, { userId: id }]) },
        { $or: courseDbAliases.flatMap(id => [{ course_id: id }, { courseId: id }]) },
      ],
    }),
  ]);
  const courseLessonIds = new Set(courseLessons.map(lesson => String(lesson.lesson_id || lesson._id)));
  const completedLessonIds = new Set(
    lessonProgress
      .filter(progress => progress.status === 'completed' || progress.is_completed === true)
      .map(progress => String(progress.lesson_id || progress.lessonId))
      .filter(lessonId => courseLessonIds.has(lessonId)),
  );
  const calculatedPercent = courseLessons.length > 0 ? Math.round((completedLessonIds.size / courseLessons.length) * 100) : 0;
  const recordedPercent = Number(userCourseProgress?.progress_percentage ?? userCourseProgress?.progress) || 0;
  const progressPercent = Math.max(calculatedPercent, recordedPercent);

  const quizLessons = courseLessons.filter(lesson =>
    ['quiz', 'test', 'exam', 'assessment'].includes(String(lesson.lesson_type || '').toLowerCase()),
  );
  const completedQuizCount = quizLessons.filter(lesson => completedLessonIds.has(String(lesson.lesson_id || lesson._id))).length;
  const isAllQuizCompleted = quizLessons.length === 0 || completedQuizCount >= quizLessons.length || progressPercent === 100;

  const study = await getCourseStudyCurriculum(canonicalCourseId, uid, { db });
  const verified = study.learning_progress;
  const fullyCompleted = verified.total_lessons > 0 && verified.completed_lessons === verified.total_lessons;
  if (!fullyCompleted && (progressPercent < 80 || !isAllQuizCompleted)) {
    const error = new Error('Chưa đạt điều kiện cấp chứng chỉ: cần hoàn thành ít nhất 80% tiến độ và tất cả bài kiểm tra.');
    error.status = 403;
    error.code = 'CERTIFICATE_NOT_ELIGIBLE';
    throw error;
  }

  // Chống cấp trùng khi có request song song: kiểm tra lại trước khi insert
  const doubleCheck = await db.collection(COLLECTION_CERTIFICATES).findOne({
    $and: [
      { $or: userDbAliases.flatMap(id => [{ user_id: id }, { userId: id }]) },
      { $or: courseDbAliases.flatMap(id => [{ course_id: id }, { courseId: id }]) },
    ],
  });
  if (doubleCheck) {
    return certificateClaimResult(doubleCheck);
  }

  const newCode = generateCertificateCode();
  const studentName = user.full_name || user.name || 'Học viên ThinkUp';
  const courseTitle = course.title || course.course_name || 'Khóa học ThinkUp';
  const now = new Date();
  const instructorId = String(course.instructor_id || course.instructorId || '');
  const instructorProfile = instructorId ? await db.collection(COLLECTION_INSTRUCTORS).findOne({
    $or: [{ user_id: instructorId }, { instructor_id: instructorId }],
  }) : null;
  const instructorObjectId = ObjectId.isValid(instructorId) ? new ObjectId(instructorId) : null;
  const instructorUser = instructorId ? await db.collection(COLLECTION_USERS).findOne({ $or: [
    { id: instructorId }, { user_id: instructorId }, ...(instructorObjectId ? [{ _id: instructorObjectId }] : []),
  ] }) : null;
  const instructorName = instructorProfile?.full_name || instructorProfile?.name || instructorUser?.full_name || instructorUser?.name || 'Giảng viên ThinkUp';
  // Trường này được để null cho tới khi quản trị viên cung cấp URL ảnh chữ ký.
  const signatureUrl = instructorProfile?.signature_url || instructorProfile?.signatureUrl || null;
  const certRecord = {
    code: newCode,
    user_id: user._id || canonicalUserId,
    course_id: course._id || canonicalCourseId,
    student_name: studentName,
    certificate_name: studentName,
    course_title: courseTitle,
    instructor_id: instructorId || null,
    instructor_name: instructorName,
    signature_url: signatureUrl,
    status: 'valid',
    issued_at: now,
    issued_at_vn: formatVietnamIssuedDate(now),
    issued_at_en: formatEnglishIssuedDate(now),
    qr_url: buildCertificateQrUrl(newCode),
    created_at: now,
    updated_at: now,
  };

  await db.collection(COLLECTION_CERTIFICATES).insertOne(certRecord);

  try {
    await createNotificationForEvent(String(user._id || canonicalUserId), {
      eventKey: `certificate:${newCode}`, sourceType: 'certificate', sourceId: newCode,
      category: 'learning', kind: 'certificate', title: 'Chứng chỉ đã được cấp',
      message: `Bạn đã nhận chứng chỉ khóa học ${courseTitle}.`, href: '/main/certificates',
    }, { db, now });
  } catch (notificationError) {
    console.warn('[Certificate Notification Warning]:', notificationError.message);
  }

  try {
    await db.collection(COLLECTION_USER_PROGRESS).updateOne(
      {
        $or: [
          { user_id: user._id || canonicalUserId, course_id: course._id || canonicalCourseId },
          { user_id: String(userId), course_id: String(courseId) },
        ],
      },
      {
        $set: {
          certificate_id: newCode,
          certificate_url: buildCertificateQrUrl(newCode),
          certificate_issued_at: now,
          updated_at: now,
        },
      }
    );
  } catch (syncErr) {
    console.warn('[Certificate Sync Warning]:', syncErr.message);
  }

  return formatCertificateDto(certRecord);
}

// ─── 3. Tạo Express Router Module ──────────────────────────────────────────

/**
 * Khởi tạo Router xử lý cho module Chứng chỉ (SPEC-CERT-MNG-01 & SPEC-CERT-VERIFY-01)
 * @param {import('express')} expressLib
 * @param {Function} requireAuthMiddleware
 * @returns {import('express').Router}
 */
export function createCertificateRouter(expressLib, requireAuthMiddleware) {
  const router = expressLib.Router();

  // 3.1. [Public] Tra cứu chứng chỉ công khai (SPEC-CERT-VERIFY-01)
  // GET /api/v1/certificates/verify?code=...
  router.get('/verify', async (req, res, next) => {
    try {
      const code = req.query.code;
      const result = await verifyCertificateByCode(code);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // 3.2. [Private] Lấy danh sách chứng chỉ cá nhân của học viên (SPEC-CERT-MNG-01)
  // GET /api/v1/certificates/me
  router.get('/me', requireAuthMiddleware, async (req, res, next) => {
    try {
      const userId = req.userId || req.user?.id || req.user?._id;
      const certificates = await getUserCertificates(userId);
      res.json(certificates);
    } catch (err) {
      next(err);
    }
  });

  // 3.3. [Private] Yêu cầu cấp chứng chỉ khi hoàn thành khóa học
  // POST /api/v1/certificates/claim
  router.post('/claim', requireAuthMiddleware, async (req, res, next) => {
    try {
      const userId = req.userId || req.user?.id || req.user?._id;
      const { courseId } = req.body || {};
      const certificate = await issueCertificateForUser({ userId, courseId });
      res.status(201).json({
        success: true,
        message: 'Chứng chỉ đã được cấp thành công.',
        certificate,
      });
    } catch (err) {
      next(err);
    }
  });

  // 3.4. [Public/Private] Xuất / Tải chứng chỉ (Chuẩn tên file ThinkUp_Certificate_{Mã_chứng_chỉ}.pdf)
  // GET /api/v1/certificates/:code/download
  router.get('/:code/download', async (req, res, next) => {
    try {
      await getCertificateDownload(req.params.code, res);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
