import { ObjectId } from 'mongodb';
import { getMongoDb } from '../db.js';

// ─── 0. Hằng Số & Cấu Hình Collection ─────────────────────────────────────────

export const COLLECTION_FLASHCARD_LISTS = 'flashcard_lists';
export const COLLECTION_USER_ROADMAPS = 'user_roadmaps';

/** Trạng thái thẻ flashcard theo yêu cầu nghiệp vụ */
export const CARD_STATUS_LEARNED = 'Đã học';
export const CARD_STATUS_REVIEW = 'ôn tập';
export const CARD_STATUS_NOT_LEARNED = 'chưa học';

export const VALID_CARD_STATUSES = [
  CARD_STATUS_LEARNED,
  CARD_STATUS_REVIEW,
  CARD_STATUS_NOT_LEARNED,
];

/** 3 Chế độ học Flashcard */
export const LEARNING_MODE_ORDER = 'order'; // Học theo thứ tự do người dùng tạo
export const LEARNING_MODE_RANDOM = 'random'; // Học ngẫu nhiên (xáo trộn thứ tự)
export const LEARNING_MODE_RESTART = 'restart'; // Học lại từ đầu (reset toàn bộ về chưa học và học theo thứ tự)

export const VALID_LEARNING_MODES = [
  LEARNING_MODE_ORDER,
  LEARNING_MODE_RANDOM,
  LEARNING_MODE_RESTART,
];

/** Trạng thái node trên Roadmap */
export const ROADMAP_STATUS_REVIEW = 'review';
export const ROADMAP_STATUS_COMPLETED = 'completed';
export const ROADMAP_STATUS_IN_PROGRESS = 'in_progress';

// ─── 1. Tiện Ích Hỗ Trợ (Utilities) ─────────────────────────────────────────

/**
 * Định dạng ngày sang DD/MM/YYYY theo đúng yêu cầu nghiệp vụ
 * @param {Date|string|number} dateInput
 * @returns {string} Chuỗi ngày DD/MM/YYYY
 */
