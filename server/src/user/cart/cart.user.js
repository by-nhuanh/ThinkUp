import { ObjectId } from 'mongodb';
import { getMongoDb } from '../db.js';

// ─── 0. Tên Collection CSDL MongoDB ──────────────────────────────────────────
export const COLLECTION_CARTS = 'user_cart_items';
export const COLLECTION_COURSES = 'courses';
export const COLLECTION_USERS = 'users';
export const COLLECTION_INSTRUCTORS = 'instructor_profiles';
export const COLLECTION_COURSE_REVIEWS = 'course_reviews';
export const COLLECTION_TAGS = 'tags';
export const COLLECTION_COURSE_TAGS = 'course_tags';
export const COLLECTION_FAVORITES = 'user_favorite_courses';
export const COLLECTION_USER_COURSES = 'user_courses';
export const COLLECTION_ENROLLMENTS = 'user_enrollments';
export const COLLECTION_PLATFORM_COUPONS = 'platform_coupons';
export const COLLECTION_PAYMENT_VOUCHERS = 'payment_vouchers';
export const COLLECTION_COURSE_COUPONS = 'course_coupons';

// ─── 1. Các hàm tiện ích bổ trợ ──────────────────────────────────────────────

/**
 * Định dạng số tiền sang chuẩn VND (ví dụ: "499.000đ")
 * @param {number} amount
 * @returns {string}
 */
export function formatVND(amount) {
  const num = Math.round(Number(amount) || 0);
  return `${new Intl.NumberFormat('vi-VN').format(num)}đ`;
}

/**
 * Kiểm tra xem người dùng đã sở hữu khóa học hay chưa
 * @param {import('mongodb').Db} db
 * @param {string} userId
 * @param {string} courseId
 * @returns {Promise<boolean>}
 */
export async function checkCourseOwnership(db, userId, courseId) {
  if (!userId || !courseId) return false;
  const filter = {
    $or: [
      { user_id: String(userId), course_id: String(courseId) },
      { userId: String(userId), courseId: String(courseId) },
    ],
  };
  const [inUserCourses, inEnrollments] = await Promise.all([
    db.collection(COLLECTION_USER_COURSES).findOne(filter),
    db.collection(COLLECTION_ENROLLMENTS).findOne(filter),
  ]);
  return Boolean(inUserCourses || inEnrollments);
}

/**
 * Kiểm tra và tính toán giảm giá của Voucher (Chống âm tiền và giới hạn trần)
 * @param {import('mongodb').Db} db
 * @param {string} rawCode
 * @param {number} eligibleSubtotal - Tổng tiền các khóa học áp dụng
 * @param {string} [userId]
 * @returns {Promise<{ isValid: boolean, code: string, discount: number, message: string }>}
 */
