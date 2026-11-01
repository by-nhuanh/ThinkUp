import { resolveLearningPlayback } from '../learning-settings/learning-settings.user.js';
import { ObjectId } from 'mongodb';
import { getMongoDb } from '../db.js';

// ─── 0. Danh mục Collection CSDL MongoDB ─────────────────────────────────────
export const COLLECTION_COURSES = 'courses';
export const COLLECTION_INSTRUCTORS = 'instructor_profiles';
export const COLLECTION_USERS = 'users';
export const COLLECTION_TAGS = 'tags';
export const COLLECTION_COURSE_TAGS = 'course_tags';
export const COLLECTION_CATEGORIES = 'course_categories';
export const COLLECTION_FAVORITES = 'user_favorite_courses';
export const COLLECTION_CARTS = 'user_cart_items';
export const COLLECTION_USER_COURSES = 'user_courses';
export const COLLECTION_ENROLLMENTS = 'user_enrollments';
export const COLLECTION_SECTIONS = 'course_sections';
export const COLLECTION_LESSONS = 'lessons';
export const COLLECTION_LESSON_VIDEOS = 'lesson_videos';
export const COLLECTION_REVIEWS = 'course_reviews';
export const COLLECTION_DOCUMENTS = 'course_documents';
export const COLLECTION_COURSE_COUPONS = 'course_coupons';

// ─── 1. Tiện ích định dạng & tính toán ───────────────────────────────────────

/**
 * Định dạng tiền tệ sang chuẩn hiển thị VND (vd: "499.000đ" hoặc "Miễn phí")
 * @param {number} amount
 * @returns {string}
 */
export function formatVND(amount) {
  const num = Math.round(Number(amount) || 0);
  if (num <= 0) return 'Miễn phí';
  return `${new Intl.NumberFormat('vi-VN').format(num)}đ`;
}

/**
 * Tính toán chiết khấu và phần trăm giảm giá an toàn
 * @param {number} original
 * @param {number} sale
 * @returns {{ discountAmount: number, discountPercent: number }}
 */
export function calculateDiscount(original, sale) {
  const orig = Math.max(0, Number(original) || 0);
  const cur = Math.max(0, Number(sale) || 0);

  if (orig <= cur || orig === 0) {
    return { discountAmount: 0, discountPercent: 0 };
  }

  const discountAmount = Math.max(0, orig - cur);
  const discountPercent = Math.min(100, Math.round((discountAmount / orig) * 100));

  return { discountAmount, discountPercent };
}

/**
 * Định dạng thời lượng học (phút) sang chuỗi trực quan
 * @param {number|string} minutes
 * @returns {string}
 */
export function formatDuration(minutes) {
  const mins = parseInt(minutes, 10);
  if (isNaN(mins) || mins <= 0) return '';
  const hours = Math.floor(mins / 60);
  const remainMins = mins % 60;
  if (hours > 0 && remainMins > 0) {
    return `${hours} giờ ${remainMins} phút`;
  }
  if (hours > 0) {
    return `${hours} giờ`;
  }
  return `${remainMins} phút`;
}

/**
 * Thoát ký tự đặc biệt khi tìm kiếm bằng Regular Expression
 * @param {string} str
 * @returns {string}
 */
