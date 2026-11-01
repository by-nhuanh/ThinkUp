import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { AccessToken, TrackSource } from 'livekit-server-sdk';
import { getMongoDb } from '../db.js';
import { createNotificationForEvent } from '../notification/notification.user.js';

/**
 * Collection tên trong MongoDB
 */
export const COLLECTION_STUDY_ROOMS = 'study_rooms';
export const COLLECTION_STUDY_ROOM_MESSAGES = 'study_room_messages';

/**
 * Thời gian tối đa phòng không có người trước khi tự động xóa (1 tiếng = 3600 giây = 3.600.000 ms)
 */
export const ROOM_IDLE_TIMEOUT_MS = 60 * 60 * 1000;

function normalizeInviteTarget(value) {
  const target = typeof value === 'string' ? value.trim() : '';
  return target.includes('@') ? target.toLowerCase() : target.replace(/\s+/g, '');
}

async function getUserAccount(db, userId) {
  if (!userId) return null;
  const { ObjectId } = await import('mongodb');
  const query = ObjectId.isValid(String(userId))
    ? { $or: [{ _id: new ObjectId(String(userId)) }, { id: String(userId) }] }
    : { id: String(userId) };
  return db.collection('users').findOne(query, {
    projection: { email: 1, phone: 1, full_name: 1, name: 1, avatar_url: 1, avatar: 1 }
  });
}

function inviteMatchesAccount(inviteTarget, user) {
  if (!user) return false;
  const normalizedTarget = normalizeInviteTarget(inviteTarget);
  return [user.email, user.phone].some(value => normalizeInviteTarget(value) === normalizedTarget);
}

