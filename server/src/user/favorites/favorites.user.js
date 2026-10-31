import { ObjectId } from 'mongodb';
import { getMongoDb } from '../db.js';
import { getCourseCards } from '../course/course.user.js';

// ─── 0. Tên Collection CSDL MongoDB ──────────────────────────────────────────
export const COLLECTION_FAVORITES = 'user_favorite_courses';
export const COLLECTION_COURSES = 'courses';
export const COLLECTION_USERS = 'users';

// ─── 1. Các chế độ sắp xếp hỗ trợ (Sort Options) ─────────────────────────────
export const SORT_OPTIONS = {
  NEWEST: 'newest',               // Mới thêm vào danh sách yêu thích nhất (Mặc định)
  OLDEST: 'oldest',               // Thêm vào danh sách yêu thích sớm nhất
  ADDED_DESC: 'added_desc',       // Alias của newest
  ADDED_ASC: 'added_asc',         // Alias của oldest
  PRICE_ASC: 'price_asc',         // Giá tăng dần (Miễn phí -> Giá thấp -> Giá cao)
  PRICE_DESC: 'price_desc',       // Giá giảm dần (Giá cao -> Giá thấp -> Miễn phí)
  HIGHEST_RATED: 'highest_rated', // Đánh giá sao cao nhất
  RATING_DESC: 'rating_desc',     // Alias của highest_rated
  TITLE_ASC: 'title_asc',         // Tên khóa học A -> Z
  TITLE_DESC: 'title_desc',       // Tên khóa học Z -> A
  POPULAR: 'popular',             // Số lượng học viên đông nhất
};

/**
 * Hàm sắp xếp danh sách khóa học yêu thích đa tiêu chí
 * @param {Array<Object>} items - Danh sách khóa học đã được làm giàu
 * @param {string} [sort='newest'] - Tiêu chí sắp xếp
 * @returns {Array<Object>} - Mảng mới đã được sắp xếp
 */
export function sortFavoriteCourses(items = [], sort = SORT_OPTIONS.NEWEST) {
  if (!Array.isArray(items) || items.length <= 1) {
    return Array.isArray(items) ? [...items] : [];
  }

  const list = [...items];
  const sortMode = String(sort || SORT_OPTIONS.NEWEST).trim().toLowerCase();

  return list.sort((a, b) => {
    switch (sortMode) {
      case 'oldest':
      case 'added_asc': {
        const timeA = new Date(a.favorited_at || a.created_at || 0).getTime();
        const timeB = new Date(b.favorited_at || b.created_at || 0).getTime();
        return timeA - timeB;
      }

      case 'price_asc': {
        const priceA = Number(a.price?.sale ?? a.price ?? 0);
        const priceB = Number(b.price?.sale ?? b.price ?? 0);
        if (priceA !== priceB) return priceA - priceB;
        // Nếu bằng giá, ưu tiên rating cao hơn
        return (Number(b.rating) || 0) - (Number(a.rating) || 0);
      }

      case 'price_desc': {
        const priceA = Number(a.price?.sale ?? a.price ?? 0);
        const priceB = Number(b.price?.sale ?? b.price ?? 0);
        if (priceA !== priceB) return priceB - priceA;
        return (Number(b.rating) || 0) - (Number(a.rating) || 0);
      }

      case 'highest_rated':
      case 'rating_desc': {
        const ratingA = Number(a.rating) || 0;
        const ratingB = Number(b.rating) || 0;
        if (ratingB !== ratingA) return ratingB - ratingA;
        return (Number(b.total_reviews) || 0) - (Number(a.total_reviews) || 0);
      }

      case 'title_asc': {
        const titleA = String(a.title || '').trim();
        const titleB = String(b.title || '').trim();
        return titleA.localeCompare(titleB, 'vi', { sensitivity: 'base' });
      }

      case 'title_desc': {
        const titleA = String(a.title || '').trim();
        const titleB = String(b.title || '').trim();
        return titleB.localeCompare(titleA, 'vi', { sensitivity: 'base' });
      }

      case 'popular': {
        const studentsA = Number(a.total_students) || 0;
        const studentsB = Number(b.total_students) || 0;
        if (studentsB !== studentsA) return studentsB - studentsA;
        return (Number(b.rating) || 0) - (Number(a.rating) || 0);
      }

      case 'newest':
      case 'added_desc':
      default: {
        const timeA = new Date(a.favorited_at || a.created_at || 0).getTime();
        const timeB = new Date(b.favorited_at || b.created_at || 0).getTime();
        return timeB - timeA;
      }
    }
  });
}