export async function validateVoucherLogic(db, rawCode, eligibleSubtotal, userId = null) {
  const code = String(rawCode || '').trim().toUpperCase();
  if (!code) {
    return { isValid: false, code: '', discount: 0, message: 'Chưa nhập mã voucher' };
  }

  // 1. Tìm voucher trong platform_coupons hoặc payment_vouchers
  const [platCoupon, payVoucher] = await Promise.all([
    db.collection(COLLECTION_PLATFORM_COUPONS).findOne({ code }),
    db.collection(COLLECTION_PAYMENT_VOUCHERS).findOne({ code }),
  ]);

  const voucherDoc = platCoupon || payVoucher;
  if (!voucherDoc) {
    // Dự phòng các mã ưu đãi kiểm thử
    if (code === 'THINKUP10' || code === 'WELCOME') {
      const discount = Math.min(Math.round(eligibleSubtotal * 0.1), 100000);
      return { isValid: true, code, discount, message: 'Áp dụng mã giảm giá 10% thành công!' };
    }
    if (code === 'THINKUP50') {
      const discount = Math.min(Math.round(eligibleSubtotal * 0.5), 500000);
      return { isValid: true, code, discount, message: 'Áp dụng mã giảm giá 50% thành công!' };
    }
    return { isValid: false, code, discount: 0, message: 'Mã giảm giá không hợp lệ hoặc không tồn tại' };
  }

  // 2. Kiểm tra trạng thái kích hoạt
  const isActive = voucherDoc.status === 'active' || voucherDoc.is_active === '1' || voucherDoc.is_active === 1;
  if (!isActive) {
    return { isValid: false, code, discount: 0, message: 'Mã giảm giá này hiện đang bị khóa hoặc ngưng sử dụng' };
  }

  // 3. Kiểm tra hạn sử dụng
  if (voucherDoc.expires_at) {
    const expiry = new Date(voucherDoc.expires_at);
    if (!isNaN(expiry.getTime()) && expiry.getTime() < Date.now()) {
      return { isValid: false, code, discount: 0, message: 'Mã giảm giá đã hết hạn sử dụng' };
    }
  }

  // 4. Kiểm tra giới hạn lượt dùng
  const usageLimit = parseInt(voucherDoc.usage_limit || voucherDoc.quantity_limit || '0', 10);
  const usageCount = parseInt(voucherDoc.usage_count || '0', 10);
  if (usageLimit > 0 && usageCount >= usageLimit) {
    return { isValid: false, code, discount: 0, message: 'Mã giảm giá đã hết lượt sử dụng' };
  }

  // 5. Tính số tiền giảm giá
  const discountType = voucherDoc.discount_type || (voucherDoc.percent_off ? 'percent' : 'fixed');
  const discountVal = parseFloat(voucherDoc.discount_value || voucherDoc.percent_off || '0') || 0;
  const maxDiscount = parseFloat(voucherDoc.max_discount || '0') || Infinity;

  let calculatedDiscount = 0;
  if (discountType === 'percent') {
    calculatedDiscount = Math.round((eligibleSubtotal * discountVal) / 100);
    if (maxDiscount > 0 && calculatedDiscount > maxDiscount) {
      calculatedDiscount = maxDiscount;
    }
  } else {
    calculatedDiscount = Math.round(discountVal);
  }

  // Quy tắc chống giảm giá âm: Chiết khấu voucher không vượt quá tổng phụ
  calculatedDiscount = Math.min(calculatedDiscount, eligibleSubtotal);

  return {
    isValid: true,
    code,
    discount: Math.max(0, calculatedDiscount),
    message: `Áp dụng thành công mã ${code}`,
  };
}

// ─── 2. Nghiệp vụ cốt lõi: Truy xuất Chi tiết Giỏ Hàng ────────────────────────

/**
 * Lấy danh sách đầy đủ chi tiết các khóa học trong giỏ hàng và tính toán tài chính
 * Hỗ trợ cả Học viên đã đăng nhập và Khách vãng lai (qua tham số guestCourseIds)
 *
 * @param {object} params
 * @param {string|null} [params.userId] - Mã định danh học viên (nếu đã đăng nhập)
 * @param {string[]} [params.guestCourseIds] - Mảng ID khóa học từ LocalStorage nếu là khách vãng lai
 * @param {string[]} [params.selectedCourseIds] - Tùy chọn lọc các khóa học được chọn để tính tiền
 * @param {string} [params.voucherCode] - Mã voucher người dùng nhập vào
 * @returns {Promise<object>} Dữ liệu chi tiết cho FE hiển thị
 */