function createStudyRoomError(message, status, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

/**
 * Sinh mã phòng ngẫu nhiên dễ nhớ và duy nhất (ví dụ: TU-849201 hoặc 6 ký tự viết hoa)
 */
export function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Tạo link mời cho phòng học
 * @param {string} roomCode
 * @param {string} [baseUrl]
 */
export function generateRoomLink(roomCode, baseUrl = process.env.CLIENT_URL || 'http://localhost:4200') {
  const cleanBase = baseUrl.split(',')[0].trim().replace(/\/+$/, '');
  return `${cleanBase}/learning/study-room/${roomCode.toLowerCase()}`;
}

/**
 * Lấy nhãn chức danh hiển thị theo vai trò (Chủ phòng, Moderator, Thành viên)
 * @param {'owner'|'moderator'|'member'} role
 * @returns {'Chủ phòng'|'Moderator'|'Thành viên'}
 */
export function getRoleLabel(role) {
  if (role === 'owner') return 'Chủ phòng';
  if (role === 'moderator') return 'Moderator';
  return 'Thành viên';
}

/**
 * Lấy 2 ký tự viết tắt đại diện tên (ví dụ: "Minh Khoa" -> "MK")
 * @param {string} name
 * @returns {string}
 */
export function getInitials(name = '') {
  if (!name || typeof name !== 'string') return 'TU';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * 1. Hàm tạo phòng học ảo
 * Lưu các trường:
 * - type: 'public' | 'private'
 * - name: Tên phòng (tối thiểu 5 ký tự)
 * - goal: Mục tiêu hôm nay
 * - topic: Chủ đề (mô tả không quá 20 ký tự)
 * - tags: Danh sách kỹ năng / tags
 * - capacity: Sức chứa phòng (số lượng thành viên tối đa)
 * - roomTheme: Chủ đề phòng (URL ảnh hoặc gif để set background khi vào phòng)
 * - password: Mật khẩu nếu là phòng riêng tư (băm bcrypt an toàn)
 * - roomCode: Mã phòng sinh tự động
 * - roomLink: Link trực tiếp vào phòng
 * 
 * @param {string} creatorId - ID người tạo
 * @param {object} payload - Dữ liệu phòng
 */
export async function createStudyRoom(creatorId, payload = {}) {
  const {
    type = 'public',
    name,
    goal = '',
    topic = '',
    tags = [],
    capacity = 20,
    roomTheme = '',
    password = '',
    creatorName = 'Tôi',
    creatorAvatar = ''
  } = payload;

  // Validation
  const trimmedName = typeof name === 'string' ? name.trim() : '';
  if (!trimmedName || trimmedName.length < 5) {
    const error = new Error('Tên phòng học phải có tối thiểu 5 ký tự.');
    error.status = 400;
    error.code = 'INVALID_ROOM_NAME';
    throw error;
  }

  const roomType = type === 'private' ? 'private' : 'public';

  const trimmedTopic = typeof topic === 'string' ? topic.trim() : '';
  if (trimmedTopic.length > 20) {
    const error = new Error('Chủ đề phòng (mô tả ngắn) không được vượt quá 20 ký tự.');
    error.status = 400;
    error.code = 'INVALID_ROOM_TOPIC';
    throw error;
  }

  const parsedCapacity = Number(capacity);
  if (isNaN(parsedCapacity) || parsedCapacity < 1) {
    const error = new Error('Sức chứa phòng phải là số nguyên dương lớn hơn 0.');
    error.status = 400;
    error.code = 'INVALID_ROOM_CAPACITY';
    throw error;
  }

  // Xử lý mật khẩu nếu là phòng riêng tư
  let hashedPassword = null;
  if (roomType === 'private') {
    const rawPassword = typeof password === 'string' ? password.trim() : '';
    if (!rawPassword || rawPassword.length < 4) {
      const error = new Error('Phòng riêng tư yêu cầu thiết lập mật khẩu tối thiểu 4 ký tự.');
      error.status = 400;
      error.code = 'INVALID_ROOM_PASSWORD';
      throw error;
    }
    const salt = await bcrypt.genSalt(10);
    hashedPassword = await bcrypt.hash(rawPassword, salt);
  }

  const db = await getMongoDb();
  const roomsColl = db.collection(COLLECTION_STUDY_ROOMS);

  // Sinh mã phòng duy nhất
  let roomCode = '';
  let isUnique = false;
  let attempts = 0;
  while (!isUnique && attempts < 10) {
    roomCode = generateRoomCode();
    const existing = await roomsColl.findOne({ roomCode: roomCode.toUpperCase() });
    if (!existing) {
      isUnique = true;
    }
    attempts++;
  }

  if (!isUnique) {
    roomCode = 'TU-' + Date.now().toString().slice(-6);
  }

  const roomLink = generateRoomLink(roomCode);

  const formattedTags = Array.isArray(tags)
    ? tags.map(t => String(t).trim()).filter(Boolean)
    : (typeof tags === 'string' ? tags.split(',').map(t => t.trim()).filter(Boolean) : []);

  // Tự động đối chiếu avatar người dùng từ CSDL users (Cloudinary URL) nếu chưa được truyền
  let resolvedCreatorAvatar = creatorAvatar || '';
  let resolvedCreatorName = creatorName || 'Chủ phòng';
  if (creatorId && (!resolvedCreatorAvatar || resolvedCreatorName === 'Tôi')) {
    try {
      const usersColl = db.collection('users');
      const { ObjectId } = await import('mongodb');
      const userDoc = ObjectId.isValid(creatorId)
        ? await usersColl.findOne({ _id: new ObjectId(creatorId) })
        : await usersColl.findOne({ id: String(creatorId) });
      if (userDoc) {
        if (!resolvedCreatorAvatar) {
          resolvedCreatorAvatar = userDoc.avatar_url || userDoc.avatar || '';
        }
        if (resolvedCreatorName === 'Tôi' || !resolvedCreatorName) {
          resolvedCreatorName = userDoc.full_name || userDoc.name || 'Chủ phòng';
        }
      }
    } catch {
      // Bỏ qua lỗi tra cứu nếu user không tồn tại
    }
  }

  const newRoom = {
    roomId: roomCode.toLowerCase(),
    roomCode: roomCode.toUpperCase(),
    roomLink,
    name: trimmedName,
    type: roomType,
    goal: typeof goal === 'string' ? goal.trim() : '',
    topic: trimmedTopic,
    tags: formattedTags,
    capacity: parsedCapacity,
    maxUsers: parsedCapacity, // Đồng bộ với model FE maxUsers
    currentUsers: 1, // Chủ phòng vừa tạo coi như vào 1 slot
    roomTheme: typeof roomTheme === 'string' ? roomTheme.trim() : '',
    theme: typeof roomTheme === 'string' ? roomTheme.trim() : '', // tương thích FE
    password: hashedPassword,
    hasPassword: !!hashedPassword,
    requiresPassword: roomType === 'private',
    creatorId: creatorId || null,
    creator: creatorName || 'Chủ phòng',
    status: 'idle', // 'idle' | 'focus' | 'break'
    rating: 5.0,
    isActive: true,
    // Cấu hình quyền hạn mặc định toàn phòng (Room Permissions)
    permissions: {
      voiceEnabled: true,
      cameraEnabled: true,
      chatEnabled: true,
      whiteboardLocked: false,
      participantShareScreen: false,
      participantUpload: true, // ảnh, gif, video youtube
      approvalRequired: roomType === 'private' // Duyệt yêu cầu vào phòng
    },
    // Danh sách thành viên đang có mặt với vai trò và vị trí canvas
    participants: [
      {
        userId: creatorId || 'owner_' + Date.now(),
        name: resolvedCreatorName,
        avatar: resolvedCreatorAvatar,
        initials: getInitials(resolvedCreatorName),
        role: 'owner', // 'owner' | 'moderator' | 'member'
        roleLabel: getRoleLabel('owner'), // 'Chủ phòng'
        position: { x: 300, y: 250 },
        joinedAt: new Date()
      }
    ],
    // Danh sách yêu cầu xin vào phòng đang chờ duyệt
    joinRequests: [],
    emptySince: null, // Ghi nhận thời điểm phòng không còn ai, nếu quá 1 tiếng sẽ tự động xóa
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const insertResult = await roomsColl.insertOne(newRoom);

  // Trả về dữ liệu an toàn (loại bỏ hash mật khẩu)
  const safeRoom = {
    ...newRoom,
    _id: insertResult.insertedId,
    password: undefined // Bảo mật
  };

  return safeRoom;
}

/**
 * 2. Hàm tìm phòng công khai và còn chỗ để spawn ngẫu nhiên (Quick Join / Random Spawn)
 * Điều kiện: type === 'public', currentUsers < capacity, isActive !== false
 */
export async function getRandomAvailablePublicRoom() {
  const db = await getMongoDb();
  const roomsColl = db.collection(COLLECTION_STUDY_ROOMS);

  // Query: Công khai, đang hoạt động, currentUsers < capacity
  const query = {
    type: 'public',
    isActive: { $ne: false },
    $expr: { $lt: ['$currentUsers', '$capacity'] }
  };

  // Sử dụng aggregate $sample để lấy ngẫu nhiên 1 phòng
  const randomRooms = await roomsColl.aggregate([
    { $match: query },
    { $sample: { size: 1 } },
    {
      $project: {
        password: 0 // Giấu mật khẩu
      }
    }
  ]).toArray();

  if (!randomRooms || randomRooms.length === 0) {
    return null;
  }

  return randomRooms[0];
}

/**
 * 3. Hàm load danh sách các thẻ đại diện phòng học ảo (Lobby Cards / Feed)
 * Hỗ trợ bộ lọc filter, tìm kiếm query, sắp xếp sort (trending, new, active, available)
 * 
 * @param {object} options
 * @param {string} [options.search]
 * @param {string} [options.topic]
 * @param {string} [options.tab] - 'trending' | 'new' | 'active' | 'available'
 * @param {number} [options.limit]
 * @param {number} [options.skip]
 */
export async function getStudyRoomCards(options = {}) {
  // Tự động dọn dẹp các phòng học đã không còn ai quá 1 tiếng
  await cleanupExpiredEmptyRooms().catch(() => {});

  const {
    search = '',
    topic = '',
    tab = 'trending',
    limit = 20,
    skip = 0
  } = options;

  const db = await getMongoDb();
  const roomsColl = db.collection(COLLECTION_STUDY_ROOMS);

  const query = {
    type: 'public', // Danh sách thẻ lobby mặc định chỉ hiển thị phòng public
    isActive: { $ne: false }
  };

  // Lọc theo topic / tags
  if (topic && topic !== 'Tất cả') {
    query.$or = [
      { topic: new RegExp(topic, 'i') },
      { tags: { $in: [new RegExp(`^${topic}$`, 'i')] } }
    ];
  }

  // Tìm kiếm theo từ khóa (tên, chủ đề, mục tiêu, tags)
  if (search && search.trim()) {
    const searchRegex = new RegExp(search.trim(), 'i');
    const searchCondition = [
      { name: searchRegex },
      { topic: searchRegex },
      { goal: searchRegex },
      { tags: { $elemMatch: { $regex: searchRegex } } }
    ];
    if (query.$or) {
      query.$and = [{ $or: query.$or }, { $or: searchCondition }];
      delete query.$or;
    } else {
      query.$or = searchCondition;
    }
  }

  // Filter theo Tab
  if (tab === 'available') {
    query.$expr = { $lt: ['$currentUsers', '$capacity'] };
  } else if (tab === 'active') {
    query.status = { $in: ['focus', 'break'] };
  }

  // Sắp xếp
  let sortOption = { createdAt: -1 }; // Mặc định 'new'
  if (tab === 'trending') {
    sortOption = { currentUsers: -1, createdAt: -1 };
  } else if (tab === 'new') {
    sortOption = { createdAt: -1 };
  }

  const parsedLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const parsedSkip = Math.max(Number(skip) || 0, 0);

  const [rooms, total] = await Promise.all([
    roomsColl
      .find(query, { projection: { password: 0 } })
      .sort(sortOption)
      .skip(parsedSkip)
      .limit(parsedLimit)
      .toArray(),
    roomsColl.countDocuments(query)
  ]);

  return {
    rooms,
    total,
    page: Math.floor(parsedSkip / parsedLimit) + 1,
    limit: parsedLimit
  };
}

/**
 * 4. Hàm tìm kiếm phòng bằng mã phòng hoặc link và kiểm tra quyền vào phòng (bao gồm mật khẩu)
 * 
 * Người dùng nhập mã phòng (vd: "TU123456", "tu123456") hoặc link phòng (vd: "http://localhost:4200/learning/study-room/tu123456").
 * - Nếu không tìm thấy: Báo lỗi 404
 * - Nếu là phòng riêng tư cần mật khẩu:
 *    + Nếu không truyền mật khẩu hoặc mật khẩu sai: Trả về lỗi 403 / 401 hoặc cấm vào
 * - Nếu hợp lệ: Trả về thông tin phòng chi tiết để người dùng tham gia (bao gồm theme để set hình nền phòng)
 * 
 * @param {string} codeOrLink - Mã phòng hoặc link do người dùng nhập
 * @param {string} [inputPassword] - Mật khẩu người dùng nhập nếu phòng yêu cầu
 */
export async function searchAndJoinRoom(codeOrLink, inputPassword = '', userId) {
  if (!userId) {
    throw createStudyRoomError('Yêu cầu đăng nhập để tham gia phòng học.', 401, 'AUTHENTICATION_REQUIRED');
  }
  const cleanInput = typeof codeOrLink === 'string' ? codeOrLink.trim() : '';
  if (!cleanInput) {
    const error = new Error('Vui lòng nhập mã phòng hoặc link liên kết phòng.');
    error.status = 400;
    error.code = 'INVALID_INPUT';
    throw error;
  }

  // Tách lấy mã phòng nếu người dùng truyền URL link
  // Hỗ trợ cả URL dạng https://domain.com/learning/study-room/ABC123XYZ hoặc mã trần "ABC123XYZ"
  let parsedCode = cleanInput;
  try {
    if (cleanInput.includes('/')) {
      const parts = cleanInput.split('?')[0].split('#')[0].split('/').filter(Boolean);
      parsedCode = parts[parts.length - 1]; // Lấy phần tử cuối cùng của URL
    }
  } catch {
    parsedCode = cleanInput;
  }

  const db = await getMongoDb();
  const roomsColl = db.collection(COLLECTION_STUDY_ROOMS);

  // Tìm theo roomCode (in hoa) hoặc roomId (thường) hoặc chính xác chuỗi link
  const room = await roomsColl.findOne({
    $or: [
      { roomCode: parsedCode.toUpperCase() },
      { roomId: parsedCode.toLowerCase() },
      { roomLink: cleanInput }
    ],
    isActive: { $ne: false }
  });

  if (!room) {
    const error = new Error('Không tìm thấy phòng học ảo phù hợp với mã hoặc link đã nhập.');
    error.status = 404;
    error.code = 'ROOM_NOT_FOUND';
    throw error;
  }

  // Kiểm tra nếu phòng học đã không có ai (kể cả chủ phòng) quá 1 tiếng đồng hồ -> Xóa phòng
  if (room.emptySince && (Date.now() - new Date(room.emptySince).getTime()) >= ROOM_IDLE_TIMEOUT_MS) {
    await roomsColl.deleteOne({ _id: room._id });
    const msgsColl = db.collection(COLLECTION_STUDY_ROOM_MESSAGES);
    await msgsColl.deleteMany({ roomId: room.roomId }).catch(() => {});
    const error = new Error('Phòng học này đã bị xóa do không có bất kỳ ai hoạt động trong hơn 1 tiếng.');
    error.status = 410;
    error.code = 'ROOM_EXPIRED_AND_DELETED';
    throw error;
  }

  // Chủ phòng không cần lời mời; thành viên phòng private phải có lời mời khớp tài khoản.
  if (room.type === 'private' && String(room.creatorId) !== String(userId)) {
    const user = await getUserAccount(db, userId);
    const invites = await db.collection('study_room_invites').find({
      roomId: room.roomId,
      status: { $in: ['pending', 'accepted'] }
    }).toArray();
    const invite = invites.find(candidate =>
      ['pending', 'accepted'].includes(candidate.status) && inviteMatchesAccount(candidate.inviteTarget, user)
    );
    if (!invite) {
      throw createStudyRoomError('Bạn cần lời mời hợp lệ để tham gia phòng riêng tư.', 403, 'INVITATION_REQUIRED');
    }

    if (!inputPassword) {
      const error = createStudyRoomError('Phòng riêng tư yêu cầu mật khẩu.', 401, 'PASSWORD_REQUIRED');
      error.requiresPassword = true;
      throw error;
    }
    if (!room.password || !(await bcrypt.compare(inputPassword, room.password))) {
      throw createStudyRoomError('Mật khẩu phòng học không chính xác.', 403, 'INVALID_PASSWORD');
    }

    if (invite.status === 'pending') {
      await db.collection('study_room_invites').updateOne(
        { _id: invite._id, status: 'pending' },
        { $set: { status: 'accepted' } }
      );
    }
  } else if (room.password) {
    if (!inputPassword) {
      const error = createStudyRoomError('Phòng học yêu cầu mật khẩu.', 401, 'PASSWORD_REQUIRED');
      error.requiresPassword = true;
      throw error;
    }
    if (!(await bcrypt.compare(inputPassword, room.password))) {
      throw createStudyRoomError('Mật khẩu phòng học không chính xác.', 403, 'INVALID_PASSWORD');
    }
  }

  // Người đang ở trong phòng được vào lại; người mới phải còn slot.
  const alreadyParticipant = (room.participants || []).some(p => String(p.userId) === String(userId));
  if (!alreadyParticipant && room.currentUsers >= room.capacity) {
    const error = new Error('Phòng học này hiện tại đã đủ sức chứa (đầy người).');
    error.status = 403;
    error.code = 'ROOM_FULL';
    error.room = {
      roomId: room.roomId,
      name: room.name,
      capacity: room.capacity,
      currentUsers: room.currentUsers
    };
    throw error;
  }

  // Trả về dữ liệu chi tiết của phòng học để client set nền và hiển thị giao diện phòng
  const { password, ...safeRoomData } = room;
  return {
    success: true,
    message: 'Xác thực thành công. Cho phép vào phòng học.',
    room: safeRoomData
  };
}

/**
 * Hàm tiện ích che ID phòng (chỉ đối với phòng hiển thị công khai giữ nguyên,
 * đối với phòng riêng tư trả về 3 số đầu còn lại bao nhiêu ký tự sẽ hiển thị *
 * kể cả khi người dùng sao chép cũng không hiển thị giá trị thật của các phần *)
 * 
 * @param {string} roomId
 * @param {string} roomType - 'public' | 'private'
 * @returns {string}
 */
export function maskRoomId(roomId, roomType) {
  if (!roomId) return '';
  if (roomType !== 'private') {
    return roomId;
  }
  const strId = String(roomId);
  if (strId.length <= 3) {
    return strId;
  }
  const prefix = strId.substring(0, 3);
  const maskedLength = strId.length - 3;
  return prefix + '*'.repeat(maskedLength);
}

/**
 * 5. Hàm truy xuất các thông tin chuẩn hóa theo yêu cầu:
 * - Tên phòng (roomName / name)
 * - ID phòng (roomId): Chỉ hiển thị đầy đủ đối với phòng công khai. Phòng riêng tư trả về 3 ký tự đầu còn lại là dấu *
 * - Chủ đề (topic)
 * - Sức chứa (capacity)
 * - Mô tả (description hoặc goal)
 * - Tên roomTheme (roomTheme / theme)
 * - Trạng thái: công khai hoặc riêng tư (statusType / type: 'công khai' | 'riêng tư')
 * 
 * @param {object} roomDoc
 * @returns {object}
 */
export function formatStudyRoomDisplayInfo(roomDoc) {
  if (!roomDoc) return null;
  const isPrivate = roomDoc.type === 'private';
  const effectiveId = roomDoc.roomId || roomDoc.roomCode || (roomDoc._id ? String(roomDoc._id) : '');
  const maskedId = maskRoomId(effectiveId, roomDoc.type);

  return {
    roomName: roomDoc.name || '',
    roomId: maskedId,
    rawId: isPrivate ? undefined : effectiveId, // Không bao giờ gửi rawId nếu private
    topic: roomDoc.topic || '',
    capacity: roomDoc.capacity || roomDoc.maxUsers || 0,
    currentUsers: roomDoc.currentUsers || 0,
    description: roomDoc.description || roomDoc.goal || '',
    roomTheme: roomDoc.roomTheme || roomDoc.theme || '',
    roomStatus: roomDoc.status || 'idle', // 'idle' | 'focus' | 'break'
    type: roomDoc.type || 'public',
    statusType: isPrivate ? 'riêng tư' : 'công khai',
    tags: Array.isArray(roomDoc.tags) ? roomDoc.tags : [],
    createdAt: roomDoc.createdAt
  };
}

/**
 * 6. Hàm tìm kiếm phòng theo chủ đề và tên phòng
 * Tìm kiếm không phân biệt chữ hoa thường (case-insensitive regex).
 * Hỗ trợ tìm kiếm theo cả tên và chủ đề hoặc 1 trong 2.
 * 
 * @param {object} params
 * @param {string} [params.name] - Từ khóa tìm theo tên phòng
 * @param {string} [params.topic] - Từ khóa tìm theo chủ đề
 * @param {boolean} [params.includePrivate=false] - Có bao gồm phòng riêng tư không
 */
export async function searchStudyRoomsByNameAndTopic({ name = '', topic = '', includePrivate = true } = {}) {
  const db = await getMongoDb();
  const roomsColl = db.collection(COLLECTION_STUDY_ROOMS);

  const query = { isActive: { $ne: false } };
  if (!includePrivate) {
    query.type = 'public';
  }

  const andConditions = [];

  const cleanName = typeof name === 'string' ? name.trim() : '';
  if (cleanName) {
    andConditions.push({ name: { $regex: cleanName, $options: 'i' } });
  }

  const cleanTopic = typeof topic === 'string' ? topic.trim() : '';
  if (cleanTopic) {
    andConditions.push({ topic: { $regex: cleanTopic, $options: 'i' } });
  }

  if (andConditions.length > 0) {
    query.$and = andConditions;
  }

  const rawRooms = await roomsColl.find(query).sort({ createdAt: -1 }).toArray();
  return rawRooms.map(formatStudyRoomDisplayInfo);
}

/**
 * 7. Hàm lọc các phòng theo tag kỹ năng HOẶC theo trạng thái:
 * - Trạng thái mới mở: 'new' (sắp xếp mới nhất)
 * - Còn chỗ: 'available' (currentUsers < capacity)
 * - Đang hoạt động: 'active' (status === 'focus' hoặc 'break')
 * 
 * @param {object} params
 * @param {string} [params.tag] - Tag kỹ năng cần lọc
 * @param {'new'|'available'|'active'} [params.status] - Trạng thái phòng cần lọc
 * @param {boolean} [params.includePrivate=true] - Có hiển thị phòng riêng tư không
 */
export async function filterStudyRoomsByTagOrStatus({ tag = '', status = '', includePrivate = true } = {}) {
  const db = await getMongoDb();
  const roomsColl = db.collection(COLLECTION_STUDY_ROOMS);

  const query = { isActive: { $ne: false } };
  if (!includePrivate) {
    query.type = 'public';
  }

  const cleanTag = typeof tag === 'string' ? tag.trim() : '';
  if (cleanTag && cleanTag !== 'Tất cả') {
    query.tags = { $elemMatch: { $regex: `^${cleanTag}$`, $options: 'i' } };
  }

  let sortOption = { createdAt: -1 };

  if (status === 'available') {
    query.$expr = { $lt: ['$currentUsers', '$capacity'] };
  } else if (status === 'active') {
    query.status = { $in: ['focus', 'break'] };
  } else if (status === 'new') {
    sortOption = { createdAt: -1 };
  }

  const rawRooms = await roomsColl.find(query).sort(sortOption).toArray();
  return rawRooms.map(formatStudyRoomDisplayInfo);
}

/**
 * 8. Hàm lọc các tag phổ biến nhất (gồm 6 tag có số lượng phòng sử dụng nhiều nhất)
 * VÀ hỗ trợ nút "Tất cả": khi người dùng nhấn "Tất cả" thì sẽ hiển thị tất cả phòng học hiện có kể cả riêng tư lẫn công khai
 * 
 * @param {object} options
 * @param {boolean} [options.fetchAllRooms=false] - Nếu true (nút Tất cả được nhấn), trả về tất cả phòng học (kể cả riêng tư lẫn công khai)
 */
export async function getTopPopularTagsAndAllRooms({ fetchAllRooms = false } = {}) {
  const db = await getMongoDb();
  const roomsColl = db.collection(COLLECTION_STUDY_ROOMS);

  // Aggregation đếm tần suất xuất hiện của từng tag trên toàn bộ phòng đang hoạt động
  const tagAggregation = await roomsColl.aggregate([
    { $match: { isActive: { $ne: false } } },
    { $unwind: '$tags' },
    {
      $group: {
        _id: '$tags',
        count: { $sum: 1 }
      }
    },
    { $sort: { count: -1 } },
    { $limit: 6 } // Lấy top 6 tag phổ biến nhất
  ]).toArray();

  const top6Tags = tagAggregation.map(item => ({
    name: item._id,
    count: item.count
  }));

  let allRooms = [];
  if (fetchAllRooms) {
    // Trả về tất cả các phòng hiện có kể cả riêng tư lẫn công khai
    const rawAll = await roomsColl
      .find({ isActive: { $ne: false } })
      .sort({ createdAt: -1 })
      .toArray();
    allRooms = rawAll.map(formatStudyRoomDisplayInfo);
  }

  return {
    topTags: top6Tags,
    allRoomsCount: fetchAllRooms ? allRooms.length : undefined,
    allRooms: fetchAllRooms ? allRooms : undefined
  };
}

/**
 * 9. Hàm lọc các phòng học có tag do người dùng chọn (hỗ trợ 1 hoặc nhiều tags)
 * 
 * @param {string|string[]} userTags - Tag hoặc mảng các tags mà người dùng chọn
 * @param {boolean} [includePrivate=true] - Có bao gồm cả phòng riêng tư hay không
 */
export async function filterRoomsByUserTags(userTags, includePrivate = true) {
  const db = await getMongoDb();
  const roomsColl = db.collection(COLLECTION_STUDY_ROOMS);

  let tagList = [];
  if (Array.isArray(userTags)) {
    tagList = userTags.map(t => String(t).trim()).filter(Boolean);
  } else if (typeof userTags === 'string') {
    tagList = userTags.split(',').map(t => t.trim()).filter(Boolean);
  }

  const query = { isActive: { $ne: false } };
  if (!includePrivate) {
    query.type = 'public';
  }

  if (tagList.length > 0 && !tagList.includes('Tất cả')) {
    // Tìm các phòng chứa ít nhất một trong các tags người dùng chọn (case-insensitive)
    const tagRegexes = tagList.map(t => new RegExp(`^${t}$`, 'i'));
    query.tags = { $in: tagRegexes };
  }

  const rawRooms = await roomsColl.find(query).sort({ createdAt: -1 }).toArray();
  return rawRooms.map(formatStudyRoomDisplayInfo);
}

/**
 * 10. Hàm truy xuất danh sách thông tin phòng học chuẩn hóa:
 * Tên phòng, ID phòng (che nếu private), chủ đề, sức chứa, mô tả, tên roomTheme, trạng thái
 * 
 * @param {object} options
 * @param {boolean} [options.includePrivate=true]
 */
export async function getStudyRoomDisplayList({ includePrivate = true, limit = 50, skip = 0 } = {}) {
  const db = await getMongoDb();
  const roomsColl = db.collection(COLLECTION_STUDY_ROOMS);

  const query = { isActive: { $ne: false } };
  if (!includePrivate) {
    query.type = 'public';
  }

  const rawRooms = await roomsColl
    .find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .toArray();

  return rawRooms.map(formatStudyRoomDisplayInfo);
}

/**
 * 11. Router Express quản lý các API Study Room
 * @param {Function} express
 * @param {Function} requireAuth
 */
export function createStudyRoomRouter(express, requireAuth) {
  const router = express.Router();

  /**
   * POST /api/study-room/create
   * Tạo phòng học mới
   */
  router.post('/create', requireAuth, async (req, res, next) => {
    try {
      const createdRoom = await createStudyRoom(req.userId, req.body);
      res.status(201).json({
        success: true,
        message: 'Tạo phòng học ảo thành công.',
        data: createdRoom
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/study-room/random-spawn
   * Tìm và spawn ngẫu nhiên vào một phòng công khai còn chỗ
   */
  router.get('/random-spawn', async (req, res, next) => {
    try {
      const room = await getRandomAvailablePublicRoom();
      if (!room) {
        return res.status(404).json({
          success: false,
          message: 'Hiện tại không có phòng công khai nào còn chỗ trống.'
        });
      }
      res.json({
        success: true,
        message: 'Tìm thấy phòng học phù hợp.',
        data: room
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/study-room/cards (hoặc /api/study-room/lobby)
   * Tải danh sách thẻ phòng học ảo
   */
  router.get('/cards', async (req, res, next) => {
    try {
      const { search, topic, tab, limit, skip } = req.query;
      const result = await getStudyRoomCards({ search, topic, tab, limit, skip });
      res.json({
        success: true,
        data: result.rooms,
        total: result.total,
        page: result.page,
        limit: result.limit
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/study-room/search
   * Tìm kiếm phòng theo chủ đề và tên phòng
   * Query params: ?name=...&topic=...&includePrivate=true/false
   */
  router.get('/search', async (req, res, next) => {
    try {
      const { name, topic, includePrivate } = req.query;
      const rooms = await searchStudyRoomsByNameAndTopic({
        name,
        topic,
        includePrivate: includePrivate !== 'false'
      });
      res.json({
        success: true,
        data: rooms,
        total: rooms.length
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/study-room/filter
   * Lọc phòng theo tag kỹ năng hoặc theo trạng thái (new, available, active)
   * Query params: ?tag=...&status=...&includePrivate=true/false
   */
  router.get('/filter', async (req, res, next) => {
    try {
      const { tag, status, includePrivate } = req.query;
      const rooms = await filterStudyRoomsByTagOrStatus({
        tag,
        status,
        includePrivate: includePrivate !== 'false'
      });
      res.json({
        success: true,
        data: rooms,
        total: rooms.length
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/study-room/tags/popular
   * Lấy top 6 tag phổ biến nhất, hỗ trợ param ?all=true để hiển thị tất cả phòng học (kể cả riêng tư lẫn công khai)
   */
  router.get('/tags/popular', async (req, res, next) => {
    try {
      const fetchAllRooms = req.query.all === 'true' || req.query.all === '1';
      const result = await getTopPopularTagsAndAllRooms({ fetchAllRooms });
      res.json({
        success: true,
        data: result
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/study-room/filter-by-tags
   * Lọc các phòng học có tag do người dùng chọn (truyền mảng tags)
   * Body: { tags: ['Lập trình', 'NodeJS'], includePrivate: true }
   */
  router.post('/filter-by-tags', async (req, res, next) => {
    try {
      const { tags, includePrivate = true } = req.body;
      const rooms = await filterRoomsByUserTags(tags, includePrivate);
      res.json({
        success: true,
        data: rooms,
        total: rooms.length
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/study-room/display-list
   * Truy xuất danh sách thông tin chuẩn hóa: Tên, ID (che nếu private), Chủ đề, Sức chứa, Mô tả, Theme, Trạng thái
   */
  router.get('/display-list', async (req, res, next) => {
    try {
      const includePrivate = req.query.includePrivate !== 'false';
      const limit = Number(req.query.limit) || 50;
      const skip = Number(req.query.skip) || 0;
      const rooms = await getStudyRoomDisplayList({ includePrivate, limit, skip });
      res.json({
        success: true,
        data: rooms,
        total: rooms.length
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/study-room/join
   * Tìm kiếm phòng bằng mã/link và xác thực mật khẩu vào phòng
   */
  router.post('/join', requireAuth, async (req, res, next) => {
    try {
      const { codeOrLink, password } = req.body;
      const result = await searchAndJoinRoom(codeOrLink, password, req.userId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/study-room/token
   * Sinh LiveKit token cho người dùng tham gia phòng học (Voice, Video, ScreenShare)
   * Tự động tính tọa độ (x, y) trên canvas để không chèn lên người khác
   */
  router.post('/token', requireAuth, async (req, res, next) => {
    try {
      const { roomId, userName } = req.body;
      const effectiveUserName = userName || 'Học viên';
      const tokenData = await generateLiveKitToken({
        roomId,
        userId: req.userId,
        userName: effectiveUserName
      });
      res.json({
        success: true,
        data: tokenData
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/study-room/:roomId/participants
   * Truy xuất danh sách avatar thành viên kèm tên (tự động gắn "(Bạn)" nếu là người dùng hiện tại),
   * chức danh người dùng (Chủ phòng, Moderator, Thành viên) và tọa độ canvas.
   */
  router.get('/:roomId/participants', requireAuth, async (req, res, next) => {
    try {
      const { roomId } = req.params;
      const result = await getRoomParticipants(roomId, req.userId);
      res.json({
        success: true,
        data: result
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * PUT /api/study-room/:roomId/position
   * Cập nhật vị trí kéo thả avatar của người dùng trên canvas
   */
  router.put('/:roomId/position', requireAuth, async (req, res, next) => {
    try {
      const { roomId } = req.params;
      const { x, y } = req.body;
      const result = await updateParticipantCanvasPosition(roomId, req.userId, { x, y });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/study-room/:roomId/permissions
   * Lấy ma trận quyền (Permission Matrix) và quyền thực tế của người dùng trong phòng
   */
  router.get('/:roomId/permissions', requireAuth, async (req, res, next) => {
    try {
      const { roomId } = req.params;
      const result = await getMemberEffectivePermissions(roomId, req.userId);
      res.json({
        success: true,
        data: result
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * PUT /api/study-room/:roomId/permissions
   * Chủ phòng cập nhật quyền toàn phòng
   */
  router.put('/:roomId/permissions', requireAuth, async (req, res, next) => {
    try {
      const { roomId } = req.params;
      const result = await updateRoomPermissions(roomId, req.userId, req.body);
      res.json({
        success: true,
        message: 'Cập nhật quyền phòng học thành công.',
        data: result
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * PUT /api/study-room/:roomId/theme
   * Thay đổi theme nền phòng học
   */
  router.put('/:roomId/theme', requireAuth, async (req, res, next) => {
    try {
      const { roomId } = req.params;
      const { theme } = req.body;
      const result = await changeRoomTheme(roomId, req.userId, theme);
      res.json({
        success: true,
        message: 'Cập nhật theme nền phòng học thành công.',
        data: result
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/study-room/:roomId/invite
   * Mời người dùng vào phòng bằng Email hoặc Số điện thoại
   */
  router.post('/:roomId/invite', requireAuth, async (req, res, next) => {
    try {
      const { roomId } = req.params;
      const { emailOrPhone, inviterName } = req.body;
      const result = await inviteUserToRoom(roomId, emailOrPhone, req.userId, inviterName || 'Bạn bè');
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/study-room/:roomId/request-join
   * Gửi yêu cầu xin vào phòng (dành cho phòng bật duyệt)
   */
  router.post('/:roomId/request-join', requireAuth, async (req, res, next) => {
    try {
      const { roomId } = req.params;
      const { userName } = req.body;
      const result = await requestJoinApproval(roomId, req.userId, userName);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/study-room/:roomId/handle-request
   * Chủ phòng duyệt hoặc từ chối yêu cầu vào phòng
   */
  router.post('/:roomId/handle-request', requireAuth, async (req, res, next) => {
    try {
      const { roomId } = req.params;
      const { targetUserId, action } = req.body;
      const result = await handleJoinApprovalRequest(roomId, req.userId, targetUserId, action);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/study-room/:roomId/leave
   * Rời khỏi phòng học ảo: giảm currentUsers, xóa participant khỏi danh sách.
   * Nếu phòng không còn ai (kể cả chủ phòng) -> kích hoạt emptySince để đếm 1 tiếng.
   */
  router.post('/:roomId/leave', requireAuth, async (req, res, next) => {
    try {
      const { roomId } = req.params;
      const result = await leaveStudyRoom(roomId, req.userId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/study-room/:roomId/messages
   * Lấy tin nhắn phòng: CHỈ hiển thị những tin nhắn được gửi KỂ TỪ LÚC NGƯỜI ĐÓ VÀO PHÒNG (joinedAt).
   * Các tin nhắn trước đó của người khác sẽ hoàn toàn không hiển thị.
   */
  router.get('/:roomId/messages', requireAuth, async (req, res, next) => {
    try {
      const { roomId } = req.params;
      const messages = await getRoomSessionMessages(roomId, req.userId);
      res.json({
        success: true,
        data: messages,
        total: messages.length
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/study-room/:roomId/messages
   * Gửi tin nhắn mới vào phòng học ảo
   */
  router.post('/:roomId/messages', requireAuth, async (req, res, next) => {
    try {
      const { roomId } = req.params;
      const { senderName, content, senderAvatar } = req.body;
      const result = await sendRoomMessage(roomId, {
        userId: req.userId,
        senderName,
        content,
        senderAvatar
      });
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/study-room/cleanup
   * Kích hoạt dọn dẹp các phòng học đã trống (không có ai kể cả chủ phòng) quá 1 tiếng
   */
  router.post('/cleanup', async (req, res, next) => {
    try {
      const result = await cleanupExpiredEmptyRooms();
      res.json({
        success: true,
        message: 'Hoàn tất kiểm tra và dọn dẹp phòng trống quá hạn.',
        data: result
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

// ─────────────────────────────────────────────────────────────────────────────
// CÁC HÀM XỬ LÝ LIVEKIT, QUYỀN HẠN, CANVAS VÀ PHÒNG HỌC ẢO
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 12. Hàm tính tọa độ ngẫu nhiên trên canvas phòng học sao cho người dùng KHÔNG bị chèn lên nhau
 * @param {Array<{position: {x: number, y: number}}>} existingParticipants
 * @param {object} options
 * @param {number} [options.canvasWidth=1920]
 * @param {number} [options.canvasHeight=1080]
 * @param {number} [options.minDistance=140] - Khoảng cách an toàn tối thiểu giữa các avatar (px)
 */
export function calculateNonOverlappingCanvasPosition(existingParticipants = [], options = {}) {
  const {
    canvasWidth = 1920,
    canvasHeight = 1080,
    minDistance = 140
  } = options;

  // Vùng an toàn không bị sát mép thanh điều khiển
  const minX = 150;
  const maxX = canvasWidth - 250;
  const minY = 120;
  const maxY = canvasHeight - 200;

  const positions = existingParticipants
    .map(p => p.position)
    .filter(pos => pos && typeof pos.x === 'number' && typeof pos.y === 'number');

  // Thử sinh ngẫu nhiên tối đa 50 lần để tìm điểm không trùng
  for (let attempt = 0; attempt < 50; attempt++) {
    const candidateX = Math.floor(minX + Math.random() * (maxX - minX));
    const candidateY = Math.floor(minY + Math.random() * (maxY - minY));

    const isOverlap = positions.some(pos => {
      const dx = pos.x - candidateX;
      const dy = pos.y - candidateY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      return distance < minDistance;
    });

    if (!isOverlap) {
      return { x: candidateX, y: candidateY };
    }
  }

  // Nếu phòng quá đông, xếp theo dạng lưới (grid layout)
  const index = positions.length;
  const cols = Math.floor((maxX - minX) / minDistance) || 5;
  const row = Math.floor(index / cols);
  const col = index % cols;
  return {
    x: Math.min(minX + col * minDistance, maxX),
    y: Math.min(minY + row * minDistance, maxY)
  };
}

/**
 * 13. Hàm sinh token LiveKit cho người dùng vào phòng học ảo
 * FE không cần cấu hình API KEY/SECRET, BE tự ký token và cấp quyền (Voice, Video, ScreenShare)
 * 
 * @param {object} params
 * @param {string} params.roomId - Mã phòng học
 * @param {string} params.userId - ID người dùng
 * @param {string} [params.userName] - Tên hiển thị người dùng
 * @param {string} [params.userAvatar] - URL ảnh avatar đại diện
 * @param {string} [params.avatar] - URL ảnh avatar (alias)
 */
export async function generateLiveKitToken({ roomId, userId, userName = 'Học viên', userAvatar = '', avatar = '' }) {
  if (!roomId) {
    const error = new Error('Thiếu roomId để sinh LiveKit token.');
    error.status = 400;
    throw error;
  }
  if (!userId) {
    throw createStudyRoomError('Yêu cầu đăng nhập để cấp LiveKit token.', 401, 'AUTHENTICATION_REQUIRED');
  }

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const livekitUrl = process.env.LIVEKIT_URL || 'wss://study-room-gewz89g8.livekit.cloud';

  if (!apiKey || !apiSecret) {
    const error = new Error('Server chưa được cấu hình LIVEKIT_API_KEY hoặc LIVEKIT_API_SECRET.');
    error.status = 500;
    throw error;
  }

  const db = await getMongoDb();
  const roomsColl = db.collection(COLLECTION_STUDY_ROOMS);

  // Tìm thông tin phòng
  const room = await roomsColl.findOne({
    $or: [{ roomId: roomId.toLowerCase() }, { roomCode: roomId.toUpperCase() }],
    isActive: { $ne: false }
  });

  if (!room) {
    const error = new Error('Không tìm thấy phòng học ảo.');
    error.status = 404;
    throw error;
  }

  const existingParticipant = (room.participants || []).find(p => String(p.userId) === String(userId));
  const isOwner = room.creatorId && String(room.creatorId) === String(userId);
  const userRole = isOwner ? 'owner' : (existingParticipant?.role === 'moderator' ? 'moderator' : 'member');
  const account = await getUserAccount(db, userId);

  if (room.type === 'private' && !isOwner) {
    const acceptedInvites = await db.collection('study_room_invites').find({
      roomId: room.roomId,
      status: 'accepted'
    }).toArray();
    const acceptedInvite = acceptedInvites.find(invite => inviteMatchesAccount(invite.inviteTarget, account));
    if (!acceptedInvite) {
      throw createStudyRoomError('Bạn cần hoàn tất xác thực lời mời và mật khẩu trước khi vào phòng.', 403, 'INVITATION_REQUIRED');
    }
  }

  // Tính toán tọa độ canvas không bị đè lên người khác
  const position = calculateNonOverlappingCanvasPosition(room.participants || []);

  let effectiveAvatar = account?.avatar_url || account?.avatar || existingParticipant?.avatar || userAvatar || avatar || '';
  let effectiveUserName = account?.full_name || account?.name || existingParticipant?.name || userName || 'Học viên';

  const roleLabel = getRoleLabel(userRole);
  const initials = getInitials(effectiveUserName);

  // Cập nhật người dùng vào danh sách participants của phòng trong DB
  const participantDoc = {
    userId: String(userId),
    name: effectiveUserName,
    avatar: effectiveAvatar,
    initials,
    role: userRole,
    roleLabel,
    position,
    joinedAt: existingParticipant?.joinedAt || new Date()
  };

  const now = new Date();
  const capacityCondition = {
    $or: [
      { 'participants.userId': String(userId) },
      { $expr: { $lt: [{ $size: { $setUnion: [{ $map: { input: { $ifNull: ['$participants', []] }, as: 'participant', in: '$$participant.userId' } }, []] } }, '$capacity'] } }
    ]
  };
  const updateResult = await roomsColl.updateOne(
    { _id: room._id, ...capacityCondition },
    [
      { $set: {
        participants: {
          $let: {
            vars: { current: { $ifNull: ['$participants', []] } },
            in: {
              $let: {
                vars: { existing: { $first: { $filter: { input: '$$current', as: 'participant', cond: { $eq: ['$$participant.userId', String(userId)] } } } } },
                in: {
                  $concatArrays: [
                    { $filter: { input: '$$current', as: 'participant', cond: { $ne: ['$$participant.userId', String(userId)] } } },
                    [{ $mergeObjects: [participantDoc, { joinedAt: { $ifNull: ['$$existing.joinedAt', now] }, position: { $ifNull: ['$$existing.position', position] } }] }]
                  ]
                }
              }
            }
          }
        }
      } },
      { $set: {
        currentUsers: { $size: { $setUnion: [{ $map: { input: '$participants', as: 'participant', in: '$$participant.userId' } }, []] } },
        updatedAt: now,
        emptySince: null
      } }
    ]
  );
  if (!updateResult.matchedCount) {
    throw createStudyRoomError('Phòng học này hiện tại đã đủ sức chứa.', 403, 'ROOM_FULL');
  }

  // Khởi tạo LiveKit AccessToken
  const at = new AccessToken(apiKey, apiSecret, {
    identity: String(userId),
    name: userName,
    metadata: JSON.stringify({
      role: userRole,
      roleLabel,
      avatar: effectiveAvatar,
      initials,
      position,
      roomId: room.roomId
    })
  });

  const roomPermissions = room.permissions || {
    voiceEnabled: true,
    cameraEnabled: true,
    chatEnabled: true,
    participantShareScreen: false
  };

  // Cấp quyền LiveKit Grant tùy theo vai trò và quyền phòng
  const isOwnerOrMod = userRole === 'owner' || userRole === 'moderator';
  const canPublishSources = isOwnerOrMod
    ? [TrackSource.MICROPHONE, TrackSource.CAMERA, TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO]
    : [
        ...(roomPermissions.voiceEnabled ? [TrackSource.MICROPHONE] : []),
        ...(roomPermissions.cameraEnabled ? [TrackSource.CAMERA] : []),
        ...(roomPermissions.participantShareScreen ? [TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO] : [])
      ];
  at.addGrant({
    roomJoin: true,
    room: room.roomId,
    canPublish: canPublishSources.length > 0,
    canPublishSources,
    canPublishData: isOwnerOrMod || roomPermissions.chatEnabled,
    canSubscribe: true
  });

  const token = await at.toJwt();

  return {
    token,
    livekitUrl,
    roomId: room.roomId,
    role: userRole,
    position,
    permissions: roomPermissions
  };
}

/**
 * 14. Bảng truy xuất Permission Matrix hiển thị các chức năng được cấp quyền
 * @returns {Array<object>} Danh sách chức năng và quyền tương ứng của Chủ phòng, Moderator, Thành viên
 */
export function getPermissionMatrix() {
  return [
    { feature: 'chat', label: 'Nhắn tin (Chat)', owner: true, moderator: true, member: 'Theo quyền' },
    { feature: 'voice', label: 'Bật Mic / Voice', owner: true, moderator: true, member: 'Theo quyền' },
    { feature: 'camera', label: 'Bật Camera', owner: true, moderator: true, member: 'Theo quyền' },
    { feature: 'whiteboard', label: 'Bảng vẽ & Dùng bút', owner: true, moderator: true, member: 'Theo quyền' },
    { feature: 'stickyNote', label: 'Thêm Sticky Note & Text', owner: true, moderator: true, member: true },
    { feature: 'uploadMedia', label: 'Tải ảnh, gif, video youtube', owner: true, moderator: true, member: 'Theo quyền' },
    { feature: 'shareScreen', label: 'Chia sẻ màn hình', owner: true, moderator: true, member: 'Theo quyền' },
    { feature: 'music', label: 'Bật nhạc nghe chung (Lofi)', owner: true, moderator: true, member: true },
    { feature: 'inviteUser', label: 'Mời người dùng khác', owner: true, moderator: true, member: true },
    { feature: 'changeTheme', label: 'Thay đổi nền phòng', owner: true, moderator: true, member: false },
    { feature: 'approveMember', label: 'Duyệt yêu cầu vào phòng', owner: true, moderator: true, member: false },
    { feature: 'managePermissions', label: 'Cấp quyền toàn phòng', owner: true, moderator: false, member: false }
  ];
}

/**
 * 15. Hàm lấy danh sách quyền thực tế của một thành viên cụ thể trong phòng học
 * @param {string} roomId
 * @param {string} userId
 */
export async function getMemberEffectivePermissions(roomId, userId) {
  const db = await getMongoDb();
  const roomsColl = db.collection(COLLECTION_STUDY_ROOMS);

  const room = await roomsColl.findOne({
    $or: [{ roomId: roomId.toLowerCase() }, { roomCode: roomId.toUpperCase() }],
    isActive: { $ne: false }
  });

  if (!room) {
    const error = new Error('Không tìm thấy phòng học ảo.');
    error.status = 404;
    throw error;
  }

  const roomPermissions = room.permissions || {
    voiceEnabled: true,
    cameraEnabled: true,
    chatEnabled: true,
    whiteboardLocked: false,
    participantShareScreen: false,
    participantUpload: true,
    approvalRequired: false
  };

  let role = 'member';
  if (room.creatorId && String(room.creatorId) === String(userId)) {
    role = 'owner';
  } else {
    const participant = (room.participants || []).find(p => String(p.userId) === String(userId));
    if (participant) role = participant.role;
  }

  const isOwner = role === 'owner';
  const isMod = role === 'moderator';

  // Trả lại danh sách quyền thành viên đó được dùng hoặc không (boolean)
  const effective = {
    role,
    isOwner,
    isModerator: isMod,
    canChat: isOwner || isMod || !!roomPermissions.chatEnabled,
    canVoice: isOwner || isMod || !!roomPermissions.voiceEnabled,
    canCamera: isOwner || isMod || !!roomPermissions.cameraEnabled,
    canUseWhiteboard: isOwner || isMod || !roomPermissions.whiteboardLocked,
    canShareScreen: isOwner || isMod || !!roomPermissions.participantShareScreen,
    canUploadMedia: isOwner || isMod || !!roomPermissions.participantUpload,
    canChangeTheme: isOwner || isMod,
    canManagePermissions: isOwner,
    canApproveMember: isOwner || isMod,
    canInvite: true,
    canListenMusic: true
  };

  return {
    roomId: room.roomId,
    userId,
    role,
    roomPermissions,
    effectivePermissions: effective,
    permissionMatrix: getPermissionMatrix()
  };
}

/**
 * 16. Hàm cấp quyền cho toàn phòng - Chỉ áp dụng với Chủ phòng
 * Các quyền: cho phép bật mic, cho phép bật camera, cho phép chat, khóa bảng vẽ,
 * chia sẻ màn hình, cho phép tải ảnh gif video youtube lên, duyệt yêu cầu vào phòng
 * 
 * @param {string} roomId
 * @param {string} requesterId - ID người gọi (phải là chủ phòng)
 * @param {object} newPermissions - Đối tượng quyền cập nhật
 */
export async function updateRoomPermissions(roomId, requesterId, newPermissions = {}) {
  const db = await getMongoDb();
  const roomsColl = db.collection(COLLECTION_STUDY_ROOMS);

  const room = await roomsColl.findOne({
    $or: [{ roomId: roomId.toLowerCase() }, { roomCode: roomId.toUpperCase() }],
    isActive: { $ne: false }
  });

  if (!room) {
    const error = new Error('Không tìm thấy phòng học ảo.');
    error.status = 404;
    throw error;
  }

  // Kiểm tra quyền Chủ phòng
  if (String(room.creatorId) !== String(requesterId)) {
    const error = new Error('Chỉ có Chủ phòng mới có quyền cấp và thay đổi cài đặt quyền hạn toàn phòng.');
    error.status = 403;
    error.code = 'OWNER_PERMISSION_REQUIRED';
    throw error;
  }

  const updatedPermissions = {
    voiceEnabled: typeof newPermissions.voiceEnabled === 'boolean' ? newPermissions.voiceEnabled : (room.permissions?.voiceEnabled ?? true),
    cameraEnabled: typeof newPermissions.cameraEnabled === 'boolean' ? newPermissions.cameraEnabled : (room.permissions?.cameraEnabled ?? true),
    chatEnabled: typeof newPermissions.chatEnabled === 'boolean' ? newPermissions.chatEnabled : (room.permissions?.chatEnabled ?? true),
    whiteboardLocked: typeof newPermissions.whiteboardLocked === 'boolean' ? newPermissions.whiteboardLocked : (room.permissions?.whiteboardLocked ?? false),
    participantShareScreen: typeof newPermissions.participantShareScreen === 'boolean' ? newPermissions.participantShareScreen : (room.permissions?.participantShareScreen ?? false),
    participantUpload: typeof newPermissions.participantUpload === 'boolean' ? newPermissions.participantUpload : (room.permissions?.participantUpload ?? true),
    approvalRequired: typeof newPermissions.approvalRequired === 'boolean' ? newPermissions.approvalRequired : (room.permissions?.approvalRequired ?? false)
  };

  await roomsColl.updateOne(
    { _id: room._id },
    {
      $set: {
        permissions: updatedPermissions,
        updatedAt: new Date()
      }
    }
  );

  return updatedPermissions;
}

/**
 * 17. Hàm thay đổi hình nền phòng học (Room Theme)
 * @param {string} roomId
 * @param {string} requesterId
 * @param {string} themeIdOrUrl
 */
export async function changeRoomTheme(roomId, requesterId, themeIdOrUrl) {
  if (!themeIdOrUrl) {
    const error = new Error('Thiếu thông tin theme nền phòng.');
    error.status = 400;
    throw error;
  }

  const db = await getMongoDb();
  const roomsColl = db.collection(COLLECTION_STUDY_ROOMS);

  const room = await roomsColl.findOne({
    $or: [{ roomId: roomId.toLowerCase() }, { roomCode: roomId.toUpperCase() }],
    isActive: { $ne: false }
  });

  if (!room) {
    const error = new Error('Không tìm thấy phòng học ảo.');
    error.status = 404;
    throw error;
  }

  // Cập nhật theme
  await roomsColl.updateOne(
    { _id: room._id },
    {
      $set: {
        roomTheme: themeIdOrUrl,
        theme: themeIdOrUrl,
        updatedAt: new Date()
      }
    }
  );

  return { roomId: room.roomId, theme: themeIdOrUrl };
}

/**
 * 18. Hàm mời người dùng bằng Email hoặc Số điện thoại
 * Gửi thông báo / lưu lời mời vào hệ thống
 * 
 * @param {string} roomId
 * @param {string} emailOrPhone - Email hoặc SĐT của người được mời
 * @param {string} [inviterName='Bạn bè']
 */
export async function inviteUserToRoom(roomId, emailOrPhone, inviterId, inviterName = 'Bạn bè', options = {}) {
  if (!inviterId) {
    throw createStudyRoomError('Yêu cầu đăng nhập để mời thành viên.', 401, 'AUTHENTICATION_REQUIRED');
  }
  const cleanTarget = normalizeInviteTarget(emailOrPhone);
  if (!cleanTarget || cleanTarget.length > 254 || typeof roomId !== 'string' || !roomId.trim()) {
    const error = new Error('Vui lòng nhập email hoặc số điện thoại người bạn muốn mời.');
    error.status = 400;
    error.code = 'INVALID_INVITE_TARGET';
    throw error;
  }

  const db = options.db || await getMongoDb();
  const roomsColl = db.collection(COLLECTION_STUDY_ROOMS);

  const room = await roomsColl.findOne({
    $or: [{ roomId: roomId.toLowerCase() }, { roomCode: roomId.toUpperCase() }],
    isActive: { $ne: false }
  });

  if (!room) {
    const error = new Error('Không tìm thấy phòng học ảo để mời.');
    error.status = 404;
    throw error;
  }

  const inviter = (room.participants || []).find(p => String(p.userId) === String(inviterId));
  if (String(room.creatorId) !== String(inviterId) && inviter?.role !== 'moderator') {
    throw createStudyRoomError('Chỉ chủ phòng hoặc moderator mới được mời thành viên.', 403, 'INVITE_PERMISSION_REQUIRED');
  }

  const actor = await getUserAccount(db, inviterId);
  const displayName = actor?.full_name || actor?.name || 'Bạn bè';
  // A public invite target must not deliver private-room details to an unverified email/phone.
  const recipient = await db.collection('users').findOne(cleanTarget.includes('@')
    ? { email: cleanTarget, email_verified: true, status: 'active', is_active: { $ne: false } }
    : { phone: cleanTarget, phone_verified: true, status: 'active', is_active: { $ne: false } });
  const invitesColl = db.collection('study_room_invites');
  const inviteDoc = {
    _id: `invite_${crypto.createHash('sha256').update(JSON.stringify([room.roomId, String(inviterId), cleanTarget])).digest('hex')}`,
    roomId: room.roomId,
    roomCode: room.roomCode,
    roomName: room.name,
    roomLink: room.roomLink,
    inviteTarget: cleanTarget,
    inviterName: displayName,
    inviterId: String(inviterId),
    status: 'pending',
    createdAt: new Date()
  };

  const session = db.client.startSession();
  try {
    await session.withTransaction(async () => {
      await invitesColl.updateOne({ _id: inviteDoc._id }, { $setOnInsert: inviteDoc }, { upsert: true, session });
      const saved = await invitesColl.findOne({ _id: inviteDoc._id }, { session });
      if (recipient && saved?.status === 'pending') {
        await createNotificationForEvent(String(recipient._id || recipient.id), {
          eventKey: `study-room-invitation:${inviteDoc._id}`, category: 'community', kind: 'invitation',
          title: 'Lời mời vào phòng học', message: `${displayName} mời bạn tham gia phòng ${room.name}.`,
          sourceType: 'study_room_invite', sourceId: inviteDoc._id,
          href: `/learning/study-room/${encodeURIComponent(room.roomId)}`,
        }, { ...options, db, session });
      }
    });
  } finally { await session.endSession(); }

  return {
    success: true,
    message: `Đã gửi lời mời tham gia phòng học tới ${cleanTarget}.`,
    inviteLink: room.roomLink
  };
}

/**
 * 19. Hàm gửi yêu cầu xin vào phòng (dành cho phòng private hoặc public bật duyệt vào)
 * @param {string} roomId
 * @param {string} userId
 * @param {string} userName
 */
export async function requestJoinApproval(roomId, userId, userName = 'Học viên') {
  const db = await getMongoDb();
  const roomsColl = db.collection(COLLECTION_STUDY_ROOMS);

  const room = await roomsColl.findOne({
    $or: [{ roomId: roomId.toLowerCase() }, { roomCode: roomId.toUpperCase() }],
    isActive: { $ne: false }
  });

  if (!room) {
    const error = new Error('Không tìm thấy phòng học ảo.');
    error.status = 404;
    throw error;
  }

  const joinRequest = {
    userId: String(userId),
    userName,
    status: 'pending',
    requestedAt: new Date()
  };

  await roomsColl.updateOne(
    { _id: room._id },
    {
      $pull: { joinRequests: { userId: String(userId) } }
    }
  );
  await roomsColl.updateOne(
    { _id: room._id },
    {
      $push: { joinRequests: joinRequest },
      $set: { updatedAt: new Date() }
    }
  );

  return {
    success: true,
    message: 'Yêu cầu vào phòng của bạn đã được gửi tới Chủ phòng. Vui lòng chờ phê duyệt.',
    roomId: room.roomId
  };
}

/**
 * 20. Hàm duyệt hoặc từ chối yêu cầu vào phòng (Chỉ Chủ phòng hoặc Moderator)
 * @param {string} roomId
 * @param {string} approverId
 * @param {string} targetUserId
 * @param {'approve'|'reject'} action
 */
export async function handleJoinApprovalRequest(roomId, approverId, targetUserId, action = 'approve') {
  const db = await getMongoDb();
  const roomsColl = db.collection(COLLECTION_STUDY_ROOMS);

  const room = await roomsColl.findOne({
    $or: [{ roomId: roomId.toLowerCase() }, { roomCode: roomId.toUpperCase() }],
    isActive: { $ne: false }
  });

  if (!room) {
    const error = new Error('Không tìm thấy phòng học ảo.');
    error.status = 404;
    throw error;
  }

  // Kiểm tra quyền Chủ phòng
  if (String(room.creatorId) !== String(approverId)) {
    const error = new Error('Chỉ có Chủ phòng mới có quyền duyệt yêu cầu vào phòng.');
    error.status = 403;
    throw error;
  }

  const newStatus = action === 'approve' ? 'approved' : 'rejected';

  await roomsColl.updateOne(
    { _id: room._id, 'joinRequests.userId': String(targetUserId) },
    {
      $set: {
        'joinRequests.$.status': newStatus,
        'joinRequests.$.handledAt': new Date(),
        updatedAt: new Date()
      }
    }
  );

  return {
    success: true,
    message: action === 'approve' ? 'Đã duyệt yêu cầu vào phòng.' : 'Đã từ chối yêu cầu vào phòng.',
    action,
    targetUserId
  };
}

/**
 * 21. Hàm xử lý người dùng rời khỏi phòng học ảo (Leave Study Room)
 * - Xóa người dùng khỏi mảng `participants`.
 * - Giảm `currentUsers`.
 * - Nếu không còn ai trong phòng (kể cả chủ phòng không có mặt) -> Ghi nhận `emptySince: new Date()`.
 * - Khi đó, phòng sẽ bắt đầu tính thời gian nhàn rỗi (idle), nếu quá 1 tiếng sẽ bị tự động xóa.
 * 
 * @param {string} roomId
 * @param {string} userId
 */
export async function leaveStudyRoom(roomId, userId) {
  if (!roomId || !userId) {
    const error = new Error('Thiếu roomId hoặc userId để rời phòng.');
    error.status = 400;
    throw error;
  }

  const db = await getMongoDb();
  const roomsColl = db.collection(COLLECTION_STUDY_ROOMS);

  const room = await roomsColl.findOne({
    $or: [{ roomId: roomId.toLowerCase() }, { roomCode: roomId.toUpperCase() }],
    isActive: { $ne: false }
  });

  if (!room) {
    return { success: true, message: 'Phòng không tồn tại hoặc đã bị xóa.' };
  }

  const now = new Date();
  await roomsColl.updateOne(
    { _id: room._id, 'participants.userId': String(userId) },
    [
      { $set: {
        participants: {
          $filter: {
            input: { $ifNull: ['$participants', []] },
            as: 'participant',
            cond: { $ne: ['$$participant.userId', String(userId)] }
          }
        }
      } },
      { $set: {
        currentUsers: { $size: { $setUnion: [{ $map: { input: '$participants', as: 'participant', in: '$$participant.userId' } }, []] } },
        emptySince: { $cond: [{ $eq: [{ $size: '$participants' }, 0] }, now, null] },
        updatedAt: now
      } }
    ]
  );

  const updatedRoom = await roomsColl.findOne({ _id: room._id });
  const newCurrentUsers = updatedRoom?.currentUsers || 0;

  return {
    success: true,
    message: 'Đã rời khỏi phòng học.',
    roomId: room.roomId,
    currentUsers: newCurrentUsers,
    isRoomEmpty: newCurrentUsers === 0
  };
}

/**
 * 22. Hàm gửi tin nhắn trong phòng học ảo (Send Room Message)
 * Lưu tin nhắn vào MongoDB collection `study_room_messages`.
 * 
 * @param {string} roomId
 * @param {object} payload
 * @param {string} payload.userId
 * @param {string} [payload.senderName]
 * @param {string} payload.content
 * @param {string} [payload.senderAvatar]
 */
export async function sendRoomMessage(roomId, payload = {}) {
  const { userId, senderName = 'Thành viên', content, senderAvatar = '' } = payload;

  const cleanContent = typeof content === 'string' ? content.trim() : '';
  if (!cleanContent) {
    const error = new Error('Nội dung tin nhắn không được để trống.');
    error.status = 400;
    throw error;
  }
  if (!userId) {
    throw createStudyRoomError('Yêu cầu đăng nhập để gửi tin nhắn.', 401, 'AUTHENTICATION_REQUIRED');
  }

  const db = await getMongoDb();
  const roomsColl = db.collection(COLLECTION_STUDY_ROOMS);

  const room = await roomsColl.findOne({
    $or: [{ roomId: roomId.toLowerCase() }, { roomCode: roomId.toUpperCase() }],
    isActive: { $ne: false }
  });

  if (!room) {
    const error = new Error('Không tìm thấy phòng học ảo để gửi tin nhắn.');
    error.status = 404;
    throw error;
  }

  const participant = (room.participants || []).find(p => String(p.userId) === String(userId));
  if (!participant) {
    throw createStudyRoomError('Chỉ thành viên trong phòng mới được gửi tin nhắn.', 403, 'ROOM_MEMBERSHIP_REQUIRED');
  }

  // Kiểm tra quyền chat của phòng
  if (room.permissions && room.permissions.chatEnabled === false) {
    const isOwnerOrMod = String(room.creatorId) === String(userId) ||
      (room.participants || []).some(p => String(p.userId) === String(userId) && (p.role === 'owner' || p.role === 'moderator'));
    if (!isOwnerOrMod) {
      const error = new Error('Chủ phòng hiện đang khóa tính năng chat trong phòng học.');
      error.status = 403;
      error.code = 'CHAT_DISABLED';
      throw error;
    }
  }

  const msgsColl = db.collection(COLLECTION_STUDY_ROOM_MESSAGES);
  const newMsg = {
    roomId: room.roomId,
    senderId: String(userId),
    senderName: participant.name || senderName,
    senderAvatar: participant.avatar || senderAvatar,
    content: cleanContent,
    createdAt: new Date()
  };

  const insertRes = await msgsColl.insertOne(newMsg);

  return {
    success: true,
    message: 'Đã gửi tin nhắn thành công.',
    data: {
      id: insertRes.insertedId,
      ...newMsg
    }
  };
}

/**
 * 23. Hàm lấy danh sách tin nhắn phòng học theo phiên (Session Chat History)
 * 
 * QUY TẮC BẢO MẬT PHIÊN CHAT:
 * - Chỉ hiển thị những tin nhắn được gửi KỂ TỪ LÚC NGƯỜI ĐÓ VÀO PHÒNG (`joinedAt`).
 * - Các tin nhắn trước đó (khi người này chưa vào phòng) sẽ HOÀN TOÀN KHÔNG HIỂN THỊ.
 * - Những người đã ở trong phòng từ trước vẫn giữ nguyên lịch sử hội thoại của họ cho đến khi rời phòng.
 * 
 * @param {string} roomId
 * @param {string} userId - ID của người đang yêu cầu đọc tin nhắn
 */
export async function getRoomSessionMessages(roomId, userId) {
  if (!roomId || !userId) {
    return [];
  }

  const db = await getMongoDb();
  const roomsColl = db.collection(COLLECTION_STUDY_ROOMS);

  const room = await roomsColl.findOne({
    $or: [{ roomId: roomId.toLowerCase() }, { roomCode: roomId.toUpperCase() }],
    isActive: { $ne: false }
  });

  if (!room) {
    return [];
  }

  // Tìm thông tin tham gia của người này trong phòng để xác định mốc `joinedAt`
  const participant = (room.participants || []).find(p => String(p.userId) === String(userId));
  
  // Mốc thời gian bắt đầu được xem tin nhắn:
  // Nếu người dùng đang có mặt trong participants -> lấy đúng mốc joinedAt của họ
  // Nếu là chủ phòng nhưng chưa có record trong participants -> lấy createdAt của phòng
  // Nếu người lạ chưa từng vào phòng -> không trả về tin nhắn nào
  let userJoinedAt = null;
  if (participant && participant.joinedAt) {
    userJoinedAt = new Date(participant.joinedAt);
  } else if (String(room.creatorId) === String(userId)) {
    userJoinedAt = new Date(room.createdAt);
  } else {
    return []; // Chưa tham gia phòng thì không xem được tin nhắn
  }

  const msgsColl = db.collection(COLLECTION_STUDY_ROOM_MESSAGES);

  // CHỈ LẤY TIN NHẮN TỪ MỐC JOINED_AT TRỞ VỀ SAU
  const messages = await msgsColl
    .find({
      roomId: room.roomId,
      createdAt: { $gte: userJoinedAt }
    })
    .sort({ createdAt: 1 })
    .toArray();

  return messages.map(msg => ({
    id: msg._id,
    roomId: msg.roomId,
    senderId: msg.senderId,
    senderName: msg.senderName,
    senderAvatar: msg.senderAvatar,
    content: msg.content,
    createdAt: msg.createdAt
  }));
}

/**
 * 24. Hàm dọn dẹp các phòng học đã không còn ai quá 1 tiếng đồng hồ (Auto Cleanup Expired Rooms)
 * 
 * QUY TẮC:
 * - Nếu phòng không có người dùng nào (kể cả chủ phòng cũng không có trong đó, currentUsers <= 0)
 * - Và thời gian trống kéo dài quá 1 tiếng đồng hồ (`emptySince <= now - 1h`)
 * - Thì xóa vĩnh viễn phòng học đó khỏi CSDL, đồng thời dọn dẹp các tin nhắn chat liên quan.
 * 
 * @param {number} [maxIdleMs=ROOM_IDLE_TIMEOUT_MS] - Mặc định 1 tiếng = 3.600.000 ms
 */
export async function cleanupExpiredEmptyRooms(maxIdleMs = ROOM_IDLE_TIMEOUT_MS) {
  const db = await getMongoDb();
  const roomsColl = db.collection(COLLECTION_STUDY_ROOMS);
  const msgsColl = db.collection(COLLECTION_STUDY_ROOM_MESSAGES);

  const expirationThreshold = new Date(Date.now() - maxIdleMs);

  // Tìm các phòng trống quá 1 tiếng:
  // 1) emptySince có giá trị và nhỏ hơn ngưỡng hết hạn (quá 1 tiếng)
  // 2) hoặc currentUsers <= 0 và updatedAt / createdAt cũ hơn 1 tiếng
  const query = {
    $or: [
      {
        emptySince: { $ne: null, $lte: expirationThreshold }
      },
      {
        currentUsers: { $lte: 0 },
        updatedAt: { $lte: expirationThreshold }
      }
    ]
  };

  const expiredRooms = await roomsColl.find(query, { projection: { roomId: 1 } }).toArray();

  if (!expiredRooms || expiredRooms.length === 0) {
    return { deletedCount: 0, roomIds: [] };
  }

  const expiredIds = expiredRooms.map(r => r._id);
  const expiredRoomCodes = expiredRooms.map(r => r.roomId);

  // Xóa các phòng hết hạn
  const deleteResult = await roomsColl.deleteMany({ _id: { $in: expiredIds } });

  // Xóa tin nhắn chat của các phòng đã xóa
  await msgsColl.deleteMany({ roomId: { $in: expiredRoomCodes } }).catch(() => {});

  return {
    deletedCount: deleteResult.deletedCount || 0,
    roomIds: expiredRoomCodes
  };
}

/**
 * 25. Hàm truy xuất danh sách avatar và thông tin người dùng đang có mặt trong phòng học ảo
 * Trả về:
 * - userId: ID tài khoản
 * - name: Tên gốc của người dùng
 * - displayName: Tên hiển thị (Tự động thêm "(Bạn)" nếu avatar này là của đúng tài khoản người dùng đang dùng)
 * - isSelf: Boolean xác định có phải tài khoản của chính mình không
 * - avatar: URL ảnh đại diện người dùng
 * - initials: Ký tự viết tắt đại diện tên (nếu chưa có avatar)
 * - role: Vai trò ('owner' | 'moderator' | 'member')
 * - roleLabel: Chức danh hiển thị tiếng Việt ('Chủ phòng' | 'Moderator' | 'Thành viên')
 * - position: { x, y } Tọa độ vị trí trên canvas để kéo thả
 * - joinedAt: Thời gian vào phòng
 * 
 * @param {string} roomId
 * @param {string} [currentUserId] - ID người dùng hiện tại đang gửi request
 */
export async function getRoomParticipants(roomId, currentUserId = null) {
  if (!roomId) {
    const error = new Error('Thiếu roomId để lấy danh sách thành viên.');
    error.status = 400;
    throw error;
  }

  const db = await getMongoDb();
  const roomsColl = db.collection(COLLECTION_STUDY_ROOMS);

  const room = await roomsColl.findOne({
    $or: [{ roomId: roomId.toLowerCase() }, { roomCode: roomId.toUpperCase() }],
    isActive: { $ne: false }
  });

  if (!room) {
    const error = new Error('Không tìm thấy phòng học ảo.');
    error.status = 404;
    throw error;
  }

  const rawParticipants = Array.isArray(room.participants) ? room.participants : [];

  // Tự động đối chiếu avatar người dùng từ CSDL users (Cloudinary URL) nếu chưa có sẵn trong participant
  const userIdsNeedLookup = rawParticipants
    .filter(p => !p.avatar && p.userId)
    .map(p => p.userId);

  const userAvatarMap = {};
  if (userIdsNeedLookup.length > 0) {
    try {
      const { ObjectId } = await import('mongodb');
      const objectIds = userIdsNeedLookup
        .filter(id => ObjectId.isValid(id))
        .map(id => new ObjectId(id));
      const usersColl = db.collection('users');
      const userDocs = await usersColl.find({
        $or: [
          { _id: { $in: objectIds } },
          { id: { $in: userIdsNeedLookup } }
        ]
      }).toArray();
      for (const u of userDocs) {
        const key = u._id ? u._id.toString() : u.id;
        userAvatarMap[key] = u.avatar_url || u.avatar || '';
      }
    } catch {
      // Bỏ qua lỗi tra cứu
    }
  }

  const participants = rawParticipants.map(p => {
    const isSelf = Boolean(currentUserId && String(p.userId) === String(currentUserId));
    const role = p.role || (String(room.creatorId) === String(p.userId) ? 'owner' : 'member');
    const roleLabel = p.roleLabel || getRoleLabel(role);
    const rawName = p.name || 'Thành viên';
    const displayName = isSelf ? `${rawName} (Bạn)` : rawName;
    const avatar = p.avatar || userAvatarMap[String(p.userId)] || '';
    const initials = p.initials || getInitials(rawName);

    return {
      userId: p.userId,
      name: rawName,
      displayName,
      isSelf,
      avatar,
      initials,
      role,
      roleLabel,
      position: p.position || { x: 300, y: 250 },
      joinedAt: p.joinedAt || room.createdAt
    };
  });

  return {
    roomId: room.roomId,
    roomName: room.name,
    total: participants.length,
    currentUserId: currentUserId ? String(currentUserId) : null,
    participants
  };
}

/**
 * 26. Hàm cập nhật tọa độ kéo thả avatar trên canvas phòng học ảo
 * Khi người dùng kéo thả avatar của mình trên canvas, gọi hàm này để lưu vị trí mới { x, y }
 * 
 * @param {string} roomId
 * @param {string} userId - ID người dùng kéo avatar
 * @param {object} position - { x, y }
 */
export async function updateParticipantCanvasPosition(roomId, userId, position = {}) {
  if (!roomId || !userId) {
    const error = new Error('Thiếu roomId hoặc userId để cập nhật vị trí canvas.');
    error.status = 400;
    throw error;
  }

  const x = Number(position.x);
  const y = Number(position.y);
  if (isNaN(x) || isNaN(y)) {
    const error = new Error('Tọa độ canvas (x, y) phải là số hợp lệ.');
    error.status = 400;
    throw error;
  }

  const db = await getMongoDb();
  const roomsColl = db.collection(COLLECTION_STUDY_ROOMS);

  const room = await roomsColl.findOne({
    $or: [{ roomId: roomId.toLowerCase() }, { roomCode: roomId.toUpperCase() }],
    isActive: { $ne: false }
  });

  if (!room) {
    const error = new Error('Không tìm thấy phòng học ảo.');
    error.status = 404;
    throw error;
  }

  const updateResult = await roomsColl.updateOne(
    { _id: room._id, 'participants.userId': String(userId) },
    {
      $set: {
        'participants.$.position': { x, y },
        updatedAt: new Date()
      }
    }
  );

  return {
    success: true,
    message: 'Đã cập nhật vị trí avatar trên canvas thành công.',
    data: {
      roomId: room.roomId,
      userId: String(userId),
      position: { x, y },
      matchedCount: updateResult.matchedCount,
      modifiedCount: updateResult.modifiedCount
    }
  };
}