// ─── 2. Các hàm nghiệp vụ xử lý Yêu thích (Core Business Logic) ──────────────

/**
 * Lấy danh sách ID các khóa học yêu thích của học viên (Truy xuất nhanh O(1) phục vụ kiểm tra cờ)
 * @param {string} userId - Mã định danh học viên
 * @param {import('mongodb').Db} [dbInstance]
 * @returns {Promise<string[]>}
 */
export async function getUserFavoriteCourseIds(userId, dbInstance = null) {
  if (!userId) return [];
  const db = dbInstance || (await getMongoDb());
  const cleanUserId = String(userId).trim();

  const records = await db.collection(COLLECTION_FAVORITES)
    .find({
      $or: [{ user_id: cleanUserId }, { userId: cleanUserId }],
    })
    .sort({ created_at: -1, _id: -1 })
    .toArray();

  const idSet = new Set();
  for (const r of records) {
    const cid = String(r.course_id || r.courseId || '').trim();
    if (cid) idSet.add(cid);
  }

  return Array.from(idSet);
}

/**
 * Kiểm tra xem một khóa học có nằm trong danh sách yêu thích của người dùng hay không
 * @param {string} userId
 * @param {string} courseId
 * @param {import('mongodb').Db} [dbInstance]
 * @returns {Promise<boolean>}
 */
export async function checkFavoriteStatus(userId, courseId, dbInstance = null) {
  if (!userId || !courseId) return false;
  const db = dbInstance || (await getMongoDb());
  const cleanUserId = String(userId).trim();
  const cleanCourseId = String(courseId).trim();

  const record = await db.collection(COLLECTION_FAVORITES).findOne({
    $and: [
      { $or: [{ user_id: cleanUserId }, { userId: cleanUserId }] },
      { $or: [{ course_id: cleanCourseId }, { courseId: cleanCourseId }] },
    ],
  });

  return Boolean(record);
}

/**
 * Thêm một khóa học vào danh sách yêu thích (Chống trùng lặp & kiểm tra khóa học tồn tại)
 * @param {string} userId - Mã người dùng đăng nhập
 * @param {string} courseId - Mã khóa học cần yêu thích
 * @param {import('mongodb').Db} [dbInstance]
 * @returns {Promise<{ success: boolean, message: string, course_id: string, is_favorite: boolean, created_at: Date }>}
 */
export async function addFavoriteCourse(userId, courseId, dbInstance = null) {
  if (!userId) {
    const error = new Error('Yêu cầu đăng nhập để lưu khóa học yêu thích.');
    error.status = 401;
    throw error;
  }

  const cleanCourseId = String(courseId || '').trim();
  if (!cleanCourseId) {
    const error = new Error('Mã khóa học không được để trống.');
    error.status = 400;
    throw error;
  }

  const db = dbInstance || (await getMongoDb());
  const cleanUserId = String(userId).trim();

  // 1. Kiểm tra khóa học có tồn tại trong hệ thống hay không
  const courseConds = [
    { course_id: cleanCourseId },
    { slug: cleanCourseId },
  ];
  if (ObjectId.isValid(cleanCourseId)) {
    courseConds.push({ _id: new ObjectId(cleanCourseId) });
  }

  const courseDoc = await db.collection(COLLECTION_COURSES).findOne({ $or: courseConds });
  if (!courseDoc) {
    const error = new Error('Khóa học không tồn tại hoặc đã bị xóa khỏi hệ thống.');
    error.status = 404;
    throw error;
  }

  const canonicalCourseId = String(courseDoc.course_id || courseDoc._id || cleanCourseId);

  // 2. Kiểm tra xem người dùng đã yêu thích khóa học này chưa (Idempotency)
  const existing = await db.collection(COLLECTION_FAVORITES).findOne({
    $and: [
      { $or: [{ user_id: cleanUserId }, { userId: cleanUserId }] },
      { $or: [{ course_id: canonicalCourseId }, { courseId: canonicalCourseId }, { course_id: cleanCourseId }] },
    ],
  });

  if (existing) {
    return {
      success: true,
      message: 'Khóa học đã có sẵn trong danh sách yêu thích của bạn.',
      course_id: canonicalCourseId,
      is_favorite: true,
      created_at: existing.created_at || new Date(),
    };
  }

  // 3. Thêm bản ghi mới vào CSDL
  const now = new Date();
  await db.collection(COLLECTION_FAVORITES).insertOne({
    user_id: cleanUserId,
    course_id: canonicalCourseId,
    created_at: now,
  });

  return {
    success: true,
    message: 'Đã thêm khóa học vào danh sách yêu thích thành công.',
    course_id: canonicalCourseId,
    is_favorite: true,
    created_at: now,
  };
}