export async function getCartDetails({
  userId = null,
  guestCourseIds = [],
  selectedCourseIds = null,
  voucherCode = '',
}) {
  const db = await getMongoDb();
  const isGuest = !userId;

  let uniqueCourseIds = [];

  if (userId) {
    // 1. Lấy danh sách bản ghi giỏ hàng của học viên đăng nhập
    const cartRecords = await db.collection(COLLECTION_CARTS).find({
      $or: [{ user_id: String(userId) }, { userId: String(userId) }],
    }).toArray();

    const courseIds = [];
    for (const record of cartRecords) {
      if (record.course_id) courseIds.push(String(record.course_id));
      if (record.courseId) courseIds.push(String(record.courseId));
      if (Array.isArray(record.items)) {
        for (const item of record.items) {
          const id = item.id || item.course_id || item.courseId;
          if (id) courseIds.push(String(id));
        }
      }
    }
    uniqueCourseIds = [...new Set(courseIds)];
  } else {
    // Dành cho khách vãng lai (Guest Cart)
    uniqueCourseIds = [...new Set((guestCourseIds || []).map(String).filter(Boolean))];
  }

  if (uniqueCourseIds.length === 0) {
    return {
      totalCourses: 0,
      courses: [],
      summary: {
        totalCourseCount: 0,
        selectedCourseCount: 0,
        originalSubtotal: 0,
        originalSubtotalFormatted: formatVND(0),
        courseDiscount: 0,
        courseDiscountFormatted: formatVND(0),
        saleSubtotal: 0,
        saleSubtotalFormatted: formatVND(0),
        voucherCode: '',
        voucherDiscount: 0,
        voucherDiscountFormatted: formatVND(0),
        finalTotal: 0,
        finalTotalFormatted: formatVND(0),
        voucherMessage: '',
        isVoucherValid: false,
      },
      isGuest,
      requiresAuthToCheckout: isGuest,
    };
  }

  // 2. Tìm thông tin chi tiết các khóa học trong collection courses
  const courseQuery = uniqueCourseIds.map(id => {
    const cleanId = id.replace(/^course-/, '');
    const conds = [{ course_id: cleanId }, { course_id: id }, { slug: id }];
    if (ObjectId.isValid(id)) conds.push({ _id: new ObjectId(id) });
    return conds;
  }).flat();

  const courseDocs = await db.collection(COLLECTION_COURSES).find({ $or: courseQuery }).toArray();

  // Tạo map tra cứu nhanh
  const courseMap = new Map();
  for (const doc of courseDocs) {
    if (doc._id) courseMap.set(String(doc._id), doc);
    if (doc.course_id) {
      courseMap.set(String(doc.course_id), doc);
      courseMap.set(`course-${doc.course_id}`, doc);
    }
    if (doc.slug) courseMap.set(String(doc.slug), doc);
  }

  // 3. Gom danh sách instructor_ids và course_ids để query batch tối ưu hiệu năng
  const instructorIds = [...new Set(courseDocs.map(c => String(c.instructor_id)).filter(Boolean))];
  const foundCourseIds = courseDocs.map(c => String(c.course_id)).filter(Boolean);

  const [instructorDocs, allCourseTags, allTags, wishlistDocs, enrolledDocs] = await Promise.all([
    instructorIds.length > 0
      ? db.collection(COLLECTION_INSTRUCTORS).find({
          $or: [
            { instructor_id: { $in: instructorIds } },
            { user_id: { $in: instructorIds } },
          ],
        }).toArray()
      : [],
    foundCourseIds.length > 0
      ? db.collection(COLLECTION_COURSE_TAGS).find({ course_id: { $in: foundCourseIds } }).toArray()
      : [],
    db.collection(COLLECTION_TAGS).find({}).toArray(),
    userId
      ? db.collection(COLLECTION_FAVORITES).find({
          $or: [{ user_id: String(userId) }, { userId: String(userId) }],
        }).toArray()
      : [],
    userId
      ? db.collection(COLLECTION_ENROLLMENTS).find({
          $or: [{ user_id: String(userId) }, { userId: String(userId) }],
        }).toArray()
      : [],
  ]);

  const instructorMap = new Map();
  for (const inst of instructorDocs) {
    if (inst.instructor_id) instructorMap.set(String(inst.instructor_id), inst);
    if (inst.user_id) instructorMap.set(String(inst.user_id), inst);
  }

  const tagMap = new Map();
  for (const t of allTags) {
    tagMap.set(String(t.tag_id || t.id || t._id), t.name || t.title || '');
  }

  const courseTagsMap = new Map();
  for (const ct of allCourseTags) {
    const cId = String(ct.course_id);
    if (!courseTagsMap.has(cId)) courseTagsMap.set(cId, []);
    const tagName = tagMap.get(String(ct.tag_id)) || ct.name || '';
    if (tagName) courseTagsMap.get(cId).push(tagName);
  }

  const wishlistSet = new Set(
    wishlistDocs.map(w => String(w.course_id || w.courseId || ''))
  );
  const enrolledSet = new Set(
    enrolledDocs.map(e => String(e.course_id || e.courseId || ''))
  );

  // 4. Chuẩn hóa danh sách khóa học hiển thị cho FE
  const enrichedCourses = [];
  let calculatedOriginalSubtotal = 0;
  let calculatedSaleSubtotal = 0;

  const isCustomSelection = Array.isArray(selectedCourseIds) && selectedCourseIds.length > 0;
  const selectedSet = isCustomSelection ? new Set(selectedCourseIds.map(String)) : null;

  for (const rawId of uniqueCourseIds) {
    const doc = courseMap.get(String(rawId));
    if (!doc) continue;

    const cId = String(doc.course_id || rawId);
    const inst = instructorMap.get(String(doc.instructor_id)) || null;

    // Giá bán thực tế & Giá niêm yết ban đầu
    const originalPrice = parseFloat(doc.original_price ?? doc.price ?? 0) || 0;
    const salePrice = parseFloat(doc.price ?? doc.original_price ?? 0) || 0;
    const discountAmount = Math.max(0, originalPrice - salePrice);

    const isInWishlist = wishlistSet.has(cId) || wishlistSet.has(String(doc._id)) || wishlistSet.has(rawId);
    const isAlreadyEnrolled = enrolledSet.has(cId) || enrolledSet.has(String(doc._id)) || enrolledSet.has(rawId);
    const isAvailable = doc.status === 'published';
    const isSelected = selectedSet ? (selectedSet.has(rawId) || selectedSet.has(cId) || selectedSet.has(String(doc._id))) : true;

    // Chỉ tính tổng tiền cho các khóa được chọn, chưa sở hữu và đang mở bán
    if (isSelected && !isAlreadyEnrolled && isAvailable) {
      calculatedOriginalSubtotal += originalPrice;
      calculatedSaleSubtotal += salePrice;
    }

    // Cờ hành động giao diện: Nếu đã sở hữu -> 'GO_TO_LEARNING', nếu chưa mở bán -> 'UNAVAILABLE', còn lại -> 'CHECKOUT'
    let actionButtonState = 'CHECKOUT';
    let actionButtonLabel = 'Mua ngay';
    if (isAlreadyEnrolled) {
      actionButtonState = 'GO_TO_LEARNING';
      actionButtonLabel = 'Vào khu vực học';
    } else if (!isAvailable) {
      actionButtonState = 'UNAVAILABLE';
      actionButtonLabel = 'Không khả dụng';
    }

    enrichedCourses.push({
      id: String(doc._id || rawId),
      course_id: cId,
      slug: doc.slug || `course-${cId}`,
      title: doc.title || 'Khóa học ThinkUp',
      thumbnail_url: doc.thumbnail_url || '',
      instructor: {
        id: String(doc.instructor_id || ''),
        name: inst?.full_name || 'Giảng viên ThinkUp',
        avatar_url: inst?.avatar_url || '',
      },
      rating: parseFloat(doc.rating) || 5.0,
      total_reviews: parseInt(doc.total_reviews, 10) || 0,
      total_students: parseInt(doc.total_students, 10) || 0,
      tags: courseTagsMap.get(cId) || (Array.isArray(doc.tags) ? doc.tags : []),
      price: {
        original: originalPrice,
        original_formatted: formatVND(originalPrice),
        sale: salePrice,
        sale_formatted: formatVND(salePrice),
        discount_amount: discountAmount,
        discount_formatted: formatVND(discountAmount),
      },
      status: doc.status || 'published',
      is_available: isAvailable,
      is_in_wishlist: isInWishlist,
      is_already_enrolled: isAlreadyEnrolled,
      action_button_state: actionButtonState,
      action_button_label: actionButtonLabel,
      is_selected: isSelected,
    });
  }

  // 5. Kiểm tra và áp dụng Voucher
  let voucherResult = { isValid: false, code: '', discount: 0, message: '' };
  if (voucherCode) {
    voucherResult = await validateVoucherLogic(db, voucherCode, calculatedSaleSubtotal, userId);
  }

  const courseDiscount = Math.max(0, calculatedOriginalSubtotal - calculatedSaleSubtotal);
  const voucherDiscount = voucherResult.isValid ? voucherResult.discount : 0;
  // Quy tắc chống giảm giá âm: Luôn giữ finalTotal >= 0
  const finalTotal = Math.max(0, calculatedSaleSubtotal - voucherDiscount);

  const selectedCount = enrichedCourses.filter(c => c.is_selected && !c.is_already_enrolled && c.is_available).length;

  return {
    totalCourses: enrichedCourses.length,
    courses: enrichedCourses,
    summary: {
      totalCourseCount: enrichedCourses.length,
      selectedCourseCount: selectedCount,
      originalSubtotal: calculatedOriginalSubtotal,
      originalSubtotalFormatted: formatVND(calculatedOriginalSubtotal),
      courseDiscount: courseDiscount,
      courseDiscountFormatted: formatVND(courseDiscount),
      saleSubtotal: calculatedSaleSubtotal,
      saleSubtotalFormatted: formatVND(calculatedSaleSubtotal),
      voucherCode: voucherResult.isValid ? voucherResult.code : '',
      voucherDiscount: voucherDiscount,
      voucherDiscountFormatted: formatVND(voucherDiscount),
      finalTotal: finalTotal,
      finalTotalFormatted: formatVND(finalTotal),
      voucherMessage: voucherResult.message,
      isVoucherValid: voucherResult.isValid,
    },
    isGuest,
    requiresAuthToCheckout: isGuest,
  };
}