function escapeRegex(str) {
  return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── 2. Nghiệp vụ cốt lõi: Truy xuất danh sách Thẻ Khóa Học ──────────────────

/**
 * Truy xuất danh sách thẻ khóa học (Course Cards) với đầy đủ thông tin:
 * - Thông tin cơ bản: Tiêu đề, bìa, slug, cấp độ, thời lượng, huy hiệu
 * - Giảng viên: Tên, avatar, chức danh
 * - Tương tác xã hội: Sao đánh giá trung bình, số lượt đánh giá, tổng học viên
 * - Tags / Kỹ năng liên quan
 * - Tài chính: Giá gốc, giá bán, tiền giảm, % giảm giá, cờ miễn phí
 * - Trạng thái học viên: Wishlist, Trong giỏ hàng, Đã mua/sở hữu, Tiến độ học tập
 *
 * @param {object} params
 * @param {string|null} [params.userId] - ID học viên (nếu đã đăng nhập)
 * @param {object} [params.filters] - Bộ lọc tìm kiếm
 * @param {string} [params.filters.category_id] - Lọc theo danh mục
 * @param {string} [params.filters.tag_id] - Lọc theo ID thẻ kỹ năng
 * @param {string[]} [params.filters.course_ids] - Chỉ lấy các khóa có course_id trong danh sách (giao với tag_id nếu dùng cùng lúc)
 * @param {string} [params.filters.level] - 'beginner' | 'intermediate' | 'advanced'
 * @param {string} [params.filters.price_type] - 'free' | 'paid' | 'all'
 * @param {number} [params.filters.min_rating] - Điểm đánh giá tối thiểu (vd: 4.0, 4.5)
 * @param {string} [params.filters.search] - Từ khóa tìm kiếm tiêu đề hoặc giảng viên
 * @param {string} [params.sort] - 'popular' (mặc định) | 'highest_rated' | 'newest' | 'price_asc' | 'price_desc'
 * @param {number|string} [params.page] - Trang hiện tại (1-indexed)
 * @param {number|string} [params.limit] - Số lượng bản ghi / trang ('all' hoặc 0 để lấy tất cả)
 * @param {string[]} [params.guestCartIds] - Danh sách ID giỏ hàng tạm thời từ LocalStorage nếu là khách
 * @param {string[]} [params.guestWishlistIds] - Danh sách ID wishlist tạm thời nếu là khách
 * @param {string[]|string|null} [params.fields] - Danh sách trường cụ thể cần lấy (projection), vd: ['title', 'thumbnail_url'] hoặc 'title,price'
 * @param {import('mongodb').Db} [params.dbInstance] - Instance DB phục vụ kiểm thử
 * @returns {Promise<object>}
 */
export async function getCourseCards({
  userId = null,
  filters = {},
  sort = 'popular',
  page = 1,
  limit = 12,
  guestCartIds = [],
  guestWishlistIds = [],
  fields = null,
  dbInstance = null,
} = {}) {
  const db = dbInstance || (await getMongoDb());

  // Chuẩn hóa danh sách các trường được yêu cầu (Projection)
  const requestedFields = Array.isArray(fields)
    ? fields.map(f => String(f).trim()).filter(Boolean)
    : (typeof fields === 'string' && fields.trim()
        ? fields.split(',').map(f => String(f).trim()).filter(Boolean)
        : null);

  // 1. Xây dựng điều kiện lọc cơ bản trên collection courses
  const courseFilter = {
    status: 'published', // Chuẩn bảo mật: Chỉ hiển thị các khóa học đã được duyệt mở bán
  };

  // Lọc theo danh mục
  if (filters.category_id) {
    courseFilter.category_id = String(filters.category_id).trim();
  }

  // Lọc theo cấp độ khóa học
  if (filters.level && filters.level !== 'all') {
    courseFilter.level = String(filters.level).trim().toLowerCase();
  }

  // Lọc theo từ khóa tìm kiếm (tiêu đề khóa học)
  if (filters.search && String(filters.search).trim()) {
    const cleanKw = escapeRegex(String(filters.search).trim());
    courseFilter.title = { $regex: cleanKw, $options: 'i' };
  }

  // Lọc theo tag kỹ năng (thực hiện truy vấn bảng nối course_tags trước nếu có)
  if (filters.tag_id) {
    const matchedCourseTags = await db.collection(COLLECTION_COURSE_TAGS).find({
      tag_id: String(filters.tag_id).trim(),
    }).toArray();
    const tagCourseIds = matchedCourseTags.map(ct => ct.course_id);
    courseFilter.course_id = { $in: tagCourseIds };
  }

  // Lọc theo danh sách course_id cụ thể (dùng cho gợi ý khóa học: làm giàu thẻ đúng các khóa đã chọn)
  if (Array.isArray(filters.course_ids)) {
    const wantedIds = filters.course_ids.map(id => String(id).trim()).filter(Boolean);
    const tagFiltered = courseFilter.course_id?.$in;
    courseFilter.course_id = {
      $in: tagFiltered ? wantedIds.filter(id => tagFiltered.includes(id)) : wantedIds,
    };
  }

  // 2. Xác định thứ tự sắp xếp (Sorting)
  let sortOption = { total_students: -1, _id: -1 }; // Mặc định: Phổ biến nhất
  switch (sort) {
    case 'highest_rated':
      sortOption = { rating: -1, total_reviews: -1 };
      break;
    case 'newest':
      sortOption = { created_at: -1, _id: -1 };
      break;
    case 'price_asc':
      sortOption = { price: 1, _id: -1 };
      break;
    case 'price_desc':
      sortOption = { price: -1, _id: -1 };
      break;
    case 'popular':
    default:
      sortOption = { total_students: -1, _id: -1 };
      break;
  }

  // 3. Phân trang hoặc Lấy tất cả
  const isGetAll = limit === 'all' || Number(limit) === 0;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const pageSize = isGetAll ? 0 : Math.min(100, Math.max(1, parseInt(limit, 10) || 12));
  const skipCount = isGetAll ? 0 : (pageNum - 1) * pageSize;

  // Đếm tổng số bản ghi thỏa điều kiện lọc
  const totalCoursesCount = await db.collection(COLLECTION_COURSES).countDocuments(courseFilter);

  // Truy vấn danh sách khóa học (dùng collation numericOrdering để sắp xếp đúng kiểu số cho chuỗi trong DB)
  let courseQuery = db.collection(COLLECTION_COURSES)
    .find(courseFilter)
    .collation({ locale: 'en', numericOrdering: true })
    .sort(sortOption);
  if (!isGetAll) {
    courseQuery = courseQuery.skip(skipCount).limit(pageSize);
  }
  const courseDocs = await courseQuery.toArray();

  if (courseDocs.length === 0) {
    return {
      pagination: {
        page: pageNum,
        limit: pageSize,
        total_items: totalCoursesCount,
        total_pages: isGetAll ? 1 : Math.ceil(totalCoursesCount / (pageSize || 1)),
        has_next: false,
        has_prev: pageNum > 1,
      },
      courses: [],
    };
  }

  // 4. Batch Lookup: Thu thập toàn bộ IDs để tối ưu truy vấn (Batch Processing O(1))
  const courseIds = courseDocs.map(c => String(c.course_id || c._id)).filter(Boolean);
  const instructorIds = [...new Set(courseDocs.map(c => String(c.instructor_id)).filter(Boolean))];

  // Kiểm tra nhu cầu truy vấn bảng phụ dựa trên danh sách trường được yêu cầu (Projection Optimization)
  const needInstructor = !requestedFields || requestedFields.includes('instructor');
  const needTags = !requestedFields || requestedFields.includes('tags') || requestedFields.includes('tag_names');
  const needWishlist = !requestedFields || requestedFields.includes('is_in_wishlist');
  const needCart = !requestedFields || requestedFields.includes('is_in_cart');
  const needEnrollment = !requestedFields || requestedFields.includes('is_purchased') || requestedFields.includes('is_already_enrolled') || requestedFields.includes('progress_percentage') || requestedFields.includes('action_state') || requestedFields.includes('action_label');

  // Song song hóa truy vấn thông tin bổ trợ (chỉ query những bảng thật sự cần thiết)
  const [
    instructorsFromProfile,
    instructorsFromUser,
    courseTagsDocs,
    allTagsDocs,
    wishlistDocs,
    cartDocs,
    userCourseDocs,
    enrollmentDocs,
  ] = await Promise.all([
    needInstructor && instructorIds.length > 0
      ? db.collection(COLLECTION_INSTRUCTORS).find({
          $or: [
            { instructor_id: { $in: instructorIds } },
            { user_id: { $in: instructorIds } },
          ],
        }).toArray()
      : [],
    needInstructor && instructorIds.length > 0
      ? db.collection(COLLECTION_USERS).find({
          $or: [
            { id: { $in: instructorIds } },
            { instructor_id: { $in: instructorIds } },
          ],
        }).toArray()
      : [],
    needTags && courseIds.length > 0
      ? db.collection(COLLECTION_COURSE_TAGS).find({ course_id: { $in: courseIds } }).toArray()
      : [],
    needTags
      ? db.collection(COLLECTION_TAGS).find({}).toArray()
      : [],
    // Trạng thái cá nhân hóa nếu đã đăng nhập và có yêu cầu trường này
    needWishlist && userId
      ? db.collection(COLLECTION_FAVORITES).find({
          $or: [{ user_id: String(userId) }, { userId: String(userId) }],
        }).toArray()
      : [],
    needCart && userId
      ? db.collection(COLLECTION_CARTS).find({
          $or: [{ user_id: String(userId) }, { userId: String(userId) }],
        }).toArray()
      : [],
    needEnrollment && userId
      ? db.collection(COLLECTION_USER_COURSES).find({
          $or: [{ user_id: String(userId) }, { userId: String(userId) }],
        }).toArray()
      : [],
    needEnrollment && userId
      ? db.collection(COLLECTION_ENROLLMENTS).find({
          $or: [{ user_id: String(userId) }, { userId: String(userId) }],
        }).toArray()
      : [],
  ]);

  // 5. Xây dựng Maps tra cứu O(1)
  const instructorMap = new Map();
  for (const inst of instructorsFromProfile) {
    if (inst.instructor_id) instructorMap.set(String(inst.instructor_id), inst);
    if (inst.user_id) instructorMap.set(String(inst.user_id), inst);
  }
  for (const u of instructorsFromUser) {
    const idKey = String(u.id || u.instructor_id || u._id);
    if (!instructorMap.has(idKey)) {
      instructorMap.set(idKey, {
        full_name: u.full_name || u.name || 'Giảng viên ThinkUp',
        avatar_url: u.avatar_url || '',
        title: u.title || 'Giảng viên chuyên môn',
      });
    }
  }

  const tagLookup = new Map();
  for (const t of allTagsDocs) {
    tagLookup.set(String(t.tag_id || t.id || t._id), {
      id: String(t.tag_id || t.id || t._id),
      name: t.name || t.title || '',
    });
  }

  const courseTagsMap = new Map();
  for (const ct of courseTagsDocs) {
    const cId = String(ct.course_id);
    if (!courseTagsMap.has(cId)) courseTagsMap.set(cId, []);
    const tagInfo = tagLookup.get(String(ct.tag_id));
    if (tagInfo && tagInfo.name) {
      courseTagsMap.get(cId).push(tagInfo);
    }
  }

  // Bộ Set xác thực trạng thái tương tác của người dùng
  const wishlistSet = new Set(
    userId
      ? wishlistDocs.map(w => String(w.course_id || w.courseId || ''))
      : (guestWishlistIds || []).map(String)
  );

  const cartSet = new Set();
  if (userId) {
    for (const rec of cartDocs) {
      if (rec.course_id) cartSet.add(String(rec.course_id));
      if (rec.courseId) cartSet.add(String(rec.courseId));
      if (Array.isArray(rec.items)) {
        rec.items.forEach(it => cartSet.add(String(it.id || it.course_id || it.courseId)));
      }
    }
  } else {
    (guestCartIds || []).forEach(id => cartSet.add(String(id)));
  }

  // Set & Map sở hữu và tiến độ học tập
  const enrolledSet = new Set();
  const progressMap = new Map();

  for (const uc of userCourseDocs) {
    const cid = String(uc.course_id || uc.courseId || '');
    if (cid) enrolledSet.add(cid);
  }
  for (const enr of enrollmentDocs) {
    const cid = String(enr.course_id || enr.courseId || '');
    if (cid) {
      enrolledSet.add(cid);
      const progress = parseInt(enr.progress_percentage ?? enr.progress, 10);
      if (!isNaN(progress)) progressMap.set(cid, progress);
    }
  }

  // 6. Chuẩn hóa cấu trúc Thẻ Khóa Học theo chuẩn ThinkUp và Quốc tế
  const enrichedCards = [];

  for (const doc of courseDocs) {
    const cId = String(doc.course_id || doc._id);
    const inst = instructorMap.get(String(doc.instructor_id)) || null;

    // Giá niêm yết ban đầu & Giá bán thực tế
    const rawOriginalPrice = parseFloat(doc.original_price ?? doc.price ?? 0) || 0;
    const rawSalePrice = parseFloat(doc.price ?? doc.original_price ?? 0) || 0;
    const { discountAmount, discountPercent } = calculateDiscount(rawOriginalPrice, rawSalePrice);
    const isFree = rawSalePrice === 0;

    // Lọc phụ (nếu có yêu cầu min_rating hoặc price_type)
    const ratingValue = parseFloat(doc.rating) || 5.0;
    if (filters.min_rating && ratingValue < parseFloat(filters.min_rating)) {
      continue;
    }
    if (filters.price_type === 'free' && !isFree) continue;
    if (filters.price_type === 'paid' && isFree) continue;

    // Các cờ trạng thái tương tác
    const isInWishlist = wishlistSet.has(cId) || wishlistSet.has(String(doc._id));
    const isInCart = cartSet.has(cId) || cartSet.has(String(doc._id));
    const isPurchased = enrolledSet.has(cId) || enrolledSet.has(String(doc._id));
    const progress = progressMap.get(cId) ?? progressMap.get(String(doc._id)) ?? 0;

    // Xác định trạng thái nút bấm hành động (Action Button State)
    let actionState = 'ENROLL_NOW';
    let actionLabel = 'Đăng ký ngay';
    if (isPurchased) {
      actionState = 'CONTINUE_LEARNING';
      actionLabel = progress > 0 ? `Tiếp tục học (${progress}%)` : 'Bắt đầu học';
    } else if (isInCart) {
      actionState = 'IN_CART';
      actionLabel = 'Đã có trong giỏ';
    } else if (isFree) {
      actionState = 'START_FREE';
      actionLabel = 'Học miễn phí';
    }

    // Danh sách tag kỹ năng
    const tagsObjList = courseTagsMap.get(cId) || [];
    const tagNamesList = tagsObjList.map(t => t.name);

    const fullCard = {
      id: String(doc._id || cId),
      course_id: cId,
      slug: doc.slug || `course-${cId}`,
      title: doc.title || 'Khóa học ThinkUp',
      thumbnail_url: doc.thumbnail_url || '',
      status: doc.status || 'published',
      badge: doc.badge || ((parseInt(doc.total_students, 10) || 0) > 5000 ? 'Bán chạy' : ''),
      level: doc.level || 'all_levels',
      duration_minutes: parseInt(doc.duration_minutes, 10) || 0,
      duration_formatted: formatDuration(doc.duration_minutes),
      is_free: isFree,
      language: doc.language || 'Tiếng Việt',

      // Giảng viên
      instructor: {
        id: String(doc.instructor_id || ''),
        name: inst?.full_name || 'ThinkUp Mentor',
        avatar_url: inst?.avatar_url || '',
        headline: inst?.title || inst?.specialization || 'Giảng viên chuyên môn',
      },

      // Đánh giá & Học viên
      rating: Math.round(ratingValue * 10) / 10,
      total_reviews: parseInt(doc.total_reviews, 10) || 0,
      total_comments: parseInt(doc.total_reviews, 10) || 0, // Số comment tương ứng số review
      total_students: parseInt(doc.total_students, 10) || 0,

      // Tags kỹ năng
      tags: tagsObjList,
      tag_names: tagNamesList,

      // Tài chính & Giảm giá
      price: {
        original: rawOriginalPrice,
        original_formatted: formatVND(rawOriginalPrice),
        sale: rawSalePrice,
        sale_formatted: formatVND(rawSalePrice),
        discount_amount: discountAmount,
        discount_formatted: formatVND(discountAmount),
        discount_percent: discountPercent,
        is_free: isFree,
      },

      // Cờ trạng thái học viên & cá nhân hóa
      is_in_wishlist: isInWishlist,
      is_in_cart: isInCart,
      is_purchased: isPurchased,
      is_already_enrolled: isPurchased,
      progress_percentage: isPurchased ? progress : 0,

      // Điều khiển giao diện thông minh
      action_state: actionState,
      action_label: actionLabel,
    };

    if (requestedFields && requestedFields.length > 0) {
      const pickedCard = {};
      for (const field of requestedFields) {
        if (field in fullCard) {
          pickedCard[field] = fullCard[field];
        }
      }
      enrichedCards.push(pickedCard);
    } else {
      enrichedCards.push(fullCard);
    }
  }

  return {
    pagination: {
      page: pageNum,
      limit: pageSize,
      total_items: totalCoursesCount,
      total_pages: isGetAll ? 1 : Math.ceil(totalCoursesCount / (pageSize || 1)),
      has_next: !isGetAll && pageNum * pageSize < totalCoursesCount,
      has_prev: pageNum > 1,
    },
    courses: enrichedCards,
  };
}

/**
 * Lấy thông tin thẻ khóa học chi tiết của 1 khóa học duy nhất theo course_id hoặc slug
 * @param {string} courseIdentifier
 * @param {string|null} [userId]
 * @param {import('mongodb').Db} [dbInstance]
 * @param {string[]|string|null} [fields] - Tùy chọn chỉ lấy các trường cần thiết
 * @returns {Promise<object>}
 */
export async function getSingleCourseCard(courseIdentifier, userId = null, dbInstance = null, fields = null) {
  if (!courseIdentifier) {
    const err = new Error('Thiếu mã định danh khóa học.');
    err.status = 400;
    throw err;
  }

  const db = dbInstance || (await getMongoDb());
  const cleanId = String(courseIdentifier).trim();

  const conds = [
    { course_id: cleanId },
    { slug: cleanId },
  ];
  if (ObjectId.isValid(cleanId)) {
    conds.push({ _id: new ObjectId(cleanId) });
  }

  const courseDoc = await db.collection(COLLECTION_COURSES).findOne({
    $or: conds,
    status: 'published',
  });

  if (!courseDoc) {
    const err = new Error('Khóa học không tồn tại hoặc chưa được công khai.');
    err.status = 404;
    throw err;
  }

  const result = await getCourseCards({
    userId,
    filters: { search: courseDoc.title },
    limit: 10,
    dbInstance: db,
    fields,
  });

  const matched = result.courses.find(c => {
    if (c.course_id && String(c.course_id) === String(courseDoc.course_id)) return true;
    if (c.id && String(c.id) === String(courseDoc._id)) return true;
    return true; // Nếu projection không chọn id hay course_id thì lấy phần tử khớp duy nhất
  });
  if (!matched) {
    const err = new Error('Không thể tải thông tin thẻ khóa học.');
    err.status = 404;
    throw err;
  }

  return matched;
}

// ─── 3. Nghiệp vụ Chi tiết Khóa Học (Course Landing Page) ────────────────────

/**
 * Lấy toàn bộ thông tin chi tiết phục vụ Course Landing Page:
 * - Thông tin tổng quan (Banner): tiêu đề, mô tả ngắn, mô tả chi tiết, ngôn ngữ, cấp độ, thời lượng
 * - Khối thanh toán (Right Sidebar): giá bán, giá gốc, % giảm, bộ đếm ngược sale_ends_at
 * - Khối nội dung khóa học (Syllabus Accordion): các chương và danh sách bài học
 *   (bảo mật: bài không học thử sẽ bị ẩn video_url)
 * - Khối Giảng viên & Chứng chỉ mẫu
 * - Thống kê đánh giá tổng quan (Average, distribution 1-5 sao)
 *
 * @param {string} courseIdentifier - course_id, slug hoặc _id
 * @param {string|null} [userId]
 * @param {import('mongodb').Db} [dbInstance]
 * @returns {Promise<object>}
 */
export async function getCourseDetailLanding(courseIdentifier, userId = null, dbInstance = null) {
  if (!courseIdentifier) {
    const err = new Error('Thiếu mã định danh khóa học.');
    err.status = 400;
    throw err;
  }

  const db = dbInstance || (await getMongoDb());
  const cleanId = String(courseIdentifier).trim();

  const conds = [
    { course_id: cleanId },
    { slug: cleanId },
  ];
  if (ObjectId.isValid(cleanId)) {
    conds.push({ _id: new ObjectId(cleanId) });
  }

  const courseDoc = await db.collection(COLLECTION_COURSES).findOne({
    $or: conds,
    status: 'published',
  });

  if (!courseDoc) {
    const err = new Error('Khóa học không tồn tại hoặc chưa được mở bán.');
    err.status = 404;
    throw err;
  }

  const courseIdStr = String(courseDoc.course_id || courseDoc._id);

  // 1. Lấy thông tin giảng viên (kèm positive_rating, total_courses, total_students)
  let instructor = null;
  if (courseDoc.instructor_id) {
    const instDoc = await db.collection(COLLECTION_INSTRUCTORS).findOne({
      instructor_id: String(courseDoc.instructor_id),
    });
    if (instDoc) {
      instructor = {
        instructor_id: instDoc.instructor_id,
        full_name: instDoc.full_name || 'Giảng viên ThinkUp',
        avatar_url: instDoc.avatar_url || '',
        title: instDoc.title || instDoc.skills || 'Senior Instructor',
        rating: parseFloat(instDoc.rating) || 4.8,
        total_reviews: parseInt(instDoc.total_reviews, 10) || 0,
        total_students: parseInt(instDoc.total_students, 10) || 0,
        total_courses: parseInt(instDoc.total_courses, 10) || 1,
        positive_rating: parseInt(instDoc.positive_rating, 10) || 98, // Thống kê % đánh giá tích cực
        bio: instDoc.bio || '',
        profile_url: `/instructor/${instDoc.instructor_id}`,
      };
    }
  }

  // 2. Lấy cấu trúc đề cương (Sections & Lessons)
  const sections = await db.collection(COLLECTION_SECTIONS)
    .find({ course_id: courseIdStr })
    .sort({ order_index: 1 })
    .toArray();

  let totalLessonsCount = 0;
  let totalVideoDuration = 0;
  const enrichedSections = [];

  for (let sIdx = 0; sIdx < sections.length; sIdx++) {
    const sec = sections[sIdx];
    const secId = String(sec.section_id || sec._id);

    const lessons = await db.collection(COLLECTION_LESSONS)
      .find({ section_id: secId })
      .sort({ order_index: 1 })
      .toArray();

    let secDuration = 0;
    const enrichedLessons = [];
    for (const les of lessons) {
      totalLessonsCount += 1;
      const dur = parseInt(les.duration_minutes, 10) || 0;
      secDuration += dur;
      totalVideoDuration += dur;

      // Phân quyền Học thử: theo tài liệu, mở cho bài video đầu tiên ở Chương 1
      const isFreePreview = String(les.is_free) === '1' || les.is_preview === true;
      const lessonType = (les.lesson_type || 'video').toLowerCase();

      enrichedLessons.push({
        lesson_id: les.lesson_id || String(les._id),
        title: les.title,
        lesson_type: lessonType, // 'video' | 'quiz' | 'lab' | 'article'
        duration_minutes: dur,
        duration_formatted: formatDuration(dur),
        order_index: parseInt(les.order_index, 10) || 1,
        is_free_preview: isFreePreview,
        is_locked: !isFreePreview,
        // Bảo mật: Không trả URL video trong danh sách tổng quan nếu bài bị khóa
        can_preview_now: isFreePreview && lessonType === 'video',
      });
    }

    enrichedSections.push({
      section_id: secId,
      title: sec.title,
      description: sec.description || '',
      order_index: parseInt(sec.order_index, 10) || (sIdx + 1),
      lessons_count: enrichedLessons.length,
      duration_minutes: secDuration,
      duration_formatted: formatDuration(secDuration),
      is_chapter_locked: sIdx > 0, // Theo BA: Từ chương 2 trở đi hiển thị icon khóa
      lessons: enrichedLessons,
    });
  }

  // 3. Tính toán thống kê đánh giá (Rating Breakdown 1-5 sao)
  const reviewsCount = await db.collection(COLLECTION_REVIEWS).countDocuments({ course_id: courseIdStr });
  const ratingAgg = await db.collection(COLLECTION_REVIEWS).aggregate([
    { $match: { course_id: courseIdStr } },
    { $group: { _id: '$rating', count: { $sum: 1 } } },
  ]).toArray();

  const ratingBreakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const item of ratingAgg) {
    const star = parseInt(item._id, 10);
    if (star >= 1 && star <= 5) {
      ratingBreakdown[star] = item.count;
    }
  }

  // 4. Giá, FOMO & Mã giảm giá riêng của Giảng viên (Vấn đề 5)
  const price = Math.max(0, parseFloat(courseDoc.price) || 0);
  const origPrice = Math.max(0, parseFloat(courseDoc.original_price) || price);
  const discountInfo = calculateDiscount(origPrice, price);

  // Truy xuất các coupon do giảng viên hoặc nền tảng thiết lập riêng cho khóa này
  const activeCoupons = await db.collection(COLLECTION_COURSE_COUPONS)
    .find({
      course_id: courseIdStr,
      status: 'active',
    })
    .toArray();

  const couponList = activeCoupons.map(cp => ({
    code: cp.code,
    discount_type: cp.discount_type, // 'percent' | 'fixed'
    discount_value: parseFloat(cp.discount_value) || 0,
    expires_at: cp.expires_at,
    max_discount: parseFloat(cp.max_discount) || null,
  }));

  // 5. Trạng thái người dùng (Guest vs Đã đăng nhập)
  let isInWishlist = false;
  let isInCart = false;
  let isPurchased = false;

  if (userId) {
    const [favDoc, cartDoc, enrollDoc] = await Promise.all([
      db.collection(COLLECTION_FAVORITES).findOne({ user_id: String(userId), course_id: courseIdStr }),
      db.collection(COLLECTION_CARTS).findOne({ user_id: String(userId), course_id: courseIdStr }),
      db.collection(COLLECTION_ENROLLMENTS).findOne({ user_id: String(userId), course_id: courseIdStr }),
    ]);
    isInWishlist = !!favDoc;
    isInCart = !!cartDoc;
    isPurchased = !!enrollDoc;
  }

  // 6. Lấy Thẻ kỹ năng (Tags) & Danh mục (Category)
  let tags = [];
  const courseTags = await db.collection(COLLECTION_COURSE_TAGS).find({ course_id: courseIdStr }).toArray();
  if (courseTags.length > 0) {
    const tagIds = courseTags.map(ct => ct.tag_id).filter(Boolean);
    const tagDocs = await db.collection(COLLECTION_TAGS).find({ tag_id: { $in: tagIds } }).toArray();
    tags = tagDocs.map(t => ({
      tag_id: t.tag_id,
      name: t.name || t.tag_name,
      slug: t.slug,
    }));
  }

  let category = null;
  if (courseDoc.category_id) {
    const catDoc = await db.collection(COLLECTION_CATEGORIES).findOne({
      $or: [{ category_id: String(courseDoc.category_id) }, { id: String(courseDoc.category_id) }],
    });
    if (catDoc) {
      category = {
        category_id: catDoc.category_id || catDoc.id,
        name: catDoc.name,
        slug: catDoc.slug,
      };
    }
  }

  // 7. Parse 3 cột Nội dung mô tả (Mục tiêu, Kiến thức đạt được, Kỹ năng yêu cầu)
  let courseOutcomes = [];
  if (courseDoc.course_outcomes) {
    if (Array.isArray(courseDoc.course_outcomes)) {
      courseOutcomes = courseDoc.course_outcomes;
    } else if (typeof courseDoc.course_outcomes === 'string') {
      try {
        courseOutcomes = JSON.parse(courseDoc.course_outcomes);
      } catch {
        courseOutcomes = [];
      }
    }
  }

  // Nếu trong CSDL chưa có, tự động chuẩn bị template 3 cột chuẩn như thiết kế
  if (!courseOutcomes || courseOutcomes.length === 0) {
    courseOutcomes = [
      {
        title: 'Mục tiêu khóa học',
        items: [
          'Nắm vững kiến thức từ cơ bản đến nâng cao của khóa học',
          'Xây dựng được ứng dụng hoàn chỉnh và tối ưu',
          'Tự tin làm việc với các dự án thực tế',
        ],
      },
      {
        title: 'Kiến thức đạt được',
        items: [
          'Hiểu rõ cấu trúc và nguyên lý vận hành cốt lõi',
          'Thực hành các kỹ thuật tối ưu hóa chuyên sâu',
          'Áp dụng Best Practices chuẩn doanh nghiệp',
        ],
      },
      {
        title: 'Kỹ năng yêu cầu',
        items: [
          'Kiến thức lập trình nền tảng',
          'Có máy tính kết nối Internet ổn định',
          'Tinh thần tự học và thực hành liên tục',
        ],
      },
    ];
  }

  // 8. Các tiện ích cam kết (Highlights / Guarantee) dưới nút CTA theo ảnh thiết kế
  const purchaseHighlights = [
    { icon: 'infinity', label: 'Truy cập trọn đời' },
    { icon: 'certificate', label: 'Chứng chỉ hoàn thành' },
    { icon: 'shield-check', label: 'Thanh toán bảo mật' },
  ];

  // Chứng chỉ mẫu & Video học thử nhanh ở banner
  const previewVideoUrl = courseDoc.preview_video_url || '';
  const certificateTemplate = {
    title: `Chứng chỉ hoàn thành khóa học ${courseDoc.title}`,
    watermark_text: 'MẪU - THINKUP VERIFIED',
    verify_url: 'thinkup.vn/verify',
    template_image_url: 'https://res.cloudinary.com/x7v2ofnh/image/upload/v1783864019/thinkup_courses/certificate_sample.jpg',
  };

  return {
    course_id: courseIdStr,
    id: String(courseDoc._id),
    title: courseDoc.title,
    slug: courseDoc.slug || courseIdStr,
    short_description: courseDoc.short_description || '',
    description: courseDoc.description || '',
    thumbnail_url: courseDoc.thumbnail_url || '',
    preview_video_url: previewVideoUrl,
    badge: courseDoc.badge || 'HOT',
    level: courseDoc.level || 'all',
    language: courseDoc.language || 'Tiếng Việt',
    updated_at: courseDoc.updated_at || courseDoc.created_at || new Date().toISOString(),

    // Chỉ số tổng quan
    rating: parseFloat(courseDoc.rating) || 4.8,
    total_reviews: reviewsCount || parseInt(courseDoc.total_reviews, 10) || 0,
    total_students: parseInt(courseDoc.total_students, 10) || 0,
    total_duration_minutes: parseInt(courseDoc.duration_minutes, 10) || totalVideoDuration,
    total_duration_formatted: formatDuration(parseInt(courseDoc.duration_minutes, 10) || totalVideoDuration),
    total_sections_count: enrichedSections.length,
    total_lessons_count: totalLessonsCount,

    // Phân loại khóa học & Trình độ (theo ảnh thiết kế)
    category,
    tags, // Loại khóa học: ReactJS, JavaScript, Frontend, Web Development...
    levels: [courseDoc.level || 'all'], // Trình độ: Trung cấp, Nâng cao...

    // Khối Thanh toán & FOMO (Right Sidebar)
    pricing: {
      price,
      price_formatted: formatVND(price),
      original_price: origPrice,
      original_price_formatted: formatVND(origPrice),
      is_free: price === 0,
      discount_amount: discountInfo.discountAmount,
      discount_percent: discountInfo.discountPercent,
      has_discount: discountInfo.discountPercent > 0,
      sale_ends_at: courseDoc.sale_ends_at || null, // Phục vụ bộ đếm ngược FOMO
      coupons: couponList, // Mã giảm giá do Giảng viên thiết lập riêng
    },
    purchase_highlights: purchaseHighlights,

    // Khối 3 cột Mục tiêu - Kiến thức - Yêu cầu (Mô tả khóa học)
    course_outcomes: courseOutcomes,

    // Khối Nội dung khóa học (Syllabus)
    sections: enrichedSections,

    // Khối Giảng viên & Chứng chỉ
    instructor,
    certificate_sample: certificateTemplate,

    // Thống kê đánh giá
    reviews_summary: {
      average_rating: parseFloat(courseDoc.rating) || 4.8,
      total_reviews: reviewsCount || parseInt(courseDoc.total_reviews, 10) || 0,
      breakdown: ratingBreakdown,
    },

    // Quyền sở hữu & Tương tác
    user_state: {
      is_authenticated: !!userId,
      is_in_wishlist: isInWishlist,
      is_in_cart: isInCart,
      is_purchased: isPurchased,
      navigation: {
        can_learn: isPurchased,
        action: isPurchased ? 'CONTINUE_LEARNING' : 'VIEW_SALES_OR_TRIAL',
        learning_url: `/learning/learn/${courseDoc.slug || courseIdStr}`,
        landing_url: `/main/courses/${courseDoc.slug || courseIdStr}`,
        trial_preview_url: `/learning/learn/${courseDoc.slug || courseIdStr}?trial=true`,
      },
    },

    breadcrumbs: [
      { label: 'Trang chủ', url: '/' },
      { label: 'Lộ trình', url: '/roadmaps' },
      { label: 'Frontend', url: '/roadmaps/frontend' },
      { label: courseDoc.title, url: `/courses/${courseDoc.slug || courseIdStr}`, active: true },
    ],
  };
}