/**
 * Xóa một khóa học khỏi danh sách yêu thích
 * @param {string} userId
 * @param {string} courseId
 * @param {import('mongodb').Db} [dbInstance]
 * @returns {Promise<{ success: boolean, message: string, course_id: string, is_favorite: boolean }>}
 */
export async function removeFavoriteCourse(userId, courseId, dbInstance = null) {
  if (!userId) {
    const error = new Error('Yêu cầu đăng nhập.');
    error.status = 401;
    throw error;
  }

  const cleanCourseId = String(courseId || '').trim();
  if (!cleanCourseId) {
    const error = new Error('Mã khóa học không được để trống.');
    error.status = 400;
    throw error;
  }

  const db = dbInstance || (await getMongoDb());
  const cleanUserId = String(userId).trim();

  await db.collection(COLLECTION_FAVORITES).deleteMany({
    $and: [
      { $or: [{ user_id: cleanUserId }, { userId: cleanUserId }] },
      { $or: [{ course_id: cleanCourseId }, { courseId: cleanCourseId }] },
    ],
  });

  return {
    success: true,
    message: 'Đã xóa khóa học khỏi danh sách yêu thích.',
    course_id: cleanCourseId,
    is_favorite: false,
  };
}

/**
 * Bật/tắt trạng thái yêu thích (Toggle Favorite)
 * Phục vụ trực tiếp thao tác click nút Trái Tim trên thẻ khóa học
 * @param {string} userId
 * @param {string} courseId
 * @param {import('mongodb').Db} [dbInstance]
 * @returns {Promise<{ success: boolean, action: 'added'|'removed', is_favorite: boolean, message: string, course_id: string }>}
 */
export async function toggleFavoriteCourse(userId, courseId, dbInstance = null) {
  if (!userId) {
    const error = new Error('Yêu cầu đăng nhập để thực hiện chức năng này.');
    error.status = 401;
    throw error;
  }

  const cleanCourseId = String(courseId || '').trim();
  if (!cleanCourseId) {
    const error = new Error('Mã khóa học không được để trống.');
    error.status = 400;
    throw error;
  }

  const db = dbInstance || (await getMongoDb());
  const cleanUserId = String(userId).trim();

  // Kiểm tra trạng thái hiện tại
  const existing = await db.collection(COLLECTION_FAVORITES).findOne({
    $and: [
      { $or: [{ user_id: cleanUserId }, { userId: cleanUserId }] },
      { $or: [{ course_id: cleanCourseId }, { courseId: cleanCourseId }] },
    ],
  });

  if (existing) {
    // Đang có -> Xóa bỏ
    await removeFavoriteCourse(cleanUserId, cleanCourseId, db);
    return {
      success: true,
      action: 'removed',
      is_favorite: false,
      message: 'Đã xóa khóa học khỏi danh sách yêu thích.',
      course_id: cleanCourseId,
    };
  }

  // Chưa có -> Thêm mới
  const addRes = await addFavoriteCourse(cleanUserId, cleanCourseId, db);
  return {
    success: true,
    action: 'added',
    is_favorite: true,
    message: 'Đã thêm khóa học vào danh sách yêu thích.',
    course_id: addRes.course_id,
  };
}