// ─── 3. Đồng bộ Giỏ Hàng Khách Vãng Lai (Guest Cart Merge) ───────────────────

/**
 * Đồng bộ các khóa học từ giỏ hàng khách vãng lai vào tài khoản học viên sau đăng nhập
 * @param {string} userId
 * @param {string[]} guestCourseIds - Mảng ID các khóa học khách đã thêm lúc chưa đăng nhập
 */
export async function mergeGuestCartLogic(userId, guestCourseIds = []) {
  if (!userId) {
    const error = new Error('Yêu cầu đăng nhập để đồng bộ giỏ hàng.');
    error.status = 401;
    throw error;
  }

  const cleanIds = [...new Set((guestCourseIds || []).map(String).map(s => s.trim()).filter(Boolean))];
  if (cleanIds.length === 0) {
    return getCartDetails({ userId });
  }

  const db = await getMongoDb();

  // Lấy các khóa học đã có trong giỏ hàng DB của user
  const existingRecords = await db.collection(COLLECTION_CARTS).find({
    $or: [{ user_id: String(userId) }, { userId: String(userId) }],
  }).toArray();

  const existingSet = new Set();
  for (const r of existingRecords) {
    if (r.course_id) existingSet.add(String(r.course_id));
    if (r.courseId) existingSet.add(String(r.courseId));
  }

  // Thêm các khóa học chưa có vào giỏ hàng
  const newItemsToInsert = [];
  for (const cId of cleanIds) {
    if (!existingSet.has(cId)) {
      newItemsToInsert.push({
        user_id: String(userId),
        course_id: cId,
        created_at: new Date(),
        merged_from_guest: true,
      });
      existingSet.add(cId);
    }
  }

  if (newItemsToInsert.length > 0) {
    await db.collection(COLLECTION_CARTS).insertMany(newItemsToInsert);
  }

  return getCartDetails({ userId });
}