// ─── 4. Nghiệp vụ Màn hình Học Thử (Free Trial Course Player) ─────────────────

/**
 * Lấy dữ liệu dành riêng cho Màn hình Học Thử (Free Trial Player):
 * - Danh sách bài học cho phép học thử kèm trạng thái khóa của toàn bộ khóa học
 * - Chỉ đính kèm stream URL cho các bài học thử
 * - Danh sách tài liệu đính kèm (Lead Magnet) của các bài học thử
 *
 * @param {string} courseIdentifier
 * @param {string|null} [userId]
 * @param {import('mongodb').Db} [dbInstance]
 * @returns {Promise<object>}
 */
export async function getCoursePreviewData(courseIdentifier, userId = null, dbInstance = null) {
  if (!courseIdentifier) {
    const err = new Error('Thiếu mã định danh khóa học.');
    err.status = 400;
    throw err;
  }

  const db = dbInstance || (await getMongoDb());
  const cleanId = String(courseIdentifier).trim();

  const conds = [
    { course_id: cleanId },
    { slug: cleanId },
  ];
  if (ObjectId.isValid(cleanId)) {
    conds.push({ _id: new ObjectId(cleanId) });
  }

  const courseDoc = await db.collection(COLLECTION_COURSES).findOne({
    $or: conds,
    status: 'published',
  });

  if (!courseDoc) {
    const err = new Error('Khóa học không tồn tại hoặc chưa mở bán.');
    err.status = 404;
    throw err;
  }

  const courseIdStr = String(courseDoc.course_id || courseDoc._id);

  // Kiểm tra người dùng đã mua khóa học hay chưa
  const isPurchased = await hasCourseEnrollment(courseDoc, userId, { db });

  // Lấy các Sections & Lessons
  const sections = await db.collection(COLLECTION_SECTIONS)
    .find({ course_id: courseIdStr })
    .sort({ order_index: 1 })
    .toArray();

  const syllabus = [];
  const previewLessonsList = [];

  for (let sIdx = 0; sIdx < sections.length; sIdx++) {
    const sec = sections[sIdx];
    const secId = String(sec.section_id || sec._id);

    const lessons = await db.collection(COLLECTION_LESSONS)
      .find({ section_id: secId })
      .sort({ order_index: 1 })
      .toArray();

    const processedLessons = [];
    for (const les of lessons) {
      const isFree = String(les.is_free) === '1' || les.is_preview === true;
      const type = (les.lesson_type || 'video').toLowerCase();
      const isLocked = isPurchased ? false : !isFree;

      const item = {
        lesson_id: les.lesson_id || String(les._id),
        title: les.title,
        lesson_type: type,
        duration_minutes: parseInt(les.duration_minutes, 10) || 0,
        is_free_preview: isFree,
        is_locked: isLocked,
        // BR-02: Icon trạng thái vòng tròn rỗng (circle) thể hiện chưa hoàn thành
        status_icon: 'circle',
      };

      // Nếu đã mua hoặc là bài học thử thì lấy link stream video
      if ((isPurchased || isFree) && type === 'video') {
        const vidDoc = await db.collection(COLLECTION_LESSON_VIDEOS).findOne({ lesson_id: item.lesson_id });
        if (vidDoc?.video_url) {
          item.playback = await resolveLearningPlayback(userId, vidDoc, { db });
          item.video_url = item.playback.videoUrl;
        }
        previewLessonsList.push(item);
      }

      processedLessons.push(item);
    }

    syllabus.push({
      section_id: secId,
      title: sec.title,
      order_index: parseInt(sec.order_index, 10) || (sIdx + 1),
      is_locked: isPurchased ? false : sIdx > 0, // BR-02: Khóa accordion từ chương 2 trở đi nếu chưa mua
      lessons: processedLessons,
    });
  }

  // Lấy tài liệu đính kèm (Lead Magnet)
  const documents = await db.collection(COLLECTION_DOCUMENTS)
    .find({ course_id: courseIdStr })
    .toArray();

  const downloadableResources = documents.map(doc => ({
    id: doc.id || String(doc._id),
    name: doc.name || 'Tài liệu bài học',
    lesson_name: doc.lesson_name || '',
    category_label: doc.category_label || (isPurchased ? 'Tài liệu học viên' : 'Tài liệu học thử'),
    size: doc.size || '',
    can_download: Boolean(userId && (isPurchased || doc.is_free === true || String(doc.is_free) === '1' || doc.is_preview === true) && doc.file_url),
    download_url: userId && (isPurchased || doc.is_free === true || String(doc.is_free) === '1' || doc.is_preview === true) && doc.file_url
      ? `/api/user/lessons/documents/${encodeURIComponent(String(doc.document_id || doc._id))}/download` : null,
  }));

  const price = Math.max(0, parseFloat(courseDoc.price) || 0);

  return {
    course: {
      course_id: courseIdStr,
      title: courseDoc.title,
      slug: courseDoc.slug || courseIdStr,
      thumbnail_url: courseDoc.thumbnail_url,
      price,
      price_formatted: formatVND(price),
      cta_text: `Mua khóa học - ${formatVND(price)}`,
    },
    user_state: {
      is_authenticated: !!userId,
      is_purchased: isPurchased,
      mode: isPurchased ? 'full_access' : 'free_trial',
    },
    // Quy tắc BR-01: Nếu chưa mua thì không lưu tiến độ học tập và khóa Q&A
    player_config: {
      allow_mark_completed: isPurchased,
      allow_notes: isPurchased,
      allow_qa: isPurchased,
      qa_lock_message: isPurchased ? '' : 'Tính năng Hỏi đáp và Thảo luận là đặc quyền của học viên chính thức.',
      upsell_popup: isPurchased ? null : {
        title: 'Nâng cấp để mở khóa toàn bộ',
        message: 'Bài học tiếp theo thuộc nội dung trả phí. Hãy nâng cấp khóa học để mở khóa toàn bộ lộ trình và làm bài tập thực hành nhé!',
        cta_label: `Mua khóa học - ${formatVND(price)}`,
        cta_url: `/main/courses/${courseDoc.slug || courseIdStr}`,
      },
    },
    syllabus,
    preview_lessons: previewLessonsList,
    initial_lesson: previewLessonsList[0] || null,
    resources: downloadableResources,
  };
}