/**
 * Đồng bộ danh sách khóa học yêu thích đa thiết bị (Multi-device Sync)
 * Khi học viên đăng nhập trên máy tính này thì sang điện thoại hay máy tính khác vẫn đồng bộ 100%
 * Cho phép gửi danh sách tạm thời (Guest Wishlist) từ client lên để hợp nhất vào MongoDB
 * @param {string} userId - Mã học viên
 * @param {string[]|string} clientCourseIds - Danh sách mã khóa học lưu tạm trên thiết bị
 * @param {import('mongodb').Db} [dbInstance]
 * @returns {Promise<{ success: boolean, message: string, syncedCount: number, course_ids: string[], total: number }>}
 */
export async function syncFavoritesLogic(userId, clientCourseIds = [], dbInstance = null) {
  if (!userId) {
    const error = new Error('Yêu cầu đăng nhập để đồng bộ danh sách yêu thích.');
    error.status = 401;
    throw error;
  }

  const db = dbInstance || (await getMongoDb());
  const cleanUserId = String(userId).trim();

  // Chuẩn hóa danh sách ID từ thiết bị gửi lên
  let rawList = [];
  if (Array.isArray(clientCourseIds)) {
    rawList = clientCourseIds;
  } else if (typeof clientCourseIds === 'string' && clientCourseIds.trim()) {
    rawList = clientCourseIds.split(',');
  }

  const uniqueClientIds = [
    ...new Set(
      rawList
        .map(id => String(id || '').trim())
        .filter(Boolean)
    ),
  ];

  // 1. Lấy danh sách yêu thích hiện tại từ MongoDB
  const currentDbRecords = await db.collection(COLLECTION_FAVORITES)
    .find({
      $or: [{ user_id: cleanUserId }, { userId: cleanUserId }],
    })
    .toArray();

  const existingCourseIds = new Set(
    currentDbRecords.map(r => String(r.course_id || r.courseId || '').trim()).filter(Boolean)
  );

  // 2. Tìm các ID khóa học trên thiết bị client chưa có trên MongoDB
  const idsToInsert = uniqueClientIds.filter(id => !existingCourseIds.has(id));
  let newlyInsertedCount = 0;

  if (idsToInsert.length > 0) {
    // Xác thực các khóa học tồn tại trước khi chèn để đảm bảo tính toàn vẹn dữ liệu
    const validCourses = await db.collection(COLLECTION_COURSES)
      .find({
        $or: [
          { course_id: { $in: idsToInsert } },
          { _id: { $in: idsToInsert.filter(id => ObjectId.isValid(id)).map(id => new ObjectId(id)) } },
        ],
      })
      .toArray();

    const validIdSet = new Set();
    for (const c of validCourses) {
      if (c.course_id) validIdSet.add(String(c.course_id));
      if (c._id) validIdSet.add(String(c._id));
    }

    const docsToInsert = [];
    const now = new Date();

    for (const cid of idsToInsert) {
      if (validIdSet.has(cid)) {
        docsToInsert.push({
          user_id: cleanUserId,
          course_id: cid,
          created_at: now,
          synced_from_device: true,
        });
      }
    }

    if (docsToInsert.length > 0) {
      await db.collection(COLLECTION_FAVORITES).insertMany(docsToInsert);
      newlyInsertedCount = docsToInsert.length;
    }
  }

  // 3. Truy xuất toàn bộ danh sách 100% sau đồng bộ trả về cho client lưu cache
  const allSyncedIds = await getUserFavoriteCourseIds(cleanUserId, db);

  return {
    success: true,
    message: `Đồng bộ thành công. Đã hợp nhất ${newlyInsertedCount} khóa học mới vào tài khoản của bạn.`,
    syncedCount: newlyInsertedCount,
    course_ids: allSyncedIds,
    total: allSyncedIds.length,
  };
}

/**
 * Lấy danh sách chi tiết các khóa học yêu thích (Kèm bộ lọc, tìm kiếm, phân trang và SẮP XẾP)
 * @param {Object} params
 * @param {string} params.userId
 * @param {string} [params.sort='newest']
 * @param {number|string} [params.page=1]
 * @param {number|string} [params.limit=12]
 * @param {string} [params.search='']
 * @param {string} [params.category_id]
 * @param {string} [params.level]
 * @param {import('mongodb').Db} [params.dbInstance]
 * @returns {Promise<{ favorites: Array<Object>, total: number, page: number, limit: number, totalPages: number, course_ids: string[] }>}
 */
