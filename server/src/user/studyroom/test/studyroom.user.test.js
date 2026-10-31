import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { ObjectId } from 'mongodb';
import {
  createStudyRoom,
  getRandomAvailablePublicRoom,
  getStudyRoomCards,
  searchAndJoinRoom,
  generateRoomCode,
  generateRoomLink,
  maskRoomId,
  formatStudyRoomDisplayInfo,
  searchStudyRoomsByNameAndTopic,
  filterStudyRoomsByTagOrStatus,
  getTopPopularTagsAndAllRooms,
  filterRoomsByUserTags,
  getStudyRoomDisplayList,
  calculateNonOverlappingCanvasPosition,
  generateLiveKitToken,
  getPermissionMatrix,
  getMemberEffectivePermissions,
  updateRoomPermissions,
  changeRoomTheme,
  inviteUserToRoom,
  requestJoinApproval,
  handleJoinApprovalRequest,
  leaveStudyRoom,
  sendRoomMessage,
  getRoomSessionMessages,
  cleanupExpiredEmptyRooms,
  getRoomParticipants,
  updateParticipantCanvasPosition,
  createStudyRoomRouter
} from '../studyroom.user.js';
import { getMongoDb, closeMongoDb } from '../../db.js';
import { getNotificationDeliveryPolicy } from '../../notification/notification.user.js';

function inviteNotificationFixture() {
  const copy = value => value instanceof Date ? new Date(value) : value instanceof ObjectId ? new ObjectId(String(value))
    : value instanceof Map ? new Map([...value].map(([k,v]) => [k,copy(v)])) : Array.isArray(value) ? value.map(copy)
      : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k,v]) => [k,copy(v)])) : value;
  const match = (row,query) => Object.entries(query).every(([key,value]) => {
    if (key === '$or') return value.some(item => match(row,item));
    if (value && typeof value === 'object') {
      return Object.entries(value).every(([op,wanted]) => {
        if (op === '$ne') return row[key] !== wanted;
        throw new Error(`Unsupported query ${op}`);
      });
    }
    return row[key] === value;
  });
  let tables = new Map(),queue = Promise.resolve();
  const db = { get tables() { return tables; },fail:false,client:{ startSession() { return {
    async withTransaction(work) {
      let release;const previous = queue;queue = new Promise(resolve => { release = resolve; });await previous;
      const snapshot = copy(tables);
      try { return await work(); } catch (error) { tables = snapshot;throw error; } finally { release(); }
    },async endSession() {},
  }; } },collection(name) {
    if (!tables.has(name)) tables.set(name,[]);
    const rows = () => tables.get(name);
    return {
      async findOne(query) { return copy(rows().find(row => match(row,query)) ?? null); },
      async updateOne(query,update,options = {}) {
        if (db.fail && name === 'notifications') throw new Error('Inbox offline');
        let row = rows().find(row => match(row,query));
        if (!row && options.upsert) { row = { ...copy(query),...copy(update.$setOnInsert || {}) };rows().push(row); }
        if (!row) return { matchedCount:0 };
        Object.assign(row,copy(update.$set || {}));return { matchedCount:1 };
      },
    };
  } };
  tables.set('users',[
    { _id:'owner',id:'owner',full_name:'Room Owner' },
    { _id:'recipient',id:'recipient',email:'member@example.test',email_verified:true,phone:'0901234567',status:'active' },
  ]);
  tables.set('study_rooms',[{ _id:'room',roomId:'abcd12',roomCode:'ABCD12',name:'Room Test',creatorId:'owner',isActive:true,participants:[],roomLink:'/room/abcd12' }]);
  return { db,invite: (target = 'member@example.test',actor = 'owner') => inviteUserToRoom('abcd12',target,actor,'Forged Name',{ db }) };
}

test('Notification integration: Studyroom resolves verified recipient, ignores spoofed name and deduplicates invitations', async () => {
  const f = inviteNotificationFixture();
  await f.invite();await f.invite('MEMBER@example.test');
  await Promise.all([f.invite(),f.invite()]);
  assert.equal(f.db.tables.get('study_room_invites').length,1);
  const rows = f.db.tables.get('notifications');
  assert.equal(rows.length,1);assert.equal(rows[0].user_id,'recipient');
  assert.equal(rows[0].category,'community');assert.equal(rows[0].kind,'invitation');
  assert.equal(rows[0].message.includes('Room Owner'),true);
  assert.equal(rows[0].message.includes('Forged Name'),false);
});

test('Notification integration: Studyroom blocks unauthorized actors and keeps invite/inbox atomic on failures', async () => {
  const f = inviteNotificationFixture();
  await assert.rejects(f.invite('member@example.test','stranger'),error => error.status === 403);
  assert.equal(f.db.tables.get('study_room_invites')?.length || 0,0);
  f.db.fail = true;await assert.rejects(f.invite(),/Inbox offline/);
  assert.equal(f.db.tables.get('study_room_invites')?.length || 0,0);
  f.db.fail = false;await f.invite();assert.equal(f.db.tables.get('notifications').length,1);
});