export function formatDateDDMMYYYY(dateInput) {
  if (!dateInput) return '';
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Chuyển chuỗi ID sang ObjectId an toàn (hỗ trợ cả ObjectId và string test id)
 * @param {string|ObjectId} id
 * @returns {ObjectId|string}
 */
export function toObjectId(id) {
  if (!id) return null;
  if (id instanceof ObjectId) return id;
  if (typeof id === 'string' && ObjectId.isValid(id) && id.length === 24) {
    try {
      return new ObjectId(id);
    } catch {
      return id;
    }
  }
  return id;
}

/**
 * Chuyển đổi trạng thái thẻ theo chu kỳ 3 trạng thái linh hoạt khi click:
 * 'chưa học' -> 'ôn tập' -> 'Đã học' -> 'chưa học'
 * @param {string} currentStatus
 * @returns {'chưa học'|'ôn tập'|'Đã học'}
 */
export function cycleCardStatus(currentStatus) {
  if (currentStatus === CARD_STATUS_NOT_LEARNED) {
    return CARD_STATUS_REVIEW; // chưa học -> ôn tập
  }
  if (currentStatus === CARD_STATUS_REVIEW) {
    return CARD_STATUS_LEARNED; // ôn tập -> Đã học
  }
  return CARD_STATUS_NOT_LEARNED; // Đã học -> chưa học
}

/**
 * Chuẩn hóa action cập nhật trạng thái thẻ khi học:
 * - Người dùng nhấn 'đã học' -> 'Đã học'
 * - Người dùng nhấn 'chưa nhớ' / 'ôn tập' -> 'ôn tập'
 * - Không cập nhật cái nào từ 2 cái trên -> 'chưa học'
 * - Hỗ trợ action 'cycle' / 'toggle' để đổi vòng 3 trạng thái khi click
 * @param {string} action
 * @param {string} [currentStatus]
 * @returns {'Đã học'|'ôn tập'|'chưa học'}
 */
export function normalizeCardStatusAction(action, currentStatus = null) {
  if (!action) return CARD_STATUS_NOT_LEARNED;
  const normalized = String(action).trim().toLowerCase();

  // Xoay vòng trạng thái khi click toggle
  if (['cycle', 'toggle', 'click'].includes(normalized)) {
    return cycleCardStatus(currentStatus || CARD_STATUS_NOT_LEARNED);
  }

  // Nhóm hành động "Đã học"
  if (['learned', 'da_hoc', 'đã học', 'dahoc', 'passed', 'remembered', 'nhớ'].includes(normalized)) {
    return CARD_STATUS_LEARNED;
  }

  // Nhóm hành động "Chưa nhớ" -> "ôn tập"
  if ([
    'review',
    'chua_nho',
    'chưa nhớ',
    'chuanho',
    'on_tap',
    'ôn tập',
    'ontap',
    'cần ôn tập',
    'can_on_tap',
    'failed'
  ].includes(normalized)) {
    return CARD_STATUS_REVIEW;
  }

  // Nhóm hành động "Chưa học"
  if (['not_learned', 'chua_hoc', 'chưa học', 'chuahoc', 'skip', 'bỏ qua'].includes(normalized)) {
    return CARD_STATUS_NOT_LEARNED;
  }

  // Mặc định: không cập nhật hoặc chọn trạng thái khác -> 'chưa học'
  return CARD_STATUS_NOT_LEARNED;
}

/**
 * Thuật toán Fisher-Yates để xáo trộn danh sách thẻ (Học ngẫu nhiên)
 * Không làm thay đổi mảng gốc.
 * @template T
 * @param {T[]} array
 * @returns {T[]} Mảng mới đã được xáo trộn
 */
export function shuffleCards(array) {
  if (!Array.isArray(array)) return [];
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Tính toán số liệu thống kê cho danh sách thẻ của 1 list flashcard
 * @param {Array<object>} cards
 * @returns {{
 *   total_cards: number,
 *   review_cards: number,
 *   learned_cards: number,
 *   not_learned_cards: number,
 *   progress_ratio: string,
 *   progress_percentage: number
 * }}
 */
export function calculateFlashcardStats(cards = []) {
  const total = Array.isArray(cards) ? cards.length : 0;
  let learned = 0;
  let review = 0;
  let notLearned = 0;

  for (const c of cards || []) {
    if (c.status === CARD_STATUS_LEARNED) {
      learned++;
    } else if (c.status === CARD_STATUS_REVIEW) {
      review++;
    } else {
      notLearned++;
    }
  }

  const ratio = `${learned}/${total}`;
  const percentage = total > 0 ? Math.round((learned / total) * 100 * 10) / 10 : 0;

  return {
    total_cards: total,
    review_cards: review,
    learned_cards: learned,
    not_learned_cards: notLearned,
    progress_ratio: ratio,
    progress_percentage: percentage,
  };
}

/**
 * Chuẩn hóa 1 thẻ flashcard với cấu trúc:
 * - Mặt trước: kiến thức (knowledge / title)
 * - Mặt sau: mô tả (description), code, chú thích (note)
 * Đồng thời duy trì các trường phẳng để tương thích ngược.
 * @param {object} rawCard
 * @param {number} index
 * @param {string} [forceStatus]
 * @returns {object}
 */
export function formatSingleCard(rawCard = {}, index = 0, forceStatus = null) {
  const cardId = rawCard.card_id || rawCard.id || `card_${Date.now()}_${index}_${Math.random().toString(36).substring(2, 7)}`;
  const title = (rawCard.title || rawCard.knowledge || '').trim();
  const description = (rawCard.description || '').trim();
  const code = (rawCard.code || '').trim();
  const note = (rawCard.note || rawCard.annotation || '').trim();

  let status = forceStatus;
  if (!status) {
    status = VALID_CARD_STATUSES.includes(rawCard.status) ? rawCard.status : CARD_STATUS_NOT_LEARNED;
  }

  return {
    card_id: cardId,
    // Cấu trúc phân chia mặt trước và mặt sau cho UI
    front: {
      knowledge: title,
      title,
    },
    back: {
      description,
      code,
      note,
    },
    // Giữ các trường phẳng để tương thích hoàn toàn
    title,
    knowledge: title,
    description,
    code,
    note,
    status,
    order: typeof rawCard.order === 'number' ? rawCard.order : index + 1,
  };
}

// ─── 2. Các Hàm Nghiệp Vụ Chính (Business Logic Functions) ───────────────────

/**
 * 1. Hàm lưu thông tin tạo list flashcard.
 * Mỗi thẻ có 4 thông tin (kiến thức, mô tả, code, chú thích), trạng thái khi mới tạo đều là "chưa học".
 * @param {string} userId - ID người tạo
 * @param {object} payload - Dữ liệu list flashcard
 * @returns {Promise<object>}
 */
export async function createFlashcardList(userId, payload = {}) {
  if (!userId) {
    const err = new Error('Thiếu ID người dùng hợp lệ.');
    err.status = 401;
    throw err;
  }

  const title = (payload.title || '').trim();
  if (!title) {
    const err = new Error('Tiêu đề list flashcard không được để trống.');
    err.status = 400;
    err.field = 'title';
    throw err;
  }

  const description = (payload.description || '').trim();
  const rawCards = Array.isArray(payload.cards) ? payload.cards : [];

  // Mọi thẻ khi mới tạo đều có trạng thái là "chưa học"
  const formattedCards = rawCards.map((c, idx) =>
    formatSingleCard(c, idx, CARD_STATUS_NOT_LEARNED)
  );

  const now = new Date();
  const newListDoc = {
    user_id: userId,
    title,
    description,
    cards: formattedCards,
    node_id: payload.node_id || null,
    roadmap_id: payload.roadmap_id || null,
    created_at: now,
    updated_at: now,
  };

  const db = await getMongoDb();
  const result = await db.collection(COLLECTION_FLASHCARD_LISTS).insertOne(newListDoc);

  const stats = calculateFlashcardStats(formattedCards);

  return {
    id: result.insertedId.toString(),
    _id: result.insertedId,
    user_id: userId,
    title,
    description,
    total_cards: formattedCards.length,
    cards: formattedCards,
    node_id: newListDoc.node_id,
    roadmap_id: newListDoc.roadmap_id,
    created_at: formatDateDDMMYYYY(now),
    created_at_raw: now,
    learning_progress: stats.progress_ratio,
    ...stats,
  };
}

/**
 * 2. Hàm chỉnh sửa list flashcard.
 * Theo yêu cầu:
 * - Chỉnh sửa thay đổi trạng thái TẤT CẢ các thẻ thành "chưa học".
 * - CHẶN XÓA THẺ: Nếu bộ flashcard liên kết với Roadmap, khi người dùng xóa bớt còn dưới 5 thẻ
 *   thì hệ thống CHẶN LẠI không cho lưu nếu chưa đạt tối thiểu 5 thẻ.
 * @param {string|ObjectId} listId
 * @param {string} userId
 * @param {object} payload - { title, description, cards }
 * @returns {Promise<object>}
 */
export async function updateFlashcardList(listId, userId, payload = {}) {
  if (!userId) {
    const err = new Error('Thiếu ID người dùng hợp lệ.');
    err.status = 401;
    throw err;
  }

  const queryId = toObjectId(listId);
  const db = await getMongoDb();
  const existing = await db.collection(COLLECTION_FLASHCARD_LISTS).findOne({
    _id: queryId,
    user_id: userId,
  });

  if (!existing) {
    const err = new Error('Không tìm thấy bộ flashcard hoặc bạn không có quyền chỉnh sửa.');
    err.status = 404;
    throw err;
  }

  const updateFields = {
    updated_at: new Date(),
  };

  if (typeof payload.title === 'string') {
    const trimmedTitle = payload.title.trim();
    if (!trimmedTitle) {
      const err = new Error('Tiêu đề list flashcard không được để trống.');
      err.status = 400;
      err.field = 'title';
      throw err;
    }
    updateFields.title = trimmedTitle;
  }

  if (typeof payload.description === 'string') {
    updateFields.description = payload.description.trim();
  }

  // Danh sách thẻ được cập nhật hoặc giữ nguyên thẻ cũ
  let sourceCards = existing.cards || [];
  if (Array.isArray(payload.cards)) {
    sourceCards = payload.cards;
  }

  // RÀNG BUỘC ROADMAP: Nếu bộ flashcard liên kết với Roadmap, kiểm tra tối thiểu 5 thẻ
  const isLinkedToRoadmap = Boolean(existing.node_id || existing.roadmap_id || payload.node_id);
  if (isLinkedToRoadmap && sourceCards.length < 5) {
    const err = new Error(
      `Bộ flashcard liên kết với lộ trình học (Roadmap) yêu cầu phải có tối thiểu ít nhất 5 thẻ (hiện có: ${sourceCards.length} thẻ). Không được phép xóa bớt dưới 5 thẻ.`
    );
    err.status = 400;
    err.field = 'cards';
    err.code = 'ROADMAP_FLASHCARD_MIN_CARDS_VIOLATION';
    throw err;
  }

  // QUY TẮC BẮT BUỘC: Khi chỉnh sửa, toàn bộ trạng thái các thẻ trong list đều thay đổi thành "chưa học"
  const resetCards = sourceCards.map((c, idx) =>
    formatSingleCard(c, idx, CARD_STATUS_NOT_LEARNED)
  );

  updateFields.cards = resetCards;

  await db.collection(COLLECTION_FLASHCARD_LISTS).updateOne(
    { _id: queryId, user_id: userId },
    { $set: updateFields }
  );

  const updatedDoc = await db.collection(COLLECTION_FLASHCARD_LISTS).findOne({ _id: queryId });
  const stats = calculateFlashcardStats(resetCards);

  return {
    id: updatedDoc._id.toString(),
    _id: updatedDoc._id,
    user_id: updatedDoc.user_id,
    title: updatedDoc.title,
    description: updatedDoc.description,
    total_cards: resetCards.length,
    cards: resetCards,
    created_at: formatDateDDMMYYYY(updatedDoc.created_at),
    created_at_raw: updatedDoc.created_at,
    updated_at: formatDateDDMMYYYY(updatedDoc.updated_at),
    learning_progress: stats.progress_ratio,
    ...stats,
  };
}

/**
 * 3. Hàm truy xuất các thông tin về list flashcard của người dùng:
 * - Tiêu đề, mô tả
 * - Số thẻ được tạo trong list đó (total_cards)
 * - Thời gian tạo DD/MM/YYYY
 * - Tiến độ đang học x/x (learning_progress)
 * @param {string} userId
 * @returns {Promise<Array<object>>}
 */
export async function getFlashcardLists(userId) {
  if (!userId) {
    const err = new Error('Thiếu ID người dùng hợp lệ.');
    err.status = 401;
    throw err;
  }

  const db = await getMongoDb();
  const lists = await db
    .collection(COLLECTION_FLASHCARD_LISTS)
    .find({ user_id: userId })
    .sort({ created_at: -1 })
    .toArray();

  return lists.map((doc) => {
    const cards = doc.cards || [];
    const stats = calculateFlashcardStats(cards);
    return {
      id: doc._id.toString(),
      _id: doc._id,
      title: doc.title,
      description: doc.description || '',
      total_cards: cards.length,
      created_at: formatDateDDMMYYYY(doc.created_at),
      created_at_raw: doc.created_at,
      learning_progress: stats.progress_ratio,
      learned_cards: stats.learned_cards,
      review_cards: stats.review_cards,
      not_learned_cards: stats.not_learned_cards,
      progress_percentage: stats.progress_percentage,
      node_id: doc.node_id || null,
      roadmap_id: doc.roadmap_id || null,
    };
  });
}

/**
 * 4. Hàm bắt đầu phiên học flashcard theo chế độ được chọn:
 * Khi người dùng chọn chế độ đó và nhấn "Bắt đầu học" xác nhận, hệ thống sẽ sắp xếp thứ tự thẻ hiển thị:
 * - Chế độ 1 ('order'): Học theo thứ tự - CHỈ áp dụng với thẻ cần ôn tập & chưa học
 * - Chế độ 2 ('random'): Học ngẫu nhiên - CHỈ áp dụng với thẻ cần ôn tập & chưa học, xáo trộn thứ tự
 * - Chế độ 3 ('restart' / 'hoc_lai_tu_dau'): Học lại từ đầu - chuyển toàn bộ thẻ về "chưa học" trong CSDL và học theo thứ tự
 * @param {string|ObjectId} listId
 * @param {string} userId
 * @param {{ mode?: 'order'|'random'|'restart' }} options
 * @returns {Promise<object>}
 */
export async function startLearningSession(listId, userId, options = {}) {
  if (!userId) {
    const err = new Error('Thiếu ID người dùng hợp lệ.');
    err.status = 401;
    throw err;
  }

  const queryId = toObjectId(listId);
  const db = await getMongoDb();
  const listDoc = await db.collection(COLLECTION_FLASHCARD_LISTS).findOne({
    _id: queryId,
    user_id: userId,
  });

  if (!listDoc) {
    const err = new Error('Không tìm thấy bộ flashcard để bắt đầu học.');
    err.status = 404;
    throw err;
  }

  let mode = String(options.mode || LEARNING_MODE_ORDER).trim().toLowerCase();
  if (['restart', 'reset', 'hoc_lai_tu_dau', 'reset_and_learn'].includes(mode)) {
    mode = LEARNING_MODE_RESTART;
  } else if (['random', 'shuffle', 'ngau_nhien'].includes(mode)) {
    mode = LEARNING_MODE_RANDOM;
  } else {
    mode = LEARNING_MODE_ORDER;
  }

  let cards = (listDoc.cards || []).map((c, idx) =>
    formatSingleCard(c, idx, c.status)
  );

  // Chế độ 3: Học lại từ đầu -> Chuyển toàn bộ trạng thái trong danh sách về "chưa học" trong DB
  if (mode === LEARNING_MODE_RESTART) {
    cards = cards.map((c, idx) => formatSingleCard(c, idx, CARD_STATUS_NOT_LEARNED));
    await db.collection(COLLECTION_FLASHCARD_LISTS).updateOne(
      { _id: queryId, user_id: userId },
      {
        $set: {
          cards,
          updated_at: new Date(),
        },
      }
    );
  }

  // Quy tắc: Khi học, chỉ áp dụng với thẻ cần ôn tập và chưa học (loại trừ thẻ đã học)
  const applicableCards = cards.filter(
    (c) => c.status === CARD_STATUS_REVIEW || c.status === CARD_STATUS_NOT_LEARNED
  );

  let sessionCards = applicableCards;
  if (mode === LEARNING_MODE_RANDOM) {
    // Xáo trộn ngẫu nhiên thứ tự thẻ hiển thị
    sessionCards = shuffleCards(applicableCards);
  } else {
    // Học theo thứ tự người dùng tạo
    sessionCards = [...applicableCards].sort((a, b) => (a.order || 0) - (b.order || 0));
  }

  const stats = calculateFlashcardStats(cards);

  return {
    session_id: `session_${Date.now()}`,
    list_id: listDoc._id.toString(),
    title: listDoc.title,
    description: listDoc.description || '',
    mode,
    mode_description:
      mode === LEARNING_MODE_RESTART
        ? 'Học lại từ đầu (đã reset toàn bộ thẻ về chưa học, hiển thị theo thứ tự)'
        : mode === LEARNING_MODE_RANDOM
        ? 'Học ngẫu nhiên (chỉ thẻ cần ôn tập và chưa học, xáo trộn thứ tự)'
        : 'Học theo thứ tự (chỉ thẻ cần ôn tập và chưa học, giữ nguyên thứ tự tạo)',
    total_cards_in_list: cards.length,
    total_cards_to_learn: sessionCards.length,
    learned_cards_excluded: cards.length - applicableCards.length,
    cards_to_learn: sessionCards,
    stats,
    node_id: listDoc.node_id || null,
    roadmap_id: listDoc.roadmap_id || null,
  };
}

/**
 * 5. Hàm truy xuất thông tin chi tiết một list flashcard cùng các thẻ flashcard
 * Gồm: tiêu đề, mô tả, code, chú thích, trạng thái ('Đã học', 'ôn tập', 'chưa học').
 * Hỗ trợ các chế độ và tùy chọn lọc thẻ đang học (filter_active: true).
 * @param {string|ObjectId} listId
 * @param {string} userId
 * @param {{ mode?: 'order'|'random'|'restart', filter_active?: boolean }} options
 * @returns {Promise<object>}
 */
export async function getFlashcardsInList(listId, userId, options = {}) {
  if (!userId) {
    const err = new Error('Thiếu ID người dùng hợp lệ.');
    err.status = 401;
    throw err;
  }

  const queryId = toObjectId(listId);
  const db = await getMongoDb();
  const listDoc = await db.collection(COLLECTION_FLASHCARD_LISTS).findOne({
    _id: queryId,
    user_id: userId,
  });

  if (!listDoc) {
    const err = new Error('Không tìm thấy bộ flashcard.');
    err.status = 404;
    throw err;
  }

  const rawMode = String(options.mode || LEARNING_MODE_ORDER).trim().toLowerCase();
  let mode = LEARNING_MODE_ORDER;
  if (['restart', 'reset', 'hoc_lai_tu_dau'].includes(rawMode)) {
    mode = LEARNING_MODE_RESTART;
  } else if (['random', 'shuffle', 'ngau_nhien'].includes(rawMode)) {
    mode = LEARNING_MODE_RANDOM;
  }

  let originalCards = (listDoc.cards || []).map((c, idx) =>
    formatSingleCard(c, idx, c.status)
  );

  // Nếu người dùng chọn mode restart ngay tại GET
  if (mode === LEARNING_MODE_RESTART) {
    originalCards = originalCards.map((c, idx) => formatSingleCard(c, idx, CARD_STATUS_NOT_LEARNED));
    await db.collection(COLLECTION_FLASHCARD_LISTS).updateOne(
      { _id: queryId, user_id: userId },
      {
        $set: {
          cards: originalCards,
          updated_at: new Date(),
        },
      }
    );
  }

  let workingCards = originalCards;

  // Lọc thẻ khi yêu cầu filter_active (chỉ thẻ cần ôn tập và chưa học)
  if (options.filter_active) {
    workingCards = originalCards.filter(
      (c) => c.status === CARD_STATUS_REVIEW || c.status === CARD_STATUS_NOT_LEARNED
    );
  }

  let finalCards = workingCards;
  if (mode === LEARNING_MODE_RANDOM) {
    finalCards = shuffleCards(workingCards);
  }

  const stats = calculateFlashcardStats(originalCards);

  return {
    id: listDoc._id.toString(),
    _id: listDoc._id,
    title: listDoc.title,
    description: listDoc.description || '',
    mode,
    total_cards: originalCards.length,
    active_cards_count: workingCards.length,
    created_at: formatDateDDMMYYYY(listDoc.created_at),
    created_at_raw: listDoc.created_at,
    learning_progress: stats.progress_ratio,
    ...stats,
    cards: finalCards,
    node_id: listDoc.node_id || null,
    roadmap_id: listDoc.roadmap_id || null,
  };
}

/**
 * 6. Hàm thống kê cho list flashcard:
 * Tính tổng số thẻ, tổng số thẻ cần ôn lại, tổng số thẻ đã học, tổng số thẻ chưa học
 * và tiến độ (tổng số thẻ đã học/tổng số thẻ).
 * @param {string|ObjectId} listId
 * @param {string} userId
 * @returns {Promise<object>}
 */
export async function getFlashcardListStats(listId, userId) {
  if (!userId) {
    const err = new Error('Thiếu ID người dùng hợp lệ.');
    err.status = 401;
    throw err;
  }

  const queryId = toObjectId(listId);
  const db = await getMongoDb();
  const listDoc = await db.collection(COLLECTION_FLASHCARD_LISTS).findOne({
    _id: queryId,
    user_id: userId,
  });

  if (!listDoc) {
    const err = new Error('Không tìm thấy bộ flashcard để thống kê.');
    err.status = 404;
    throw err;
  }

  const cards = listDoc.cards || [];
  const stats = calculateFlashcardStats(cards);

  return {
    list_id: listDoc._id.toString(),
    title: listDoc.title,
    description: listDoc.description || '',
    total_cards: stats.total_cards,
    review_cards: stats.review_cards,
    learned_cards: stats.learned_cards,
    not_learned_cards: stats.not_learned_cards,
    progress: stats.progress_ratio,
    progress_ratio: stats.progress_ratio,
    progress_percentage: stats.progress_percentage,
    node_id: listDoc.node_id || null,
    roadmap_id: listDoc.roadmap_id || null,
    is_qualified_for_roadmap: stats.total_cards >= 5 && stats.progress_percentage >= 70,
  };
}

/**
 * 7. Hàm cập nhật trạng thái thẻ trong quá trình học:
 * - Khi nhấn 'đã học' -> cập nhật thành 'Đã học'
 * - Khi nhấn 'chưa nhớ' -> cập nhật thành 'ôn tập'
 * - Khi click toggle / cycle -> xoay vòng qua 3 trạng thái ('chưa học' -> 'ôn tập' -> 'Đã học')
 * - Không cập nhật cái nào từ 2 cái trên -> trạng thái vẫn là 'chưa học'
 * Đồng thời tự động kiểm tra đồng bộ Roadmap Node nếu list có gắn với node kỹ năng.
 * @param {string|ObjectId} listId
 * @param {string} cardId
 * @param {string} userId
 * @param {string} action - 'learned' | 'review' | 'not_learned' | 'cycle'
 * @returns {Promise<object>}
 */
export async function updateCardStatus(listId, cardId, userId, action) {
  if (!userId) {
    const err = new Error('Thiếu ID người dùng hợp lệ.');
    err.status = 401;
    throw err;
  }

  const queryId = toObjectId(listId);
  const db = await getMongoDb();
  const listDoc = await db.collection(COLLECTION_FLASHCARD_LISTS).findOne({
    _id: queryId,
    user_id: userId,
  });

  if (!listDoc) {
    const err = new Error('Không tìm thấy bộ flashcard.');
    err.status = 404;
    throw err;
  }

  const cards = listDoc.cards || [];
  const targetCardIndex = cards.findIndex(
    (c) => String(c.card_id) === String(cardId) || String(c.id) === String(cardId)
  );

  if (targetCardIndex === -1) {
    const err = new Error('Không tìm thấy thẻ flashcard trong danh sách.');
    err.status = 404;
    err.field = 'cardId';
    throw err;
  }

  const currentCard = cards[targetCardIndex];
  const newStatus = normalizeCardStatusAction(action, currentCard.status);
  cards[targetCardIndex].status = newStatus;

  await db.collection(COLLECTION_FLASHCARD_LISTS).updateOne(
    { _id: queryId, user_id: userId },
    {
      $set: {
        cards,
        updated_at: new Date(),
      },
    }
  );

  const stats = calculateFlashcardStats(cards);

  let roadmapSyncResult = null;
  if (listDoc.node_id) {
    // Tự động kiểm tra và cập nhật node trên roadmap nếu đủ điều kiện
    roadmapSyncResult = await checkAndUpdateRoadmapFromFlashcard(
      userId,
      listDoc.node_id,
      listDoc._id
    );
  }

  return {
    success: true,
    card_id: cardId,
    new_status: newStatus,
    updated_card: cards[targetCardIndex],
    stats,
    roadmap_sync: roadmapSyncResult,
  };
}

/**
 * 8. Hàm tạo list flashcard ôn tập từ node kỹ năng trên Roadmap (Nút ấn tạo flashcard):
 * - Tiêu đề list: tiêu đề node
 * - Mô tả: "Ôn tập <tên node>"
 * - Liên kết node_id, roadmap_id
 * @param {string} userId
 * @param {object} payload - { node_id, roadmap_id, title, cards }
 * @returns {Promise<object>}
 */
export async function createReviewFlashcardListFromRoadmapNode(userId, payload = {}) {
  if (!userId) {
    const err = new Error('Thiếu ID người dùng hợp lệ.');
    err.status = 401;
    throw err;
  }

  const nodeId = payload.node_id;
  if (!nodeId) {
    const err = new Error('Thiếu node_id kỹ năng cần ôn tập.');
    err.status = 400;
    err.field = 'node_id';
    throw err;
  }

  const db = await getMongoDb();
  let nodeTitle = (payload.title || '').trim();

  // Tra cứu tiêu đề node từ Roadmap của người dùng nếu client không gửi kèm title
  if (!nodeTitle) {
    const userRoadmap = await db.collection(COLLECTION_USER_ROADMAPS).findOne({
      user_id: userId,
      'nodes.node_id': nodeId,
    });

    if (userRoadmap && Array.isArray(userRoadmap.nodes)) {
      const foundNode = userRoadmap.nodes.find((n) => n.node_id === nodeId);
      if (foundNode && foundNode.title) {
        nodeTitle = foundNode.title;
      }
    }
  }

  // Fallback nếu vẫn chưa tìm thấy title
  if (!nodeTitle) {
    nodeTitle = nodeId;
  }

  const listTitle = nodeTitle;
  const listDescription = `Ôn tập "${nodeTitle}"`;

  // Nhận thẻ do người dùng truyền vào (nếu có), trạng thái ban đầu là "chưa học"
  const rawCards = Array.isArray(payload.cards) ? payload.cards : [];
  const formattedCards = rawCards.map((c, idx) =>
    formatSingleCard(c, idx, CARD_STATUS_NOT_LEARNED)
  );

  const now = new Date();
  const newListDoc = {
    user_id: userId,
    title: listTitle,
    description: listDescription,
    node_id: nodeId,
    roadmap_id: payload.roadmap_id || null,
    cards: formattedCards,
    created_at: now,
    updated_at: now,
  };

  const result = await db.collection(COLLECTION_FLASHCARD_LISTS).insertOne(newListDoc);
  const stats = calculateFlashcardStats(formattedCards);

  return {
    id: result.insertedId.toString(),
    _id: result.insertedId,
    user_id: userId,
    node_id: nodeId,
    roadmap_id: payload.roadmap_id || null,
    title: listTitle,
    description: listDescription,
    total_cards: formattedCards.length,
    cards: formattedCards,
    created_at: formatDateDDMMYYYY(now),
    created_at_raw: now,
    learning_progress: stats.progress_ratio,
    ...stats,
  };
}

/**
 * 9. Hàm kiểm tra và cập nhật trạng thái node trên Roadmap từ Flashcard:
 * Quy tắc nghiệp vụ:
 * 1) Nếu người dùng KHÔNG tạo list flashcard với tối thiểu ít nhất 5 flashcard (total_cards < 5)
 *    -> GIỮ NGUYÊN trạng thái 'review' của node trên roadmap, không cập nhật!
 * 2) Khi người dùng CHƯA hoàn thành tối thiểu 70% bộ flashcard (progress_percentage < 70%)
 *    -> GIỮ NGUYÊN trạng thái 'review' của node trên roadmap, không cập nhật!
 * 3) Khi đáp ứng cả 2 điều kiện:
 *    -> CẬP NHẬT lại node kỹ năng trên roadmap: gỡ bỏ review (is_review = false),
 *       chuyển trạng thái sang 'completed' (hoặc 'in_progress' theo điểm số), đồng bộ tiến độ roadmap.
 * @param {string} userId
 * @param {string} nodeId
 * @param {string|ObjectId} [listId]
 * @returns {Promise<object>}
 */
export async function checkAndUpdateRoadmapFromFlashcard(userId, nodeId, listId = null) {
  if (!userId || !nodeId) {
    return {
      updated: false,
      reason: 'Thiếu thông tin userId hoặc nodeId.',
      node_status: ROADMAP_STATUS_REVIEW,
    };
  }

  const db = await getMongoDb();

  // Tìm bộ flashcard liên kết với node của người dùng
  const query = { user_id: userId, node_id: nodeId };
  if (listId) {
    query._id = toObjectId(listId);
  }

  const flashcardList = await db.collection(COLLECTION_FLASHCARD_LISTS).findOne(query);

  // Điều kiện 1: Nếu người dùng không tạo list flashcard hoặc chưa có tối thiểu 5 thẻ
  if (!flashcardList || !Array.isArray(flashcardList.cards) || flashcardList.cards.length < 5) {
    const currentCardCount = flashcardList?.cards?.length || 0;
    return {
      updated: false,
      reason: `List flashcard ôn tập cần có tối thiểu ít nhất 5 flashcard bên trong để cập nhật lộ trình (hiện có: ${currentCardCount} thẻ). Trạng thái node trên roadmap được giữ nguyên.`,
      node_status: ROADMAP_STATUS_REVIEW,
      total_cards: currentCardCount,
      minimum_required_cards: 5,
    };
  }

  // Điều kiện 2: Kiểm tra tỷ lệ hoàn thành (tối thiểu 70% số thẻ 'Đã học')
  const stats = calculateFlashcardStats(flashcardList.cards);
  if (stats.progress_percentage < 70) {
    return {
      updated: false,
      reason: `Chưa hoàn thành tối thiểu 70% bộ flashcard ôn tập (hiện tại: ${stats.progress_percentage}%). Trạng thái node trên roadmap được giữ nguyên.`,
      node_status: ROADMAP_STATUS_REVIEW,
      progress_percentage: stats.progress_percentage,
      minimum_required_percentage: 70,
      learned_cards: stats.learned_cards,
      total_cards: stats.total_cards,
    };
  }

  // Thỏa mãn cả 2 điều kiện -> Cập nhật trạng thái Node trên Roadmap
  const userRoadmap = await db.collection(COLLECTION_USER_ROADMAPS).findOne({
    user_id: userId,
    'nodes.node_id': nodeId,
  });

  if (!userRoadmap) {
    return {
      updated: false,
      reason: 'Không tìm thấy lộ trình học hoặc node kỹ năng tương ứng của người dùng.',
      node_status: ROADMAP_STATUS_REVIEW,
      progress_percentage: stats.progress_percentage,
    };
  }

  // Tìm node cụ thể để cập nhật
  let targetNodeTitle = '';
  const updatedNodes = (userRoadmap.nodes || []).map((node) => {
    if (node.node_id === nodeId) {
      targetNodeTitle = node.title || '';
      // Phục hồi trạng thái: Nếu điểm số >= 80 là completed, ngược lại là in_progress
      const restoredStatus = (node.score >= 80 || node.score === undefined)
        ? ROADMAP_STATUS_COMPLETED
        : ROADMAP_STATUS_IN_PROGRESS;

      return {
        ...node,
        status: restoredStatus,
        is_review: false,
        updated_at: new Date(),
      };
    }
    return node;
  });

  // Tính lại tổng số node hoàn thành và tiến độ tổng quan của roadmap
  const completedNodesCount = updatedNodes.filter(
    (n) => n.status === ROADMAP_STATUS_COMPLETED
  ).length;
  const totalNodesCount = updatedNodes.length;
  const overallProgress = totalNodesCount > 0
    ? Math.round((completedNodesCount / totalNodesCount) * 100)
    : 0;

  await db.collection(COLLECTION_USER_ROADMAPS).updateOne(
    { _id: userRoadmap._id },
    {
      $set: {
        nodes: updatedNodes,
        completed_nodes: completedNodesCount,
        progress_percentage: overallProgress,
        updated_at: new Date(),
      },
    }
  );

  return {
    updated: true,
    node_id: nodeId,
    node_title: targetNodeTitle,
    new_status: ROADMAP_STATUS_COMPLETED,
    is_review: false,
    progress_percentage: stats.progress_percentage,
    roadmap_progress: overallProgress,
    message: `Đã hoàn thành ôn tập bộ flashcard (${stats.progress_percentage}%) và cập nhật lại trạng thái kỹ năng trên lộ trình!`,
  };
}

// ─── 3. Express Router Factory ───────────────────────────────────────────────

/**
 * Khởi tạo Router Express cho tính năng Flashcard
 * @param {object} express - Express module instance
 * @param {Function} requireAuth - Middleware xác thực đăng nhập người dùng
 * @returns {object} Express Router
 */
export function createFlashcardRouter(express, requireAuth) {
  const router = express.Router();

  // 1. GET / - Truy xuất danh sách list flashcard của người dùng
  router.get('/', requireAuth, async (req, res, next) => {
    try {
      const lists = await getFlashcardLists(req.userId);
      res.json({
        status: 'success',
        total: lists.length,
        data: lists,
      });
    } catch (err) {
      next(err);
    }
  });

  // 2. POST / - Tạo list flashcard mới
  router.post('/', requireAuth, async (req, res, next) => {
    try {
      const created = await createFlashcardList(req.userId, req.body);
      res.status(201).json({
        status: 'success',
        message: 'Tạo bộ flashcard thành công.',
        data: created,
      });
    } catch (err) {
      next(err);
    }
  });

  // 3. POST /from-roadmap - Nút tạo list flashcard ôn tập từ node kỹ năng roadmap
  router.post('/from-roadmap', requireAuth, async (req, res, next) => {
    try {
      const created = await createReviewFlashcardListFromRoadmapNode(req.userId, req.body);
      res.status(201).json({
        status: 'success',
        message: 'Đã tạo bộ flashcard ôn tập từ lộ trình kỹ năng.',
        data: created,
      });
    } catch (err) {
      next(err);
    }
  });

  // 4. POST /:id/session hoặc /:id/start - Xác nhận bắt đầu phiên học theo chế độ (order, random, restart)
  // Hệ thống sẽ sắp xếp thứ tự hiển thị và lọc các thẻ cần học
  router.post('/:id/session', requireAuth, async (req, res, next) => {
    try {
      const { mode } = req.body;
      const sessionData = await startLearningSession(req.params.id, req.userId, { mode });
      res.json({
        status: 'success',
        message: `Đã khởi tạo phiên học với chế độ: ${sessionData.mode}`,
        data: sessionData,
      });
    } catch (err) {
      next(err);
    }
  });

  // 5. GET /:id - Lấy chi tiết list flashcard & các thẻ theo chế độ học (?mode=order|random|restart&filter_active=true)
  router.get('/:id', requireAuth, async (req, res, next) => {
    try {
      const mode = req.query.mode || LEARNING_MODE_ORDER;
      const filter_active = req.query.filter_active === 'true' || req.query.active_only === 'true';
      const detail = await getFlashcardsInList(req.params.id, req.userId, { mode, filter_active });
      res.json({
        status: 'success',
        data: detail,
      });
    } catch (err) {
      next(err);
    }
  });

  // 6. PUT /:id - Chỉnh sửa thông tin list flashcard
  // Chặn xóa thẻ nếu bộ liên kết Roadmap dưới 5 thẻ, reset toàn bộ thẻ về 'chưa học'
  router.put('/:id', requireAuth, async (req, res, next) => {
    try {
      const updated = await updateFlashcardList(req.params.id, req.userId, req.body);
      res.json({
        status: 'success',
        message: 'Cập nhật bộ flashcard thành công (trạng thái các thẻ đã được chuyển về chưa học).',
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  });

  // 7. GET /:id/stats - Thống kê list flashcard (tổng số thẻ, cần ôn lại, đã học, chưa học, tiến độ x/x)
  router.get('/:id/stats', requireAuth, async (req, res, next) => {
    try {
      const stats = await getFlashcardListStats(req.params.id, req.userId);
      res.json({
        status: 'success',
        data: stats,
      });
    } catch (err) {
      next(err);
    }
  });

  // 8. PATCH /:id/cards/:cardId/status - Cập nhật trạng thái thẻ khi học (nhấn Đã học / Chưa nhớ / Click xoay vòng)
  router.patch('/:id/cards/:cardId/status', requireAuth, async (req, res, next) => {
    try {
      const { action, status } = req.body;
      const result = await updateCardStatus(
        req.params.id,
        req.params.cardId,
        req.userId,
        action || status
      );
      res.json({
        status: 'success',
        message: 'Cập nhật trạng thái thẻ thành công.',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  });

  // 9. POST /sync-roadmap/:nodeId - Thủ công kiểm tra và cập nhật node roadmap từ flashcard
  router.post('/sync-roadmap/:nodeId', requireAuth, async (req, res, next) => {
    try {
      const { list_id } = req.body;
      const result = await checkAndUpdateRoadmapFromFlashcard(
        req.userId,
        req.params.nodeId,
        list_id
      );
      res.json({
        status: 'success',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