export async function getUserFavorites({
  userId,
  sort = SORT_OPTIONS.NEWEST,
  page = 1,
  limit = 12,
  search = '',
  category_id = null,
  level = null,
  dbInstance = null,
} = {}) {
  if (!userId) {
    const error = new Error('Yêu cầu đăng nhập để xem danh sách yêu thích.');
    error.status = 401;
    throw error;
  }

  const db = dbInstance || (await getMongoDb());
  const cleanUserId = String(userId).trim();

  // 1. Lấy toàn bộ bản ghi yêu thích của người dùng trong CSDL
  const favoriteRecords = await db.collection(COLLECTION_FAVORITES)
    .find({
      $or: [{ user_id: cleanUserId }, { userId: cleanUserId }],
    })
    .sort({ created_at: -1 })
    .toArray();

  if (!favoriteRecords || favoriteRecords.length === 0) {
    return {
      favorites: [],
      total: 0,
      page: 1,
      limit: Number(limit) || 12,
      totalPages: 0,
      course_ids: [],
    };
  }

  // Tạo Map lưu thời điểm bấm yêu thích để phục vụ sắp xếp theo ngày thêm vào
  const favoritedAtMap = new Map();
  const rawFavoriteCourseIds = [];

  for (const rec of favoriteRecords) {
    const cid = String(rec.course_id || rec.courseId || '').trim();
    if (cid && !favoritedAtMap.has(cid)) {
      favoritedAtMap.set(cid, rec.created_at || new Date());
      rawFavoriteCourseIds.push(cid);
    }
  }

  // 2. Làm giàu dữ liệu chi tiết thẻ khóa học thông qua getCourseCards
  const courseCardsRes = await getCourseCards({
    userId: cleanUserId,
    filters: {
      course_ids: rawFavoriteCourseIds,
      category_id: category_id || undefined,
      level: level || undefined,
      search: search || '',
    },
    limit: 'all', // Lấy toàn bộ các thẻ đã yêu thích để sắp xếp chính xác trước khi phân trang
    dbInstance: db,
  });

  const enrichedCards = (courseCardsRes?.courses || []).map(card => {
    const cardId = String(card.course_id || card.id);
    const addedAt = favoritedAtMap.get(cardId) || favoritedAtMap.get(String(card.id)) || new Date();
    return {
      ...card,
      is_in_wishlist: true,
      favorited_at: addedAt,
    };
  });

  // 3. Kích hoạt hàm sắp xếp (Sắp xếp đa tiêu chí)
  const sortedCards = sortFavoriteCourses(enrichedCards, sort);

  // 4. Phân trang
  const isGetAll = limit === 'all' || Number(limit) === 0;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const pageSize = isGetAll ? sortedCards.length : Math.max(1, parseInt(limit, 10) || 12);
  const totalCount = sortedCards.length;
  const totalPages = isGetAll ? 1 : Math.ceil(totalCount / pageSize) || 1;

  const paginatedCards = isGetAll
    ? sortedCards
    : sortedCards.slice((pageNum - 1) * pageSize, pageNum * pageSize);

  return {
    favorites: paginatedCards,
    total: totalCount,
    page: pageNum,
    limit: pageSize,
    totalPages,
    course_ids: rawFavoriteCourseIds,
  };
}

/**
 * Xóa sạch toàn bộ danh sách yêu thích của người dùng
 * @param {string} userId
 * @param {import('mongodb').Db} [dbInstance]
 * @returns {Promise<{ success: boolean, message: string, deletedCount: number }>}
 */
export async function clearUserFavorites(userId, dbInstance = null) {
  if (!userId) {
    const error = new Error('Yêu cầu đăng nhập.');
    error.status = 401;
    throw error;
  }
  const db = dbInstance || (await getMongoDb());
  const cleanUserId = String(userId).trim();

  const res = await db.collection(COLLECTION_FAVORITES).deleteMany({
    $or: [{ user_id: cleanUserId }, { userId: cleanUserId }],
  });

  return {
    success: true,
    message: 'Đã xóa toàn bộ danh sách khóa học yêu thích.',
    deletedCount: res.deletedCount || 0,
  };
}