/**
 * Thêm khóa học vào giỏ hàng
 * @param {string} userId
 * @param {string} courseId
 */
export async function addToCartLogic(userId, courseId) {
  if (!userId) {
    const error = new Error('Yêu cầu đăng nhập để thêm vào giỏ hàng.');
    error.status = 401;
    throw error;
  }
  if (!courseId) {
    const error = new Error('Mã khóa học không được để trống.');
    error.status = 400;
    throw error;
  }

  const db = await getMongoDb();
  const cId = String(courseId).trim();

  // Kiểm tra trùng lặp
  const existing = await db.collection(COLLECTION_CARTS).findOne({
    $and: [
      { $or: [{ user_id: String(userId) }, { userId: String(userId) }] },
      { $or: [{ course_id: cId }, { courseId: cId }] },
    ],
  });

  if (!existing) {
    await db.collection(COLLECTION_CARTS).insertOne({
      user_id: String(userId),
      course_id: cId,
      created_at: new Date(),
    });
  }

  return getCartDetails({ userId });
}

/**
 * Xóa khóa học ra khỏi giỏ hàng
 * @param {string} userId
 * @param {string} courseId
 */
export async function removeFromCartLogic(userId, courseId) {
  if (!userId) {
    const error = new Error('Yêu cầu đăng nhập.');
    error.status = 401;
    throw error;
  }
  const db = await getMongoDb();
  const cId = String(courseId).trim();

  await db.collection(COLLECTION_CARTS).deleteMany({
    $and: [
      { $or: [{ user_id: String(userId) }, { userId: String(userId) }] },
      { $or: [{ course_id: cId }, { courseId: cId }] },
    ],
  });

  return getCartDetails({ userId });
}