test('Notification integration: Studyroom does not leak inbox details to unresolved or unverified targets', async () => {
  const f = inviteNotificationFixture();
  f.db.tables.get('users')[1].email_verified = false;
  await f.invite();await f.invite('guest@example.test');await f.invite('0901234567');
  assert.equal(f.db.tables.get('notifications')?.length || 0,0);
  assert.equal(f.db.tables.get('study_room_invites').length,3);
  f.db.tables.get('users')[1].phone_verified = true;
  await f.invite('0901234567');
  assert.equal(f.db.tables.get('notifications').length,1);
  assert.equal(f.db.tables.get('notifications')[0].user_id,'recipient');
});

test('Notification integration: Studyroom inbox remains available while DND/community preferences mute active delivery', async () => {
  const f = inviteNotificationFixture();
  f.db.tables.set('notification_preferences',[{ _id:'recipient',community:false,dnd:{ mode:'indefinite' } }]);
  await f.invite();
  assert.equal(f.db.tables.get('notifications').length,1);
  const policy = await getNotificationDeliveryPolicy('recipient','community',{ db:f.db });
  assert.equal(policy.inbox,true);assert.equal(policy.email,false);assert.equal(policy.web,false);
});

test('Study Room Backend Service Test Suite', async (t) => {
  const db = await getMongoDb();
  const roomsColl = db.collection('study_rooms');
  const testRunId = `studyroom_test_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const testRoomIds = new Set();
  const markRoomForTest = async room => {
    testRoomIds.add(room.roomId);
    await roomsColl.updateOne({ _id: room._id }, { $set: { studyroomTestRunId: testRunId } });
  };

  t.after(async () => {
    const roomIds = [...testRoomIds];
    try {
      await roomsColl.deleteMany({ studyroomTestRunId: testRunId });
      if (roomIds.length) {
        await db.collection('study_room_messages').deleteMany({ roomId: { $in: roomIds } });
        await db.collection('study_room_invites').deleteMany({ roomId: { $in: roomIds } });
      }
      await db.collection('users').deleteMany({ studyroomTestRunId: testRunId });
      assert.equal(await roomsColl.countDocuments({ studyroomTestRunId: testRunId }), 0);
      assert.equal(await db.collection('users').countDocuments({ studyroomTestRunId: testRunId }), 0);
      if (roomIds.length) {
        assert.equal(await db.collection('study_room_messages').countDocuments({ roomId: { $in: roomIds } }), 0);
        assert.equal(await db.collection('study_room_invites').countDocuments({ roomId: { $in: roomIds } }), 0);
      }
    } finally {
      await closeMongoDb();
    }
  });

  await t.test('1. Validation tạo phòng học', async () => {
    // Tên phòng dưới 5 ký tự
    await assert.rejects(
      async () => {
        await createStudyRoom('user_123', {
          name: '1234',
          topic: 'Lập trình',
          capacity: 10
        });
      },
      { code: 'INVALID_ROOM_NAME' }
    );

    // Chủ đề dài hơn 20 ký tự
    await assert.rejects(
      async () => {
        await createStudyRoom('user_123', {
          name: 'Phòng học thuật toán nâng cao',
          topic: 'Chủ đề này quá dài vượt hơn 20 ký tự quy định',
          capacity: 10
        });
      },
      { code: 'INVALID_ROOM_TOPIC' }
    );

    // Phòng riêng tư nhưng không có mật khẩu hoặc mật khẩu ngắn
    await assert.rejects(
      async () => {
        await createStudyRoom('user_123', {
          name: 'Phòng học riêng tư bí mật',
          type: 'private',
          password: '12'
        });
      },
      { code: 'INVALID_ROOM_PASSWORD' }
    );
  });

  let createdPublicRoom = null;
  let createdPrivateRoom = null;

  await t.test('2. Tạo thành công phòng học công khai (Public Room)', async () => {
    const payload = {
      name: 'Luyện thi chứng chỉ AWS Cloud',
      type: 'public',
      goal: 'Hoàn thành 3 đề thi thử và ghi chú lỗi',
      topic: 'Cloud Computing',
      tags: ['AWS', 'DevOps', 'Cert'],
      capacity: 5,
      roomTheme: 'https://i.pinimg.com/originals/55/fc/4b/55fc4bee7c31f0850262da53fa1e3180.gif',
      creatorName: 'Anh Dev'
    };

    createdPublicRoom = await createStudyRoom('user_test_1', payload);
    await markRoomForTest(createdPublicRoom);

    assert.ok(createdPublicRoom._id);
    assert.ok(createdPublicRoom.roomCode);
    assert.ok(createdPublicRoom.roomLink);
    assert.equal(createdPublicRoom.name, payload.name);
    assert.equal(createdPublicRoom.type, 'public');
    assert.equal(createdPublicRoom.capacity, 5);
    assert.equal(createdPublicRoom.hasPassword, false);
    assert.equal(createdPublicRoom.password, undefined); // Không leak password

  });

  await t.test('3. Tạo thành công phòng học riêng tư (Private Room có Password)', async () => {
    const payload = {
      name: 'Nhóm đồ án bí mật K21',
      type: 'private',
      goal: 'Review lại code backend sprint 2',
      topic: 'Đồ án nhóm',
      tags: ['NodeJS', 'Angular'],
      capacity: 4,
      roomTheme: 'https://motionbgs.com/media/9514/pragmata-horizon.960x540.mp4',
      password: 'mypassword123',
      creatorName: 'Leader'
    };

    createdPrivateRoom = await createStudyRoom('user_test_2', payload);
    await markRoomForTest(createdPrivateRoom);

    assert.ok(createdPrivateRoom._id);
    assert.equal(createdPrivateRoom.type, 'private');
    assert.equal(createdPrivateRoom.hasPassword, true);
    assert.equal(createdPrivateRoom.password, undefined); // Không leak password ra client

  });

  await t.test('4. Tìm phòng công khai còn chỗ để spawn ngẫu nhiên (Random Spawn)', async () => {
    const spawnRoom = await getRandomAvailablePublicRoom();
    assert.ok(spawnRoom);
    assert.equal(spawnRoom.type, 'public');
    assert.ok(spawnRoom.currentUsers < spawnRoom.capacity);
  });

  await t.test('5. Load danh sách thẻ phòng học ảo (Lobby Cards)', async () => {
    const result = await getStudyRoomCards({ search: 'AWS', tab: 'trending' });
    assert.ok(Array.isArray(result.rooms));
    assert.ok(result.rooms.length >= 1);
    const found = result.rooms.find(r => r.roomId === createdPublicRoom.roomId);
    assert.ok(found);
    assert.equal(found.type, 'public');
    assert.equal(found.password, undefined);
  });

  await t.test('6. Tìm kiếm phòng bằng mã phòng hoặc link và xác thực mật khẩu', async () => {
    // 6a. Vào phòng công khai bằng mã phòng
    const publicJoinByCode = await searchAndJoinRoom(createdPublicRoom.roomCode, '', 'user_test_1');
    assert.equal(publicJoinByCode.success, true);
    assert.equal(publicJoinByCode.room.roomId, createdPublicRoom.roomId);

    // 6b. Vào phòng công khai bằng link phòng
    const publicJoinByLink = await searchAndJoinRoom(createdPublicRoom.roomLink, '', 'user_test_1');
    assert.equal(publicJoinByLink.success, true);
    assert.equal(publicJoinByLink.room.roomId, createdPublicRoom.roomId);

    const invitedUserId = `studyroom_invited_${testRunId}`;
    await db.collection('users').insertOne({
      id: invitedUserId,
      email: `invite_${testRunId}@example.test`,
      studyroomTestRunId: testRunId
    });
    const uninvitedUserId = `uninvited_${testRunId}`;
    await db.collection('users').insertOne({
      id: uninvitedUserId,
      email: `other_${testRunId}@example.test`,
      studyroomTestRunId: testRunId
    });
    await inviteUserToRoom(createdPrivateRoom.roomId, `invite_${testRunId}@example.test`, 'user_test_2');

    await assert.rejects(
      () => searchAndJoinRoom(createdPrivateRoom.roomCode, 'mypassword123', uninvitedUserId),
      { code: 'INVITATION_REQUIRED' }
    );

    // Lời mời hợp lệ vẫn phải kèm mật khẩu phòng.
    await assert.rejects(
      async () => {
        await searchAndJoinRoom(createdPrivateRoom.roomCode, '', invitedUserId);
      },
      { code: 'PASSWORD_REQUIRED' }
    );

    // 6d. Vào phòng riêng tư nhập sai mật khẩu -> Lỗi 403 INVALID_PASSWORD
    await assert.rejects(
      async () => {
        await searchAndJoinRoom(createdPrivateRoom.roomCode, 'sai_mat_khau', invitedUserId);
      },
      { code: 'INVALID_PASSWORD' }
    );

    // 6e. Vào phòng riêng tư nhập đúng mật khẩu -> Thành công
    const privateJoinSuccess = await searchAndJoinRoom(createdPrivateRoom.roomCode, 'mypassword123', invitedUserId);
    assert.equal(privateJoinSuccess.success, true);
    assert.equal(privateJoinSuccess.room.roomId, createdPrivateRoom.roomId);
    assert.equal(privateJoinSuccess.room.theme, createdPrivateRoom.theme);
    const privateToken = await generateLiveKitToken({ roomId: createdPrivateRoom.roomId, userId: invitedUserId });
    assert.equal(privateToken.role, 'member');
    await assert.rejects(
      () => generateLiveKitToken({ roomId: createdPrivateRoom.roomId, userId: uninvitedUserId }),
      { code: 'INVITATION_REQUIRED' }
    );
  });

  await t.test('7. Tìm kiếm phòng theo chủ đề và tên phòng', async () => {
    // Tìm theo tên
    const byName = await searchStudyRoomsByNameAndTopic({ name: 'AWS Cloud' });
    assert.ok(byName.length >= 1);
    assert.ok(byName.some(r => r.roomName.includes('AWS')));

    // Tìm theo chủ đề
    const byTopic = await searchStudyRoomsByNameAndTopic({ topic: 'Đồ án nhóm' });
    assert.ok(byTopic.length >= 1);
    assert.ok(byTopic.some(r => r.topic.includes('Đồ án')));
  });

  await t.test('8. Lọc phòng theo tag kỹ năng và theo trạng thái (new, available, active)', async () => {
    // Lọc theo tag kỹ năng
    const byTag = await filterStudyRoomsByTagOrStatus({ tag: 'DevOps' });
    assert.ok(byTag.length >= 1);
    assert.ok(byTag.some(r => r.tags.includes('DevOps')));

    // Lọc theo trạng thái còn chỗ (available)
    const byAvailable = await filterStudyRoomsByTagOrStatus({ status: 'available' });
    assert.ok(byAvailable.length >= 1);
    assert.ok(byAvailable.every(r => r.currentUsers < r.capacity));

    // Lọc theo trạng thái mới mở (new)
    const byNew = await filterStudyRoomsByTagOrStatus({ status: 'new' });
    assert.ok(byNew.length >= 1);
  });

  await t.test('9. Lọc 6 tag phổ biến nhất và nút "Tất cả" hiển thị mọi phòng', async () => {
    const res = await getTopPopularTagsAndAllRooms({ fetchAllRooms: true });
    assert.ok(Array.isArray(res.topTags));
    assert.ok(res.topTags.length <= 6);
    assert.ok(Array.isArray(res.allRooms));
    // Đảm bảo chứa cả phòng công khai và riêng tư
    const hasPublic = res.allRooms.some(r => r.statusType === 'công khai');
    const hasPrivate = res.allRooms.some(r => r.statusType === 'riêng tư');
    assert.ok(hasPublic);
    assert.ok(hasPrivate);
  });

  await t.test('10. Lọc phòng học có tag do người dùng chọn', async () => {
    const userSelectedTags = ['AWS', 'NodeJS'];
    const matchedRooms = await filterRoomsByUserTags(userSelectedTags);
    assert.ok(matchedRooms.length >= 2);
  });

  await t.test('11. Truy xuất thông tin chuẩn hóa & Quy tắc che ID phòng riêng tư', async () => {
    const displayList = await getStudyRoomDisplayList();
    assert.ok(displayList.length >= 2);

    const publicItem = displayList.find(r => r.statusType === 'công khai');
    const privateItem = displayList.find(r => r.statusType === 'riêng tư');

    assert.ok(publicItem);
    assert.ok(privateItem);

    // Phòng công khai: ID đầy đủ, không có dấu *
    assert.ok(!publicItem.roomId.includes('*'));
    assert.equal(publicItem.statusType, 'công khai');
    assert.ok(publicItem.roomName);
    assert.ok(publicItem.capacity);

    // Phòng riêng tư: 3 số/ký tự đầu giữ nguyên, còn lại hiển thị *
    assert.ok(privateItem.roomId.includes('*'));
    assert.equal(privateItem.statusType, 'riêng tư');
    assert.equal(privateItem.rawId, undefined); // Không bao giờ gửi rawId thật
    assert.equal(privateItem.roomId.slice(0, 3), createdPrivateRoom.roomId.slice(0, 3));
    assert.equal(privateItem.roomId.length, createdPrivateRoom.roomId.length);
  });

  await t.test('12. Tính toán tọa độ canvas không chèn lên nhau', () => {
    const existing = [
      { position: { x: 300, y: 200 } },
      { position: { x: 450, y: 200 } }
    ];
    const newPos = calculateNonOverlappingCanvasPosition(existing, { minDistance: 100 });
    assert.ok(typeof newPos.x === 'number' && typeof newPos.y === 'number');
    // Khoảng cách tới điểm đầu tiên phải >= 100px
    const dist1 = Math.sqrt((newPos.x - 300) ** 2 + (newPos.y - 200) ** 2);
    assert.ok(dist1 >= 90);
  });

  await t.test('13. Sinh LiveKit token an toàn từ backend', async () => {
    const tokenResult = await generateLiveKitToken({
      roomId: createdPublicRoom.roomId,
      userId: 'user_livekit_test',
      userName: 'Văn Test',
      role: 'moderator'
    });
    assert.ok(tokenResult.token);
    assert.ok(typeof tokenResult.token === 'string');
    assert.equal(tokenResult.roomId, createdPublicRoom.roomId);
    assert.ok(tokenResult.position);
    assert.ok(tokenResult.livekitUrl);
    assert.equal(tokenResult.role, 'member');
    const memberClaims = JSON.parse(Buffer.from(tokenResult.token.split('.')[1], 'base64url').toString());
    assert.deepEqual(memberClaims.video.canPublishSources.sort(), ['camera', 'microphone']);

    await roomsColl.updateOne({ _id: createdPublicRoom._id }, {
      $set: { 'permissions.voiceEnabled': false, 'permissions.cameraEnabled': true, 'permissions.participantShareScreen': false }
    });
    const cameraOnlyToken = await generateLiveKitToken({ roomId: createdPublicRoom.roomId, userId: 'user_livekit_test' });
    const cameraOnlyClaims = JSON.parse(Buffer.from(cameraOnlyToken.token.split('.')[1], 'base64url').toString());
    assert.deepEqual(cameraOnlyClaims.video.canPublishSources, ['camera']);
    await roomsColl.updateOne({ _id: createdPublicRoom._id }, {
      $set: { 'permissions.voiceEnabled': true, 'permissions.cameraEnabled': true }
    });

    const ownerToken = await generateLiveKitToken({ roomId: createdPublicRoom.roomId, userId: 'user_test_1' });
    const ownerClaims = JSON.parse(Buffer.from(ownerToken.token.split('.')[1], 'base64url').toString());
    assert.deepEqual(ownerClaims.video.canPublishSources.sort(), ['camera', 'microphone', 'screen_share', 'screen_share_audio']);

    const firstRoomState = await roomsColl.findOne({ roomId: createdPublicRoom.roomId });
    const firstParticipant = firstRoomState.participants.find(p => p.userId === 'user_livekit_test');
    await Promise.all([
      generateLiveKitToken({ roomId: createdPublicRoom.roomId, userId: 'user_livekit_test', userName: 'Văn Test' }),
      generateLiveKitToken({ roomId: createdPublicRoom.roomId, userId: 'user_livekit_test', userName: 'Văn Test' })
    ]);
    const reconnectedRoom = await roomsColl.findOne({ roomId: createdPublicRoom.roomId });
    assert.equal(reconnectedRoom.currentUsers, firstRoomState.currentUsers);
    assert.equal(reconnectedRoom.participants.filter(p => p.userId === 'user_livekit_test').length, 1);
    assert.equal(reconnectedRoom.participants.find(p => p.userId === 'user_livekit_test').joinedAt.getTime(), firstParticipant.joinedAt.getTime());
    await leaveStudyRoom(createdPublicRoom.roomId, 'user_livekit_test');
  });

  await t.test('13a. Route token bắt buộc xác thực và bỏ qua userId/role từ body', async () => {
    const routeRoom = await createStudyRoom(`owner_${testRunId}`, { name: 'Phòng test route token', type: 'public' });
    await markRoomForTest(routeRoom);

    const app = express();
    app.use(express.json());
    app.use('/api/study-room', createStudyRoomRouter(express, (req, res, next) => {
      const authenticatedUserId = req.get('x-test-user-id');
      if (!authenticatedUserId) return res.status(401).json({ success: false });
      req.userId = authenticatedUserId;
      next();
    }));
    const server = app.listen(0);
    await new Promise(resolve => server.once('listening', resolve));

    try {
      const baseUrl = `http://127.0.0.1:${server.address().port}/api/study-room/token`;
      const unauthenticated = await fetch(baseUrl, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ roomId: routeRoom.roomId })
      });
      assert.equal(unauthenticated.status, 401);
      const unauthenticatedJoin = await fetch(baseUrl.replace('/token', '/join'), {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ codeOrLink: routeRoom.roomCode })
      });
      assert.equal(unauthenticatedJoin.status, 401);

      const response = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-test-user-id': `member_${testRunId}` },
        body: JSON.stringify({ roomId: routeRoom.roomId, userId: routeRoom.creatorId, role: 'owner' })
      });
      assert.equal(response.status, 200);
      const result = await response.json();
      assert.equal(result.data.role, 'member');
      const roomAfterToken = await roomsColl.findOne({ roomId: routeRoom.roomId });
      assert.ok(roomAfterToken.participants.some(p => p.userId === `member_${testRunId}`));
      assert.equal(roomAfterToken.participants.filter(p => p.userId === routeRoom.creatorId).length, 1);

      const messageResponse = await fetch(`${baseUrl.replace('/token', `/${routeRoom.roomId}/messages`)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-test-user-id': `member_${testRunId}` },
        body: JSON.stringify({ userId: routeRoom.creatorId, senderName: 'Giả danh', content: 'Test authenticated sender' })
      });
      assert.equal(messageResponse.status, 201);
      const messageResult = await messageResponse.json();
      assert.equal(messageResult.data.senderId, `member_${testRunId}`);
      assert.equal(messageResult.data.senderName, 'Học viên');
    } finally {
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  });

  await t.test('13b. Cấp token đồng thời không vượt sức chứa phòng', async () => {
    const limitedRoom = await createStudyRoom(`limited_owner_${testRunId}`, {
      name: 'Phòng test giới hạn chỗ', type: 'public', capacity: 2
    });
    await markRoomForTest(limitedRoom);
    const results = await Promise.allSettled([
      generateLiveKitToken({ roomId: limitedRoom.roomId, userId: `limited_a_${testRunId}` }),
      generateLiveKitToken({ roomId: limitedRoom.roomId, userId: `limited_b_${testRunId}` })
    ]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    const rejected = results.find(result => result.status === 'rejected');
    assert.equal(rejected.reason.code, 'ROOM_FULL');
    const roomAfterRace = await roomsColl.findOne({ roomId: limitedRoom.roomId });
    assert.equal(roomAfterRace.currentUsers, 2);
    assert.equal(roomAfterRace.participants.length, 2);
  });

  await t.test('14. Tra cứu Permission Matrix & Quyền thực tế thành viên', async () => {
    const matrix = getPermissionMatrix();
    assert.ok(Array.isArray(matrix));
    assert.ok(matrix.some(f => f.feature === 'voice'));
    assert.ok(matrix.some(f => f.feature === 'camera'));
    assert.ok(matrix.some(f => f.feature === 'shareScreen'));

    // Tra cứu quyền cho thành viên thường
    const perm = await getMemberEffectivePermissions(createdPublicRoom.roomId, 'user_member_1');
    assert.equal(perm.role, 'member');
    assert.ok(perm.effectivePermissions);
    assert.equal(typeof perm.effectivePermissions.canVoice, 'boolean');
  });

  await t.test('15. Cấp quyền toàn phòng (Chỉ áp dụng với Chủ phòng)', async () => {
    // Thành viên thường cố đổi quyền -> Bị từ chối 403
    await assert.rejects(
      async () => {
        await updateRoomPermissions(createdPublicRoom.roomId, 'stranger_user', { voiceEnabled: false });
      },
      { code: 'OWNER_PERMISSION_REQUIRED' }
    );

    // Chủ phòng đổi quyền khóa bảng vẽ và tắt mic
    const updated = await updateRoomPermissions(createdPublicRoom.roomId, 'user_test_1', {
      voiceEnabled: false,
      whiteboardLocked: true
    });
    assert.equal(updated.voiceEnabled, false);
    assert.equal(updated.whiteboardLocked, true);
  });

  await t.test('16. Thay đổi nền phòng (Room Theme)', async () => {
    const themeRes = await changeRoomTheme(createdPublicRoom.roomId, 'user_test_1', 'sky-room');
    assert.equal(themeRes.theme, 'sky-room');
  });

  await t.test('17. Mời người dùng vào phòng & Duyệt yêu cầu vào phòng', async () => {
    // Mời qua Email / SĐT
    const inviteRes = await inviteUserToRoom(createdPublicRoom.roomId, 'friend@thinkup.vn', 'user_test_1', 'Anh Dev');
    assert.equal(inviteRes.success, true);
    assert.ok(inviteRes.inviteLink);
    await assert.rejects(
      () => inviteUserToRoom(createdPublicRoom.roomId, 'blocked@example.test', 'stranger_user'),
      { code: 'INVITE_PERMISSION_REQUIRED' }
    );

    // Gửi yêu cầu xin vào phòng
    const reqRes = await requestJoinApproval(createdPublicRoom.roomId, 'joiner_123', 'Người xin vào');
    assert.equal(reqRes.success, true);

    // Chủ phòng duyệt
    const handleRes = await handleJoinApprovalRequest(createdPublicRoom.roomId, 'user_test_1', 'joiner_123', 'approve');
    assert.equal(handleRes.success, true);
    assert.equal(handleRes.action, 'approve');
  });

  await t.test('18. Xử lý nhiều người dùng cùng vào phòng và rời phòng (Multi-user concurrency & Leave)', async () => {
    // Giả lập 3 người dùng cùng vào phòng qua token
    await generateLiveKitToken({ roomId: createdPublicRoom.roomId, userId: 'user_alice', userName: 'Alice' });
    await generateLiveKitToken({ roomId: createdPublicRoom.roomId, userId: 'user_bob', userName: 'Bob' });
    await generateLiveKitToken({ roomId: createdPublicRoom.roomId, userId: 'user_charlie', userName: 'Charlie' });

    const roomAfterJoin = await roomsColl.findOne({ roomId: createdPublicRoom.roomId });
    assert.equal(roomAfterJoin.currentUsers, 4);
    assert.ok(roomAfterJoin.participants.some(p => p.userId === 'user_alice'));
    assert.ok(roomAfterJoin.participants.some(p => p.userId === 'user_bob'));
    assert.ok(roomAfterJoin.participants.some(p => p.userId === 'user_charlie'));

    // Alice rời phòng
    const leaveRes = await leaveStudyRoom(createdPublicRoom.roomId, 'user_alice');
    assert.equal(leaveRes.success, true);

    const roomAfterLeave = await roomsColl.findOne({ roomId: createdPublicRoom.roomId });
    assert.ok(!roomAfterLeave.participants.some(p => p.userId === 'user_alice'));
    assert.equal(roomAfterLeave.currentUsers, 3);
    assert.equal((await leaveStudyRoom(createdPublicRoom.roomId, 'user_alice')).currentUsers, 3);
    await leaveStudyRoom(createdPublicRoom.roomId, 'user_bob');
    await leaveStudyRoom(createdPublicRoom.roomId, 'user_charlie');
  });

  await t.test('19. Bảo mật phiên Chat: Người mới vào chỉ thấy tin nhắn KỂ TỪ KHI VÀO PHÒNG', async () => {
    // Bước 1: Alice và Bob đang ở trong phòng từ trước
    await generateLiveKitToken({ roomId: createdPublicRoom.roomId, userId: 'user_alice_chat', userName: 'Alice' });
    await generateLiveKitToken({ roomId: createdPublicRoom.roomId, userId: 'user_bob_chat', userName: 'Bob' });

    // Bước 2: Alice gửi 2 tin nhắn trước khi Charlie vào phòng
    await sendRoomMessage(createdPublicRoom.roomId, {
      userId: 'user_alice_chat',
      senderName: 'Alice',
      content: 'Tin nhắn 1: Chào Bob nhé!'
    });
    await sendRoomMessage(createdPublicRoom.roomId, {
      userId: 'user_alice_chat',
      senderName: 'Alice',
      content: 'Tin nhắn 2: Chúng ta ôn tập câu hỏi 1-10 trước.'
    });

    // Đợi 10ms để mốc thời gian chênh lệch rõ ràng
    await new Promise(r => setTimeout(r, 15));

    // Bước 3: Charlie mới vào phòng học sau
    await generateLiveKitToken({ roomId: createdPublicRoom.roomId, userId: 'user_charlie_chat', userName: 'Charlie' });

    // Bước 4: Bob gửi thêm tin nhắn sau khi Charlie đã vào
    await sendRoomMessage(createdPublicRoom.roomId, {
      userId: 'user_bob_chat',
      senderName: 'Bob',
      content: 'Tin nhắn 3: Chào cả phòng, chào Charlie!'
    });

    // Bước 5: Kiểm tra danh sách tin nhắn của Charlie
    // Charlie CHỈ ĐƯỢC THẤY "Tin nhắn 3" (được gửi sau khi Charlie vào), KHÔNG THẤY Tin nhắn 1 & 2!
    const charlieMessages = await getRoomSessionMessages(createdPublicRoom.roomId, 'user_charlie_chat');
    assert.equal(charlieMessages.length, 1);
    assert.equal(charlieMessages[0].content, 'Tin nhắn 3: Chào cả phòng, chào Charlie!');

    // Bước 6: Kiểm tra danh sách tin nhắn của Alice (ở trong phòng từ đầu)
    // Alice VẪN THẤY TOÀN BỘ 3 tin nhắn
    const aliceMessages = await getRoomSessionMessages(createdPublicRoom.roomId, 'user_alice_chat');
    assert.equal(aliceMessages.length, 3);
    assert.equal(aliceMessages[0].content, 'Tin nhắn 1: Chào Bob nhé!');
    assert.equal(aliceMessages[2].content, 'Tin nhắn 3: Chào cả phòng, chào Charlie!');
  });

  await t.test('20. Xóa phòng học trống quá 1 tiếng (không có người dùng, kể cả chủ phòng)', async () => {
    // Tạo một phòng riêng thử nghiệm xóa
    const idleRoom = await createStudyRoom('user_test_idle', {
      name: 'Phòng học tạm thời thử xóa idle',
      type: 'public',
      topic: 'Test Auto Cleanup'
    });
    await markRoomForTest(idleRoom);

    // Giả lập tất cả mọi người rời phòng -> phòng trống
    await leaveStudyRoom(idleRoom.roomId, 'user_test_idle');

    // Giả lập thời gian trống đã trôi qua 65 phút (> 1 tiếng = 60 phút)
    const sixtyFiveMinutesAgo = new Date(Date.now() - 65 * 60 * 1000);
    await roomsColl.updateOne(
      { _id: idleRoom._id },
      { $set: { emptySince: sixtyFiveMinutesAgo, currentUsers: 0, participants: [] } }
    );

    // Chạy dọn dẹp phòng trống quá hạn
    const cleanupResult = await cleanupExpiredEmptyRooms();
    assert.ok(cleanupResult.deletedCount >= 1);
    assert.ok(cleanupResult.roomIds.includes(idleRoom.roomId));

    // Xác nhận phòng không còn tồn tại trong CSDL
    const checkDeleted = await roomsColl.findOne({ _id: idleRoom._id });
    assert.equal(checkDeleted, null);
  });

  await t.test('21. Truy xuất thông tin avatar hiển thị: avatar, tên (Bạn) và chức danh (Chủ phòng, Moderator, Thành viên)', async () => {
    // Tạo phòng với chủ phòng Minh Khoa
    const avatarRoom = await createStudyRoom('user_host_1', {
      name: 'Phòng học trải nghiệm Avatar Canvas',
      type: 'public',
      creatorName: 'Minh Khoa',
      creatorAvatar: 'https://cdn.thinkup.edu.vn/avatars/minh-khoa.png'
    });
    await markRoomForTest(avatarRoom);

    await roomsColl.updateOne({ _id: avatarRoom._id }, {
      $push: { participants: {
        userId: 'user_mod_2', name: 'Hoàng Long', avatar: 'https://cdn.thinkup.edu.vn/avatars/hoang-long.png',
        role: 'moderator', position: { x: 500, y: 300 }, joinedAt: new Date()
      } },
      $inc: { currentUsers: 1 }
    });

    // Thêm một Moderator vào phòng
    await generateLiveKitToken({
      roomId: avatarRoom.roomId,
      userId: 'user_mod_2',
      userName: 'Hoàng Long',
      userAvatar: 'https://cdn.thinkup.edu.vn/avatars/hoang-long.png',
      role: 'member'
    });
    assert.equal((await generateLiveKitToken({ roomId: avatarRoom.roomId, userId: 'user_mod_2', role: 'member' })).role, 'moderator');

    // Thêm một Thành viên thường vào phòng
    await generateLiveKitToken({
      roomId: avatarRoom.roomId,
      userId: 'user_member_3',
      userName: 'Thùy Chi',
      role: 'moderator'
    });
    assert.equal((await roomsColl.findOne({ roomId: avatarRoom.roomId })).participants.find(p => p.userId === 'user_member_3').role, 'member');

    // Case 1: Người dùng hiện tại là 'user_host_1' (Chủ phòng)
    const hostView = await getRoomParticipants(avatarRoom.roomId, 'user_host_1');
    assert.equal(hostView.total, 3);

    const selfHost = hostView.participants.find(p => p.userId === 'user_host_1');
    assert.ok(selfHost);
    assert.equal(selfHost.isSelf, true);
    assert.equal(selfHost.displayName, 'Minh Khoa (Bạn)');
    assert.equal(selfHost.role, 'owner');
    assert.equal(selfHost.roleLabel, 'Chủ phòng');
    assert.equal(selfHost.avatar, 'https://cdn.thinkup.edu.vn/avatars/minh-khoa.png');
    assert.equal(selfHost.initials, 'MK');

    const otherMod = hostView.participants.find(p => p.userId === 'user_mod_2');
    assert.ok(otherMod);
    assert.equal(otherMod.isSelf, false);
    assert.equal(otherMod.displayName, 'Hoàng Long'); // Không có chữ (Bạn)
    assert.equal(otherMod.role, 'moderator');
    assert.equal(otherMod.roleLabel, 'Moderator');
    assert.equal(otherMod.avatar, 'https://cdn.thinkup.edu.vn/avatars/hoang-long.png');

    const otherMember = hostView.participants.find(p => p.userId === 'user_member_3');
    assert.ok(otherMember);
    assert.equal(otherMember.isSelf, false);
    assert.equal(otherMember.displayName, 'Thùy Chi');
    assert.equal(otherMember.role, 'member');
    assert.equal(otherMember.roleLabel, 'Thành viên');
    assert.equal(otherMember.initials, 'TC');

    // Case 2: Khi 'user_mod_2' vào xem phòng
    const modView = await getRoomParticipants(avatarRoom.roomId, 'user_mod_2');
    const selfMod = modView.participants.find(p => p.userId === 'user_mod_2');
    assert.equal(selfMod.isSelf, true);
    assert.equal(selfMod.displayName, 'Hoàng Long (Bạn)');
    assert.equal(selfMod.roleLabel, 'Moderator');
  });

  await t.test('22. Cập nhật tọa độ kéo thả avatar trên canvas', async () => {
    // Di chuyển avatar của Minh Khoa tới tọa độ (450, 600)
    const updateRes = await updateParticipantCanvasPosition('user_test_idle', 'user_host_1', { x: 450, y: 600 }).catch(() => null);
    
    // Test với phòng hợp lệ
    const moveRoom = await createStudyRoom('user_mover', {
      name: 'Phòng học test di chuyển avatar',
      type: 'public'
    });
    await markRoomForTest(moveRoom);

    const moveRes = await updateParticipantCanvasPosition(moveRoom.roomId, 'user_mover', { x: 520, y: 380 });
    assert.equal(moveRes.success, true);
    assert.equal(moveRes.data.position.x, 520);
    assert.equal(moveRes.data.position.y, 380);

    // Kiểm tra dữ liệu được lưu vào DB
    const participantsData = await getRoomParticipants(moveRoom.roomId, 'user_mover');
    const mover = participantsData.participants.find(p => p.userId === 'user_mover');
    assert.equal(mover.position.x, 520);
    assert.equal(mover.position.y, 380);
  });

  await t.test('23. Tự động liên kết và truy xuất Avatar Cloudinary từ CSDL users', async () => {
    const usersColl = db.collection('users');
    const cloudinaryUserId = 'user_cloudinary_test_' + Date.now();
    const cloudinaryAvatarUrl = 'https://res.cloudinary.com/x7v2ofnh/image/upload/v1728000000/avatars/student_khoa.jpg';

    // Tạo giả lập user trong collection users với avatar lưu trên Cloudinary
    await usersColl.insertOne({
      id: cloudinaryUserId,
      full_name: 'Nguyễn Khoa',
      avatar_url: cloudinaryAvatarUrl,
      role: 'student',
      studyroomTestRunId: testRunId
    });

    // 1. Khi tạo phòng mà không truyền creatorAvatar
    const autoRoom = await createStudyRoom(cloudinaryUserId, {
      name: 'Phòng học tự động nhận Cloudinary Avatar',
      type: 'public'
    });
    await markRoomForTest(autoRoom);

    // Xác nhận avatar chủ phòng được tự động gán URL từ Cloudinary
    const participantsList = await getRoomParticipants(autoRoom.roomId, cloudinaryUserId);
    const selfUser = participantsList.participants.find(p => p.userId === cloudinaryUserId);
    assert.ok(selfUser);
    assert.equal(selfUser.avatar, cloudinaryAvatarUrl);
    assert.equal(selfUser.name, 'Nguyễn Khoa');
    assert.equal(selfUser.displayName, 'Nguyễn Khoa (Bạn)');

  });
});