// ─── 3. Express Router: /api/user/favorites ──────────────────────────────────

/**
 * Khởi tạo Router Quản lý Khóa học Yêu thích cho Học viên
 * @param {import('express')} express
 * @param {Function} requireAuth - Middleware bắt buộc đăng nhập
 * @param {Function} [optionalAuth] - Middleware nhận diện nếu có token
 * @returns {import('express').Router}
 */
export function createFavoritesRouter(express, requireAuth, optionalAuth = null) {
  const router = express.Router();
  const extractAuthOptional = optionalAuth || ((req, res, next) => next());

  // 3.1. GET /api/user/favorites - Lấy danh sách khóa học yêu thích đầy đủ (kèm sort, page, limit, search)
  router.get('/', requireAuth, async (req, res, next) => {
    try {
      const {
        sort = SORT_OPTIONS.NEWEST,
        page = 1,
        limit = 12,
        search = '',
        q = '',
        category_id,
        level,
      } = req.query;

      const result = await getUserFavorites({
        userId: req.userId,
        sort,
        page,
        limit,
        search: search || q || '',
        category_id,
        level,
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  });

  // 3.2. GET /api/user/favorites/ids - Lấy nhanh danh sách ID các khóa học đã thích (Hỗ trợ FE check cờ siêu tốc)
  router.get('/ids', requireAuth, async (req, res, next) => {
    try {
      const ids = await getUserFavoriteCourseIds(req.userId);
      res.json({
        success: true,
        data: {
          course_ids: ids,
          total: ids.length,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  // 3.3. GET /api/user/favorites/check/:courseId - Kiểm tra 1 khóa học có nằm trong yêu thích không
  router.get('/check/:courseId', extractAuthOptional, async (req, res, next) => {
    try {
      const { courseId } = req.params;
      const isFav = req.userId ? await checkFavoriteStatus(req.userId, courseId) : false;
      res.json({
        success: true,
        data: {
          course_id: String(courseId),
          is_favorite: isFav,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  // 3.4. POST /api/user/favorites/sync - Đồng bộ danh sách từ máy tính sang điện thoại hoặc từ LocalStorage khi đăng nhập
  router.post('/sync', requireAuth, async (req, res, next) => {
    try {
      const { course_ids, courseIds, guestWishlistIds } = req.body;
      const targetIds = course_ids || courseIds || guestWishlistIds || [];

      const result = await syncFavoritesLogic(req.userId, targetIds);
      res.json({
        success: true,
        message: result.message,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  });

  // 3.5. POST /api/user/favorites/toggle - Bật/Tắt yêu thích (Toggle favorite)
  router.post('/toggle', requireAuth, async (req, res, next) => {
    try {
      const { course_id, courseId } = req.body;
      const targetId = course_id || courseId;

      const result = await toggleFavoriteCourse(req.userId, targetId);
      res.json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  });

  // 3.6. POST /api/user/favorites - Thêm khóa học vào yêu thích
  router.post('/', requireAuth, async (req, res, next) => {
    try {
      const { course_id, courseId } = req.body;
      const targetId = course_id || courseId;

      const result = await addFavoriteCourse(req.userId, targetId);
      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  });

  // 3.7. DELETE /api/user/favorites/:courseId - Xóa khóa học khỏi yêu thích theo URL params
  router.delete('/:courseId', requireAuth, async (req, res, next) => {
    try {
      const { courseId } = req.params;
      const result = await removeFavoriteCourse(req.userId, courseId);
      res.json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  });

  // 3.8. DELETE /api/user/favorites - Xóa khóa học khỏi yêu thích theo request body
  router.delete('/', requireAuth, async (req, res, next) => {
    try {
      const { course_id, courseId, clearAll } = req.body;

      if (clearAll === true || clearAll === 'true') {
        const clearRes = await clearUserFavorites(req.userId);
        return res.json({
          success: true,
          data: clearRes,
        });
      }

      const targetId = course_id || courseId;
      const result = await removeFavoriteCourse(req.userId, targetId);
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