// ─── 4. Router Express dành cho Giỏ Hàng ──────────────────────────────────────

/**
 * Khởi tạo Router Cart dành cho User & Khách Vãng Lai
 * @param {import('express')} express
 * @param {Function} requireAuth
 * @param {Function} [optionalAuth] - Trích xuất userId nếu có token, không bắt buộc
 */
export function createCartRouter(express, requireAuth, optionalAuth = null) {
  const router = express.Router();

  // Middleware tùy chọn xác thực (nếu không truyền vào thì dùng fallback)
  const extractAuthOptional = optionalAuth || ((req, res, next) => next());

  // 4.1. Lấy thông tin giỏ hàng & tính toán tiền (Hỗ trợ cả User & Guest)
  router.get('/', extractAuthOptional, async (req, res, next) => {
    try {
      const selectedIds = req.query.selectedIds
        ? String(req.query.selectedIds).split(',').map(s => s.trim()).filter(Boolean)
        : null;
      const voucherCode = req.query.voucherCode ? String(req.query.voucherCode).trim() : '';
      const guestIds = req.query.guestCourseIds
        ? String(req.query.guestCourseIds).split(',').map(s => s.trim()).filter(Boolean)
        : [];

      const result = await getCartDetails({
        userId: req.userId || null,
        guestCourseIds: guestIds,
        selectedCourseIds: selectedIds,
        voucherCode,
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  });

  // 4.2. Kiểm tra mã Voucher độc lập (Validate voucher)
  router.post('/voucher/validate', extractAuthOptional, async (req, res, next) => {
    try {
      const { code, eligibleSubtotal } = req.body;
      const db = await getMongoDb();
      const result = await validateVoucherLogic(db, code, Number(eligibleSubtotal) || 0, req.userId || null);
      res.json({
        success: result.isValid,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  });

  // 4.3. Đồng bộ giỏ hàng từ khách vãng lai sau khi đăng nhập / đăng ký
  router.post('/merge', requireAuth, async (req, res, next) => {
    try {
      const { guestCourseIds } = req.body;
      const result = await mergeGuestCartLogic(req.userId, guestCourseIds);
      res.json({
        success: true,
        message: 'Đồng bộ giỏ hàng khách vãng lai thành công',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  });

  // 4.4. Thêm khóa học vào giỏ hàng (Yêu cầu đăng nhập)
  router.post('/', requireAuth, async (req, res, next) => {
    try {
      const { courseId } = req.body;
      const result = await addToCartLogic(req.userId, courseId);
      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  });

  // 4.5. Xóa khóa học khỏi giỏ hàng (Yêu cầu đăng nhập)
  router.delete('/', requireAuth, async (req, res, next) => {
    try {
      const { courseId } = req.body;
      const result = await removeFromCartLogic(req.userId, courseId);
      res.json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