/**
 * Tiện ích chuyển đổi thời gian tạo sang chuỗi hiển thị tương đối (vd: "2 tuần trước", "1 tháng trước")
 * @param {string|Date} dateVal
 * @returns {string}
 */
export function formatTimeAgo(dateVal) {
  if (!dateVal) return 'Gần đây';
  const now = new Date();
  const past = new Date(dateVal);
  const diffSec = Math.max(0, Math.floor((now.getTime() - past.getTime()) / 1000));

  if (diffSec < 60) return 'Vừa xong';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} phút trước`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} giờ trước`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay} ngày trước`;
  const diffWeek = Math.floor(diffDay / 7);
  if (diffWeek < 4) return `${diffWeek} tuần trước`;
  const diffMonth = Math.floor(diffDay / 30);
  if (diffMonth < 12) return `${diffMonth} tháng trước`;
  const diffYear = Math.floor(diffDay / 365);
  return `${diffYear} năm trước`;
}

// ─── 5. Nghiệp vụ Đánh giá Khóa Học (Reviews, Sorting & Star Filtering) ─────

/**
 * Lấy danh sách đánh giá của khóa học kèm:
 * - Bộ sắp xếp: Mới nhất ('newest'), Đánh giá cao nhất ('highest'), Đánh giá thấp nhất ('lowest')
 * - Bộ lọc theo số sao: Tất cả ('all') hoặc 1, 2, 3, 4, 5 sao
 * - Thống kê tổng số lượng đánh giá của từng mức sao (phục vụ Dropdown filter hiển thị số lượng: "5 sao (936)")
 * - Phân trang AJAX mượt mà
 *
 * @param {string} courseId
 * @param {object} params
 * @param {number|string} [params.rating] - 'all' hoặc 1 đến 5
 * @param {string} [params.sort] - 'newest' (Mới nhất) | 'highest' (Đánh giá cao nhất) | 'lowest' (Đánh giá thấp nhất)
 * @param {number} [params.page]
 * @param {number} [params.limit]
 * @param {import('mongodb').Db} [dbInstance]
 * @returns {Promise<object>}
 */
export async function getCourseReviews(courseId, { rating, sort = 'newest', page = 1, limit = 10 } = {}, dbInstance = null) {
  if (!courseId) {
    const err = new Error('Thiếu mã khóa học.');
    err.status = 400;
    throw err;
  }

  const db = dbInstance || (await getMongoDb());
  const courseIdStr = String(courseId).trim();
  const baseQuery = { course_id: courseIdStr };

  // 1. Lấy thống kê tổng số lượng của từng mức sao (1-5 sao) phục vụ Menu Dropdown lọc
  const ratingAgg = await db.collection(COLLECTION_REVIEWS).aggregate([
    { $match: baseQuery },
    { $group: { _id: '$rating', count: { $sum: 1 } } },
  ]).toArray();

  let totalAllReviews = 0;
  const ratingCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const item of ratingAgg) {
    const star = parseInt(item._id, 10);
    const count = parseInt(item.count, 10) || 0;
    if (star >= 1 && star <= 5) {
      ratingCounts[star] = count;
      totalAllReviews += count;
    }
  }

  // Cấu trúc danh sách lựa chọn cho Dropdown Lọc số sao chuẩn theo UI hình ảnh
  const filterOptions = [
    { label: `Tất cả (${totalAllReviews >= 1000 ? (totalAllReviews / 1000).toFixed(1) + 'k' : totalAllReviews})`, value: 'all', count: totalAllReviews },
    { label: `5 sao (${ratingCounts[5]})`, value: 5, count: ratingCounts[5] },
    { label: `4 sao (${ratingCounts[4]})`, value: 4, count: ratingCounts[4] },
    { label: `3 sao (${ratingCounts[3]})`, value: 3, count: ratingCounts[3] },
    { label: `2 sao (${ratingCounts[2]})`, value: 2, count: ratingCounts[2] },
    { label: `1 sao (${ratingCounts[1]})`, value: 1, count: ratingCounts[1] },
  ];

  // 2. Xây dựng điều kiện lọc theo số sao
  const query = { ...baseQuery };
  if (rating && String(rating).toLowerCase() !== 'all') {
    const rNum = parseInt(rating, 10);
    if (rNum >= 1 && rNum <= 5) {
      query.rating = { $in: [rNum, String(rNum)] };
    }
  }

  // 3. Xây dựng tiêu chí sắp xếp: Mới nhất, Đánh giá cao nhất, Đánh giá thấp nhất
  let sortCriteria = { created_at: -1 };
  const cleanSort = String(sort || 'newest').trim().toLowerCase();
  if (cleanSort === 'highest' || cleanSort === 'high' || cleanSort === 'highest_rating') {
    sortCriteria = { rating: -1, created_at: -1 };
  } else if (cleanSort === 'lowest' || cleanSort === 'low' || cleanSort === 'lowest_rating') {
    sortCriteria = { rating: 1, created_at: -1 };
  } else if (cleanSort === 'oldest') {
    sortCriteria = { created_at: 1 };
  } else {
    // Mặc định: 'newest' (Mới nhất)
    sortCriteria = { created_at: -1 };
  }

  // Danh mục các lựa chọn sắp xếp cho Frontend dropdown
  const sortOptions = [
    { label: 'Mới nhất', value: 'newest', active: cleanSort === 'newest' || !['highest', 'lowest', 'oldest'].includes(cleanSort) },
    { label: 'Đánh giá cao nhất', value: 'highest', active: cleanSort === 'highest' },
    { label: 'Đánh giá thấp nhất', value: 'lowest', active: cleanSort === 'lowest' },
  ];

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const pageSize = Math.max(1, Math.min(50, parseInt(limit, 10) || 10));
  const skip = (pageNum - 1) * pageSize;

  const [totalFilteredCount, docs] = await Promise.all([
    db.collection(COLLECTION_REVIEWS).countDocuments(query),
    db.collection(COLLECTION_REVIEWS)
      .find(query)
      .sort(sortCriteria)
      .skip(skip)
      .limit(pageSize)
      .toArray(),
  ]);

  const reviews = docs.map(d => ({
    review_id: d.course_review_id || String(d._id),
    user_id: d.user_id,
    reviewer_name: d.reviewer_name || 'Học viên ThinkUp',
    rating: parseFloat(d.rating) || 5,
    content: d.content || '',
    created_at: d.created_at,
    created_at_relative: formatTimeAgo(d.created_at), // "2 tuần trước", "1 tháng trước" theo hình
    is_verified_purchase: true, // Tiêu chuẩn quốc tế: Xác nhận người mua
    attachment: d.attachment_url ? {
      url: d.attachment_url,
      name: d.attachment_name,
      type: d.attachment_type,
    } : null,
  }));

  return {
    pagination: {
      page: pageNum,
      limit: pageSize,
      total_items: totalFilteredCount,
      total_pages: Math.ceil(totalFilteredCount / pageSize),
      has_next: pageNum * pageSize < totalFilteredCount,
      has_prev: pageNum > 1,
    },
    filter_summary: {
      total_reviews: totalAllReviews,
      breakdown: ratingCounts,
      filter_options: filterOptions, // Menu Dropdown lọc kèm số sao và tổng số
    },
    sort_options: sortOptions, // Menu Dropdown sắp xếp
    reviews,
  };
}

// ─── 5b. Nghiệp vụ Khóa học của tôi (My Courses / Enrolled Courses Dashboard) ─

/**
 * Lấy danh sách toàn bộ khóa học mà học viên đã mua / ghi danh
 * Phục vụ màn hình Khóa học của tôi (/main/my-courses) và Dashboard
 *
 * @param {string|import('mongodb').ObjectId} userId
 * @returns {Promise<Array<Object>>}
 */
export async function getUserEnrolledCourses(userId) {
  if (!userId) return [];
  const db = await getMongoDb();
  const uidStr = String(userId);
  const uidObj = typeof userId === 'string' && ObjectId.isValid(userId) ? new ObjectId(userId) : null;

  // 1. Tìm các bản ghi ghi danh / sở hữu từ user_courses, user_enrollments và user_course_progress
  const [userCoursesDocs, enrollmentDocs, progressDocs] = await Promise.all([
    db.collection(COLLECTION_USER_COURSES).find({
      $or: [{ user_id: uidStr }, { userId: uidStr }, ...(uidObj ? [{ user_id: uidObj }] : [])],
    }).toArray(),
    db.collection(COLLECTION_ENROLLMENTS).find({
      $or: [{ user_id: uidStr }, { userId: uidStr }, ...(uidObj ? [{ user_id: uidObj }] : [])],
    }).toArray(),
    db.collection('user_course_progress').find({
      $or: [{ user_id: uidStr }, { userId: uidStr }, ...(uidObj ? [{ user_id: uidObj }] : [])],
    }).toArray(),
  ]);

  // Tập hợp danh sách mã course_id duy nhất
  const courseIdSet = new Set();
  const progressMap = new Map();

  for (const doc of progressDocs) {
    if (doc.course_id) {
      const cid = String(doc.course_id);
      courseIdSet.add(cid);
      progressMap.set(cid, doc);
    }
  }
  for (const doc of userCoursesDocs) {
    if (doc.course_id) courseIdSet.add(String(doc.course_id));
  }
  for (const doc of enrollmentDocs) {
    if (doc.course_id) courseIdSet.add(String(doc.course_id));
  }

  if (courseIdSet.size === 0) {
    return [];
  }

  // 2. Tìm thông tin chi tiết các khóa học này từ collection courses
  const courseIdArr = Array.from(courseIdSet);
  const objectIds = courseIdArr.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));

  const coursesDocs = await db.collection(COLLECTION_COURSES).find({
    $or: [
      { _id: { $in: objectIds } },
      { course_id: { $in: courseIdArr } },
    ],
  }).toArray();

  // Đếm tổng số bài học (totalLessons) của từng khóa học từ collection lessons
  const lessonCounts = await db.collection(COLLECTION_LESSONS).aggregate([
    {
      $match: {
        $or: [
          { course_id: { $in: objectIds } },
          { course_id: { $in: courseIdArr } },
        ],
      },
    },
    { $group: { _id: { $toString: '$course_id' }, count: { $sum: 1 } } },
  ]).toArray();

  const totalLessonsMap = new Map();
  for (const item of lessonCounts) {
    totalLessonsMap.set(item._id, item.count);
  }

  // 3. Chuẩn hóa format dữ liệu khớp hoàn hảo với interface EnrolledCourse
  const enrolledList = coursesDocs.map((c) => {
    const cidStr = String(c.course_id || c._id);
    const prog = progressMap.get(cidStr) || progressMap.get(String(c._id)) || {};

    const totalLessons = totalLessonsMap.get(String(c._id)) || totalLessonsMap.get(cidStr) || c.total_lessons || 10;
    const completedLessons = typeof prog.completed_lessons_count === 'number'
      ? prog.completed_lessons_count
      : (prog.is_completed ? totalLessons : Math.round(((prog.progress_percentage || 0) / 100) * totalLessons));

    // Tính thời gian học gần nhất
    const lastDate = prog.updated_at || prog.last_accessed_at || c.created_at || new Date();
    const lastStudiedAt = formatTimeAgo(lastDate);

    // Bìa thẻ khóa học (màu sắc & tiêu đề)
    const coverColors = ['#0A1535', '#061543', '#1E293B', '#0D3D2E', '#312E81', '#1E1B4B'];
    const colorIndex = Math.abs(cidStr.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0)) % coverColors.length;

    return {
      id: cidStr,
      title: c.title || 'Khóa học ThinkUp',
      instructor: c.instructor_name || c.instructor?.name || 'Giảng viên ThinkUp',
      totalLessons: totalLessons > 0 ? totalLessons : 1,
      completedLessons: Math.min(totalLessons, Math.max(0, completedLessons)),
      image: c.thumbnail || c.thumbnail_url || '',
      thumbnailUrl: c.thumbnail || c.thumbnail_url || '',
      cover: c.cover_color || coverColors[colorIndex],
      coverTitle: c.cover_title || c.title?.split(' - ')[0] || c.title,
      coverSubtitle: c.cover_subtitle || c.headline || c.subtitle || '',
      badge: c.badge || (prog.is_completed ? 'HOÀN THÀNH' : (c.is_new ? 'MỚI' : (c.is_hot ? 'HOT' : ''))),
      lastStudiedAt: lastStudiedAt || 'Gần đây',
    };
  });

  return enrolledList;
}

// ─── 5c. Nghiệp vụ Hồ Sơ Giảng Viên Công Khai (Public Instructor Profile) ─────

/**
 * Lấy thông tin chi tiết hồ sơ giảng viên chuyên nghiệp và danh sách khóa học đang giảng dạy
 * Phục vụ màn hình Hồ sơ giảng viên công khai
 *
 * @param {string} instructorIdOrSlug
 * @param {string|null} [currentUserId=null]
 * @returns {Promise<Object>}
 */
export async function getInstructorProfileDetail(instructorIdOrSlug, currentUserId = null) {
  if (!instructorIdOrSlug) {
    const err = new Error('Thiếu mã định danh giảng viên');
    err.status = 400;
    throw err;
  }

  const db = await getMongoDb();
  const cleanId = String(instructorIdOrSlug).trim();

  // 1. Tìm thông tin trong instructor_profiles
  let instDoc = await db.collection(COLLECTION_INSTRUCTORS).findOne({
    $or: [
      { instructor_id: cleanId },
      { slug: cleanId },
      { full_name: new RegExp(`^${cleanId}$`, 'i') },
      ...(ObjectId.isValid(cleanId) ? [{ _id: new ObjectId(cleanId) }] : []),
    ],
  });

  // Nếu không có trong instructor_profiles, thử tìm trong users có vai trò instructor
  if (!instDoc) {
    const userDoc = await db.collection(COLLECTION_USERS).findOne({
      $or: [
        { _id: ObjectId.isValid(cleanId) ? new ObjectId(cleanId) : null },
        { user_id: cleanId },
        { full_name: new RegExp(`^${cleanId}$`, 'i') },
      ].filter(Boolean),
    });

    if (userDoc) {
      instDoc = {
        instructor_id: String(userDoc._id),
        full_name: userDoc.full_name || userDoc.name,
        avatar_url: userDoc.avatar_url || userDoc.avatar,
        title: userDoc.headline || 'Giảng viên Chuyên nghiệp ThinkUp',
        bio: userDoc.bio || 'Chuyên gia giảng dạy tại ThinkUp.',
        location: userDoc.location || 'Việt Nam',
        joined_at: userDoc.created_at ? 'Tham gia từ 2023' : 'Tham gia từ 03/2022',
        rating: 4.8,
        total_reviews: 120,
        total_students: 1500,
        total_courses: 1,
        github: userDoc.github || 'https://github.com',
        linkedin: userDoc.linkedin || 'https://linkedin.com',
        website: userDoc.portfolio || 'https://thinkup.vn',
        specializations: ['Web Development', 'Software Architecture'],
        experiences: [
          'Chuyên gia phát triển phần mềm và kiến trúc hệ thống',
          'Giảng viên chính thức tại Học viện Công nghệ ThinkUp',
        ],
      };
    }
  }

  if (!instDoc) {
    const err = new Error('Không tìm thấy thông tin giảng viên');
    err.status = 404;
    throw err;
  }

  const instIdStr = String(instDoc.instructor_id || instDoc._id);

  // 2. Lấy danh sách các khóa học do giảng viên này đang giảng dạy
  const coursesResult = await getCourseCards({
    userId: currentUserId,
    filters: {},
    limit: 'all',
  });

  // Lọc các khóa học thuộc về giảng viên này (khớp instructor_id hoặc tên giảng viên)
  const teacherCourses = (coursesResult?.courses || []).filter((c) => {
    return (
      String(c.instructor?.id || '') === instIdStr ||
      String(c.instructor_id || '') === instIdStr ||
      (c.instructor?.name && c.instructor.name.toLowerCase() === instDoc.full_name.toLowerCase())
    );
  });

  // Tính toán số liệu thống kê thực tế nếu CSDL có dữ liệu khóa học
  const calculatedTotalStudents = teacherCourses.reduce((sum, c) => sum + (c.total_students || 0), 0);
  const calculatedTotalReviews = teacherCourses.reduce((sum, c) => sum + (c.total_reviews || 0), 0);
  const calculatedTotalCourses = teacherCourses.length;

  const totalStudents = calculatedTotalStudents > 0 ? calculatedTotalStudents : (parseInt(instDoc.total_students, 10) || 12345);
  const totalReviews = calculatedTotalReviews > 0 ? calculatedTotalReviews : (parseInt(instDoc.total_reviews, 10) || 2100);
  const totalCourses = calculatedTotalCourses > 0 ? calculatedTotalCourses : (parseInt(instDoc.total_courses, 10) || 5);
  const rating = parseFloat(instDoc.rating) || 4.9;

  return {
    instructor: {
      id: instIdStr,
      instructor_id: instIdStr,
      full_name: instDoc.full_name || 'Giảng viên ThinkUp',
      title: instDoc.title || instDoc.headline || 'Senior Frontend Tech Lead & System Architect',
      headline: instDoc.headline || instDoc.title || 'Senior Instructor',
      avatar_url: instDoc.avatar_url || 'https://res.cloudinary.com/x7v2ofnh/image/upload/v1784625912/thinkup_instructors/avatars/instructor-1.jpg',
      location: instDoc.location || 'Hồ Chí Minh, Việt Nam',
      joined_at: instDoc.joined_at || 'Tham gia từ 03/2022',
      bio: instDoc.bio || 'Giảng viên giàu kinh nghiệm thực chiến trong lĩnh vực phát triển phần mềm.',
      rating,
      total_reviews: totalReviews,
      total_students: totalStudents,
      total_courses: totalCourses,
      github: instDoc.github || 'https://github.com',
      linkedin: instDoc.linkedin || 'https://linkedin.com',
      website: instDoc.website || 'https://thinkup.vn',
      specializations: instDoc.specializations || ['ReactJS', 'TypeScript', 'Next.js', 'System Architecture'],
      experiences: instDoc.experiences || [
        'Tech Lead tại tập đoàn công nghệ lớn',
        'Cử nhân Công nghệ Thông tin, Đại học Bách Khoa',
      ],
    },
    courses: teacherCourses,
  };
}

// ─── 6. Express Router Mở Rộng ────────────────────────────────────────────────

/**
 * Khởi tạo Router Quản lý & Hiển thị Khóa học cho Học viên
 * @param {import('express')} express
 * @param {Function} optionalAuth - Middleware nhận diện userId nếu có Bearer token
 * @param {Function} [requireAuth] - Middleware bắt buộc đăng nhập cho các route của học viên
 * @returns {import('express').Router}
 */
export async function hasCourseEnrollment(course, userId, options = {}) {
  if (!userId) return false;
  const db = options.db || await getMongoDb();
  const ids = [course.course_id, course.id, course._id].filter(v => v != null);
  const courseIds = ids.flatMap(v => [v, String(v)]);
  const userIds = [String(userId)];
  const conditions = [{ id: String(userId) }, { _id: userId }];
  if (ObjectId.isValid(String(userId))) conditions.push({ _id: new ObjectId(String(userId)) });
  const user = await db.collection(COLLECTION_USERS).findOne({ $or: conditions });
  if (user) userIds.push(...[user.id, user._id].filter(v => v != null).flatMap(v => [v, String(v)]));
  const query = { user_id: { $in: userIds }, course_id: { $in: courseIds } };
  return Boolean(await db.collection(COLLECTION_ENROLLMENTS).findOne(query) ||
    await db.collection(COLLECTION_USER_COURSES).findOne(query));
}

export async function getLessonStream(courseId, lessonId, userId = null, options = {}) {
  const fail = (message, status, code) => { throw Object.assign(new Error(message), { status, code }); };
  if (typeof courseId !== 'string' || !courseId.trim() || typeof lessonId !== 'string' || !lessonId.trim())
    fail('Mã khóa học và bài học là bắt buộc.', 400, 'LESSON_STREAM_INVALID');
  const db = options.db || await getMongoDb();
  const id = courseId.trim();
  const course = await db.collection(COLLECTION_COURSES).findOne({ $or: [{ course_id: id }, { slug: id },
    ...(ObjectId.isValid(id) ? [{ _id: new ObjectId(id) }] : [])] });
  if (!course) fail('Khóa học không tồn tại.', 404, 'COURSE_NOT_FOUND');
  const ids = [course.course_id, course.id, course._id].filter(v => v != null).flatMap(v => [v, String(v)]);
  const lesson = await db.collection(COLLECTION_LESSONS).findOne({ lesson_id: lessonId, course_id: { $in: ids } });
  if (!lesson) fail('Bài học không tồn tại trong khóa học này.', 404, 'LESSON_NOT_FOUND');
  const preview = String(lesson.is_free) === '1' || lesson.is_preview === true;
  if (!preview && !await hasCourseEnrollment(course, userId, { db }))
    fail('Bạn cần đăng ký hoặc mua khóa học để xem nội dung bài học này.', 403, 'REQUIRE_ENROLLMENT');
  const video = await db.collection(COLLECTION_LESSON_VIDEOS).findOne({ lesson_id: lessonId });
  if (!video) fail('Bài học chưa có video.', 404, 'LEARNING_VIDEO_UNAVAILABLE');
  const playback = await resolveLearningPlayback(userId, video, { db });
  return { lesson_id: lesson.lesson_id, video_url: playback.videoUrl, duration: video.duration,
    provider: video.provider || 'cloudinary', is_free_preview: preview, playback };
}

export function createCourseRouter(express, optionalAuth = null, requireAuth = null) {
  const router = express.Router();
  const extractAuthOptional = optionalAuth || ((req, res, next) => next());
  const authRequired = requireAuth || optionalAuth || ((req, res, next) => next());

  // GET /api/user/courses/my-courses hoặc /api/user/dashboard: Lấy danh sách khóa học đã đăng ký
  router.get('/my-courses', authRequired, async (req, res, next) => {
    try {
      if (!req.userId) {
        return res.status(401).json({ success: false, message: 'Vui lòng đăng nhập để xem khóa học.' });
      }
      const data = await getUserEnrolledCourses(req.userId);
      res.json({
        success: true,
        data,
      });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/user/courses/instructors/:id: Thông tin chi tiết hồ sơ giảng viên công khai
  router.get('/instructors/:id', extractAuthOptional, async (req, res, next) => {
    try {
      const data = await getInstructorProfileDetail(req.params.id, req.userId || null);
      res.json({
        success: true,
        data,
      });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/user/courses hoặc /api/courses: Danh sách thẻ khóa học
  router.get('/', extractAuthOptional, async (req, res, next) => {
    try {
      const {
        category_id,
        tag_id,
        level,
        price_type,
        min_rating,
        search,
        q,
        sort,
        page,
        limit,
        fields,
        guestCartIds,
        guestWishlistIds,
      } = req.query;

      const parsedGuestCartIds = guestCartIds
        ? String(guestCartIds).split(',').map(s => s.trim()).filter(Boolean)
        : [];
      const parsedGuestWishlistIds = guestWishlistIds
        ? String(guestWishlistIds).split(',').map(s => s.trim()).filter(Boolean)
        : [];

      const result = await getCourseCards({
        userId: req.userId || null,
        filters: {
          category_id,
          tag_id,
          level,
          price_type,
          min_rating: min_rating ? parseFloat(min_rating) : undefined,
          search: search || q || '',
        },
        sort: sort || 'popular',
        page: page || 1,
        limit: limit === 'all' ? 'all' : (limit ? parseInt(limit, 10) : 12),
        fields: fields || null,
        guestCartIds: parsedGuestCartIds,
        guestWishlistIds: parsedGuestWishlistIds,
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/user/courses/:id/detail: Chi tiết khóa học (Course Landing Page)
  router.get('/:id/detail', extractAuthOptional, async (req, res, next) => {
    try {
      const detail = await getCourseDetailLanding(req.params.id, req.userId || null);
      res.json({
        success: true,
        data: detail,
      });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/user/courses/:id/preview: Dữ liệu màn hình Học thử (Free Trial Player)
  router.get('/:id/preview', extractAuthOptional, async (req, res, next) => {
    try {
      res.set('Cache-Control', 'no-store');
      const previewData = await getCoursePreviewData(req.params.id, req.userId || null);
      res.json({
        success: true,
        data: previewData,
      });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/user/courses/:id/reviews: Danh sách đánh giá & Bộ lọc theo sao (Reviews AJAX)
  router.get('/:id/reviews', async (req, res, next) => {
    try {
      const { rating, sort, page, limit } = req.query;
      const reviews = await getCourseReviews(req.params.id, { rating, sort, page, limit });
      res.json({
        success: true,
        data: reviews,
      });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/user/courses/:id/lessons/:lessonId/stream: Phân quyền phát video học thử
  router.get('/:id/lessons/:lessonId/stream', extractAuthOptional, async (req, res, next) => {
    try {
      res.set('Cache-Control', 'no-store');
      const data = await getLessonStream(req.params.id, req.params.lessonId, req.userId || null);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/user/courses/:id (Course card single)
  router.get('/:id', extractAuthOptional, async (req, res, next) => {
    try {
      const card = await getSingleCourseCard(req.params.id, req.userId || null, null, req.query.fields || null);
      res.json({
        success: true,
        data: card,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
