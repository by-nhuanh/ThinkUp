import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COLLECTION_FLASHCARD_LISTS,
  COLLECTION_USER_ROADMAPS,
  CARD_STATUS_LEARNED,
  CARD_STATUS_REVIEW,
  CARD_STATUS_NOT_LEARNED,
  LEARNING_MODE_ORDER,
  LEARNING_MODE_RANDOM,
  LEARNING_MODE_RESTART,
  ROADMAP_STATUS_REVIEW,
  ROADMAP_STATUS_COMPLETED,
  formatDateDDMMYYYY,
  cycleCardStatus,
  normalizeCardStatusAction,
  shuffleCards,
  calculateFlashcardStats,
  createFlashcardList,
  updateFlashcardList,
  getFlashcardLists,
  getFlashcardsInList,
  getFlashcardListStats,
  updateCardStatus,
  startLearningSession,
  createReviewFlashcardListFromRoadmapNode,
  checkAndUpdateRoadmapFromFlashcard,
} from '../flashcard.user.js';
import { getMongoDb, closeMongoDb } from '../../db.js';

test('Flashcard User Backend Service Test Suite', async (t) => {
  const db = await getMongoDb();
  const flashcardsColl = db.collection(COLLECTION_FLASHCARD_LISTS);
  const roadmapsColl = db.collection(COLLECTION_USER_ROADMAPS);

  const testUserId = 'test_user_flashcard_auto_9999';
  const otherUserId = 'other_user_flashcard_8888';

  // Dọn dẹp dữ liệu test trước khi bắt đầu
  await flashcardsColl.deleteMany({ user_id: { $in: [testUserId, otherUserId] } });
  await roadmapsColl.deleteMany({ user_id: testUserId });

  t.after(async () => {
    // Dọn dẹp dữ liệu test sau khi hoàn tất
    await flashcardsColl.deleteMany({ user_id: { $in: [testUserId, otherUserId] } });
    await roadmapsColl.deleteMany({ user_id: testUserId });
    await closeMongoDb();
  });

  await t.test('1. Kiểm tra các hàm tiện ích: formatDateDDMMYYYY, cycleCardStatus, normalizeCardStatusAction, calculateFlashcardStats', async () => {
    // 1.1 formatDateDDMMYYYY
    const fixedDate = new Date(2026, 9, 17); // Tháng 10 (0-indexed: 9)
    assert.equal(formatDateDDMMYYYY(fixedDate), '17/10/2026');
    assert.equal(formatDateDDMMYYYY(null), '');

    // 1.2 cycleCardStatus - xoay vòng 3 trạng thái khi click
    assert.equal(cycleCardStatus(CARD_STATUS_NOT_LEARNED), CARD_STATUS_REVIEW);
    assert.equal(cycleCardStatus(CARD_STATUS_REVIEW), CARD_STATUS_LEARNED);
    assert.equal(cycleCardStatus(CARD_STATUS_LEARNED), CARD_STATUS_NOT_LEARNED);

    // 1.3 normalizeCardStatusAction
    assert.equal(normalizeCardStatusAction('đã học'), CARD_STATUS_LEARNED);
    assert.equal(normalizeCardStatusAction('learned'), CARD_STATUS_LEARNED);
    assert.equal(normalizeCardStatusAction('chưa nhớ'), CARD_STATUS_REVIEW);
    assert.equal(normalizeCardStatusAction('review'), CARD_STATUS_REVIEW);
    assert.equal(normalizeCardStatusAction('cần ôn tập'), CARD_STATUS_REVIEW);
    assert.equal(normalizeCardStatusAction('cycle', CARD_STATUS_NOT_LEARNED), CARD_STATUS_REVIEW);
    assert.equal(normalizeCardStatusAction('cycle', CARD_STATUS_REVIEW), CARD_STATUS_LEARNED);
    assert.equal(normalizeCardStatusAction('cycle', CARD_STATUS_LEARNED), CARD_STATUS_NOT_LEARNED);

    // Không cập nhật cái nào từ 2 cái trên -> 'chưa học'
    assert.equal(normalizeCardStatusAction('skip'), CARD_STATUS_NOT_LEARNED);
    assert.equal(normalizeCardStatusAction(''), CARD_STATUS_NOT_LEARNED);
    assert.equal(normalizeCardStatusAction(null), CARD_STATUS_NOT_LEARNED);
    assert.equal(normalizeCardStatusAction(undefined), CARD_STATUS_NOT_LEARNED);

    // 1.4 calculateFlashcardStats
    const sampleCards = [
      { status: CARD_STATUS_LEARNED },
      { status: CARD_STATUS_LEARNED },
      { status: CARD_STATUS_REVIEW },
      { status: CARD_STATUS_NOT_LEARNED },
    ];
    const stats = calculateFlashcardStats(sampleCards);
    assert.equal(stats.total_cards, 4);
    assert.equal(stats.learned_cards, 2);
    assert.equal(stats.review_cards, 1);
    assert.equal(stats.not_learned_cards, 1);
    assert.equal(stats.progress_ratio, '2/4');
    assert.equal(stats.progress_percentage, 50);
  });

  await t.test('2. Cấu trúc thẻ: Mặt trước là kiến thức, mặt sau là mô tả, code, chú thích; trạng thái ban đầu là "chưa học"', async () => {
    // Kiểm tra chặn nếu thiếu tiêu đề
    await assert.rejects(
      async () => {
        await createFlashcardList(testUserId, { title: '', cards: [] });
      },
      { status: 400 }
    );

    // Tạo list thành công
    const payload = {
      title: 'JavaScript Asynchronous Mastery',
      description: 'Tổng hợp kiến thức Promise, Async/Await và Event Loop',
      cards: [
        {
          knowledge: 'Promise Lifecycle',
          description: 'Các trạng thái Pending, Fulfilled, Rejected',
          code: 'new Promise((resolve, reject) => resolve(1));',
          note: 'Promise không thể hủy một khi đã khởi tạo',
        },
        {
          knowledge: 'Async / Await',
          description: 'Cú pháp đường mật cho Promise',
          code: 'async function fetchUser() { return await api(); }',
          note: 'Luôn bọc trong khối try-catch',
        },
        {
          knowledge: 'Event Loop & Microtask Queue',
          description: 'Thứ tự ưu tiên xử lý tác vụ bất đồng bộ',
          code: 'queueMicrotask(() => console.log("micro"));',
          note: 'Microtasks chạy trước Macrotasks',
        },
      ],
    };

    const created = await createFlashcardList(testUserId, payload);
    assert.ok(created.id);
    assert.equal(created.title, 'JavaScript Asynchronous Mastery');
    assert.equal(created.total_cards, 3);
    assert.equal(created.learning_progress, '0/3');
    assert.equal(created.created_at, formatDateDDMMYYYY(new Date()));

    // Xác nhận mỗi thẻ có mặt trước và mặt sau rõ ràng
    for (const card of created.cards) {
      assert.equal(card.status, CARD_STATUS_NOT_LEARNED);
      assert.ok(card.front, 'Thẻ phải có thuộc tính front');
      assert.ok(card.front.knowledge, 'Mặt trước phải có kiến thức');
      assert.ok(card.back, 'Thẻ phải có thuộc tính back');
      assert.ok(card.back.description, 'Mặt sau phải có mô tả');
      assert.ok(card.back.code !== undefined, 'Mặt sau phải có code');
      assert.ok(card.back.note !== undefined, 'Mặt sau phải có chú thích');
      assert.ok(card.card_id);
    }
  });

  await t.test('3. Chỉnh sửa list flashcard và kiểm tra bắt buộc thay đổi trạng thái TẤT CẢ các thẻ thành "chưa học"', async () => {
    // 3.1 Tạo list ban đầu
    const created = await createFlashcardList(testUserId, {
      title: 'React Hooks Core',
      description: 'useState và useEffect',
      cards: [
        { knowledge: 'useState', description: 'Quản lý state', code: 'const [s, setS] = useState(0);', note: 'Hooks' },
        { knowledge: 'useEffect', description: 'Side effect', code: 'useEffect(() => {}, []);', note: 'Lifecycle' },
      ],
    });

    const listId = created.id;

    // 3.2 Giả lập người dùng đã học 1 thẻ và đánh dấu cần ôn tập 1 thẻ
    await updateCardStatus(listId, created.cards[0].card_id, testUserId, 'đã học');
    await updateCardStatus(listId, created.cards[1].card_id, testUserId, 'chưa nhớ');

    // Kiểm tra trạng thái đã thay đổi trước khi edit
    const detailBeforeEdit = await getFlashcardsInList(listId, testUserId);
    assert.equal(detailBeforeEdit.cards[0].status, CARD_STATUS_LEARNED);
    assert.equal(detailBeforeEdit.cards[1].status, CARD_STATUS_REVIEW);
    assert.equal(detailBeforeEdit.learning_progress, '1/2');

    // 3.3 Tiến hành chỉnh sửa thông tin list
    const updated = await updateFlashcardList(listId, testUserId, {
      title: 'React Hooks Core (Cập nhật)',
      description: 'Mô tả mới đã chỉnh sửa',
      cards: [
        { ...detailBeforeEdit.cards[0], note: 'Ghi chú cập nhật' },
        { ...detailBeforeEdit.cards[1], note: 'Ghi chú cập nhật' },
        { knowledge: 'useMemo', description: 'Tối ưu hiệu năng', code: 'useMemo(() => compute(), []);', note: 'Cache' },
      ],
    });

    assert.equal(updated.title, 'React Hooks Core (Cập nhật)');
    assert.equal(updated.total_cards, 3);
    assert.equal(updated.learning_progress, '0/3');

    // QUY TẮC BẮT BUỘC: Sau khi chỉnh sửa, tất cả các thẻ đều phải được reset về "chưa học"
    for (const card of updated.cards) {
      assert.equal(
        card.status,
        CARD_STATUS_NOT_LEARNED,
        'Khi chỉnh sửa, thẻ bắt buộc phải chuyển trạng thái về "chưa học"'
      );
    }
  });

  await t.test('4. Truy xuất danh sách list flashcard: tiêu đề, mô tả, số thẻ, DD/MM/YYYY, tiến độ x/x', async () => {
    const lists = await getFlashcardLists(testUserId);
    assert.ok(Array.isArray(lists));
    assert.ok(lists.length >= 2);

    const first = lists[0];
    assert.ok(first.title);
    assert.ok(typeof first.total_cards === 'number');
    assert.match(first.created_at, /^\d{2}\/\d{2}\/\d{4}$/, 'Thời gian tạo phải đúng định dạng DD/MM/YYYY');
    assert.match(first.learning_progress, /^\d+\/\d+$/, 'Tiến độ đang học phải có định dạng x/x');
  });

  await t.test('5. Điều chỉnh trạng thái thẻ linh hoạt bằng cách click (cycle / toggle qua 3 trạng thái)', async () => {
    const created = await createFlashcardList(testUserId, {
      title: 'Testing Card Click Cycle',
      cards: [{ knowledge: 'Card Toggle', description: '', code: '', note: '' }],
    });

    const listId = created.id;
    const cardId = created.cards[0].card_id;

    // Ban đầu: 'chưa học'
    // Click lần 1 -> 'ôn tập'
    const step1 = await updateCardStatus(listId, cardId, testUserId, 'cycle');
    assert.equal(step1.new_status, CARD_STATUS_REVIEW);

    // Click lần 2 -> 'Đã học'
    const step2 = await updateCardStatus(listId, cardId, testUserId, 'cycle');
    assert.equal(step2.new_status, CARD_STATUS_LEARNED);

    // Click lần 3 -> 'chưa học'
    const step3 = await updateCardStatus(listId, cardId, testUserId, 'cycle');
    assert.equal(step3.new_status, CARD_STATUS_NOT_LEARNED);
  });

  await t.test('6. 3 Chế độ học (order, random, restart) và lọc thẻ áp dụng (chỉ thẻ cần ôn tập & chưa học):', async (sub) => {
    // Tạo 1 list 6 thẻ
    const sampleCards = [
      { knowledge: 'Card 1', description: 'Desc 1', code: '', note: '' },
      { knowledge: 'Card 2', description: 'Desc 2', code: '', note: '' },
      { knowledge: 'Card 3', description: 'Desc 3', code: '', note: '' },
      { knowledge: 'Card 4', description: 'Desc 4', code: '', note: '' },
      { knowledge: 'Card 5', description: 'Desc 5', code: '', note: '' },
      { knowledge: 'Card 6', description: 'Desc 6', code: '', note: '' },
    ];

    const list = await createFlashcardList(testUserId, {
      title: 'Algorithm Flashcards',
      cards: sampleCards,
    });
    const listId = list.id;

    // Giả lập:
    // Card 1, Card 2: 'Đã học'
    // Card 3, Card 4: 'ôn tập'
    // Card 5, Card 6: 'chưa học'
    await updateCardStatus(listId, list.cards[0].card_id, testUserId, 'đã học');
    await updateCardStatus(listId, list.cards[1].card_id, testUserId, 'đã học');
    await updateCardStatus(listId, list.cards[2].card_id, testUserId, 'chưa nhớ');
    await updateCardStatus(listId, list.cards[3].card_id, testUserId, 'chưa nhớ');

    await sub.test('6.1 Chế độ học theo thứ tự (order): Chỉ áp dụng với thẻ cần ôn tập & chưa học, giữ nguyên thứ tự', async () => {
      const session = await startLearningSession(listId, testUserId, { mode: 'order' });

      assert.equal(session.mode, LEARNING_MODE_ORDER);
      assert.equal(session.total_cards_in_list, 6);
      assert.equal(session.total_cards_to_learn, 4, 'Chỉ 4 thẻ (2 ôn tập + 2 chưa học) được đưa vào học');
      assert.equal(session.learned_cards_excluded, 2, '2 thẻ đã học phải bị loại trừ khỏi phiên học');

      // Kiểm tra thứ tự và nội dung thẻ
      assert.equal(session.cards_to_learn[0].knowledge, 'Card 3');
      assert.equal(session.cards_to_learn[1].knowledge, 'Card 4');
      assert.equal(session.cards_to_learn[2].knowledge, 'Card 5');
      assert.equal(session.cards_to_learn[3].knowledge, 'Card 6');
    });

    await sub.test('6.2 Chế độ học ngẫu nhiên (random): Chỉ áp dụng thẻ cần ôn tập & chưa học, xáo trộn thứ tự', async () => {
      const session = await startLearningSession(listId, testUserId, { mode: 'random' });

      assert.equal(session.mode, LEARNING_MODE_RANDOM);
      assert.equal(session.total_cards_to_learn, 4);
      assert.equal(session.learned_cards_excluded, 2);

      // Mọi thẻ đưa vào học đều phải là 'ôn tập' hoặc 'chưa học'
      for (const card of session.cards_to_learn) {
        assert.ok(
          card.status === CARD_STATUS_REVIEW || card.status === CARD_STATUS_NOT_LEARNED,
          'Thẻ phải có trạng thái ôn tập hoặc chưa học'
        );
      }
    });

    await sub.test('6.3 Chế độ học lại từ đầu (restart): Reset toàn bộ trạng thái trong danh sách về chưa học & học theo thứ tự', async () => {
      const session = await startLearningSession(listId, testUserId, { mode: 'restart' });

      assert.equal(session.mode, LEARNING_MODE_RESTART);
      assert.equal(session.total_cards_to_learn, 6, 'Học lại từ đầu nên toàn bộ 6 thẻ đều được đưa vào');
      assert.equal(session.learned_cards_excluded, 0);

      // Kiểm tra toàn bộ thẻ trong DB đã được reset về "chưa học"
      const listInDb = await getFlashcardsInList(listId, testUserId);
      for (const card of listInDb.cards) {
        assert.equal(card.status, CARD_STATUS_NOT_LEARNED, 'Mọi thẻ trong DB phải là chưa học');
      }

      // Sắp xếp theo thứ tự từ Card 1 đến Card 6
      assert.equal(session.cards_to_learn[0].knowledge, 'Card 1');
      assert.equal(session.cards_to_learn[5].knowledge, 'Card 6');
    });
  });

  await t.test('7. Chặn xóa bớt thẻ nếu bộ flashcard liên kết với Roadmap dưới 5 thẻ:', async () => {
    const roadmapNodeId = 'fe-node-security-test';

    // Tạo bộ flashcard liên kết với Roadmap gồm đúng 5 thẻ
    const fiveCards = Array.from({ length: 5 }, (_, i) => ({
      knowledge: `Security Concept ${i + 1}`,
      description: 'Desc',
      code: '',
      note: '',
    }));

    const roadmapLinkedSet = await createFlashcardList(testUserId, {
      title: 'Web Security Mastery',
      node_id: roadmapNodeId,
      cards: fiveCards,
    });

    assert.equal(roadmapLinkedSet.total_cards, 5);

    // Người dùng vào chỉnh sửa và xóa bớt còn 3 thẻ -> Hệ thống PHẢI CHẶN LẠI không cho lưu
    const remaining3Cards = fiveCards.slice(0, 3);

    await assert.rejects(
      async () => {
        await updateFlashcardList(roadmapLinkedSet.id, testUserId, {
          title: 'Web Security Mastery (Reduced)',
          cards: remaining3Cards,
        });
      },
      (err) => {
        assert.equal(err.status, 400);
        assert.equal(err.field, 'cards');
        assert.ok(err.message.includes('tối thiểu ít nhất 5 thẻ'));
        return true;
      },
      'Hệ thống phải chặn việc xóa bớt thẻ dưới 5 thẻ đối với bộ flashcard liên kết Roadmap'
    );

    // Kiểm tra trong DB: Dữ liệu vẫn được bảo toàn nguyên vẹn 5 thẻ
    const verifiedDbDoc = await getFlashcardsInList(roadmapLinkedSet.id, testUserId);
    assert.equal(verifiedDbDoc.total_cards, 5, 'Dữ liệu không bị thay đổi khi cố tình xóa bớt');

    // Ngược lại, nếu cập nhật giữ nguyên 5 thẻ hoặc tăng thêm 6 thẻ thì phải cho phép lưu bình thường
    const valid6Cards = [
      ...fiveCards,
      { knowledge: 'Security Concept 6', description: 'Desc', code: '', note: '' },
    ];
    const updatedSuccess = await updateFlashcardList(roadmapLinkedSet.id, testUserId, {
      cards: valid6Cards,
    });
    assert.equal(updatedSuccess.total_cards, 6, 'Cập nhật từ 5 thẻ trở lên phải thành công');
  });

  await t.test('8. Mối quan hệ giữa Flashcard và Roadmap:', async (sub) => {
    const testNodeId = 'fe-node-html-test';

    // Giả lập 1 Roadmap của người dùng với 1 node kỹ năng đang bị rơi vào trạng thái 'review'
    const mockRoadmap = {
      user_id: testUserId,
      category_id: 1,
      career_name: 'Frontend Developer',
      completed_nodes: 0,
      total_nodes: 1,
      progress_percentage: 0,
      nodes: [
        {
          node_id: testNodeId,
          title: 'HTML5 Semantic & Accessibility',
          status: ROADMAP_STATUS_REVIEW,
          is_review: true,
          score: 85,
        },
      ],
      created_at: new Date(),
      updated_at: new Date(),
    };
    await roadmapsColl.insertOne(mockRoadmap);

    await sub.test('8.1 Nút ấn tạo flashcard từ node roadmap tạo đúng tiêu đề và mô tả Ôn tập "tên node"', async () => {
      const reviewList = await createReviewFlashcardListFromRoadmapNode(testUserId, {
        node_id: testNodeId,
        title: 'HTML5 Semantic & Accessibility',
      });

      assert.equal(reviewList.title, 'HTML5 Semantic & Accessibility');
      assert.equal(reviewList.description, 'Ôn tập "HTML5 Semantic & Accessibility"');
      assert.equal(reviewList.node_id, testNodeId);
      assert.equal(reviewList.total_cards, 0);
    });

    let list10;
    await sub.test('8.2 Có đủ >= 5 flashcard nhưng CHƯA đạt tối thiểu 70%: Giữ nguyên trạng thái review', async () => {
      const cards10 = Array.from({ length: 10 }, (_, i) => ({
        knowledge: `Thẻ kỹ năng HTML số ${i + 1}`,
        description: 'Chi tiết kiến thức',
        code: `<code>${i + 1}</code>`,
        note: 'Chú thích',
      }));

      list10 = await createFlashcardList(testUserId, {
        title: 'HTML5 Semantic & Accessibility',
        node_id: testNodeId,
        cards: cards10,
      });

      // Chỉ đánh dấu 6/10 thẻ là "Đã học" (60% < 70%)
      for (let i = 0; i < 6; i++) {
        await updateCardStatus(list10.id, list10.cards[i].card_id, testUserId, 'đã học');
      }

      const syncResult = await checkAndUpdateRoadmapFromFlashcard(
        testUserId,
        testNodeId,
        list10.id
      );

      assert.equal(syncResult.updated, false, 'Không được cập nhật khi đạt dưới 70%');
      assert.equal(syncResult.node_status, ROADMAP_STATUS_REVIEW);
      assert.equal(syncResult.progress_percentage, 60);

      // Node trên roadmap vẫn là review
      const roadmapInDb = await roadmapsColl.findOne({ user_id: testUserId });
      const nodeInDb = roadmapInDb.nodes.find((n) => n.node_id === testNodeId);
      assert.equal(nodeInDb.status, ROADMAP_STATUS_REVIEW);
      assert.equal(nodeInDb.is_review, true);
    });

    await sub.test('8.3 Có >= 5 flashcard VÀ đạt >= 70%: Cập nhật thành công trạng thái node trên roadmap', async () => {
      // Học thêm 1 thẻ nữa từ list10 để thành 7/10 thẻ (70% >= 70%)
      const card7 = list10.cards[6].card_id;
      const updateRes = await updateCardStatus(list10.id, card7, testUserId, 'đã học');

      assert.equal(updateRes.stats.progress_percentage, 70);
      assert.ok(updateRes.roadmap_sync);
      assert.equal(updateRes.roadmap_sync.updated, true, 'Đã đạt 70% và >= 5 thẻ -> Cập nhật lộ trình');

      // Kiểm tra trực tiếp trong collection user_roadmaps
      const roadmapInDb = await roadmapsColl.findOne({ user_id: testUserId });
      const nodeInDb = roadmapInDb.nodes.find((n) => n.node_id === testNodeId);

      assert.equal(
        nodeInDb.status,
        ROADMAP_STATUS_COMPLETED,
        'Trạng thái node trên roadmap phải được chuyển khỏi review sang completed'
      );
      assert.equal(nodeInDb.is_review, false, 'Cờ is_review phải được gỡ bỏ');
      assert.equal(roadmapInDb.completed_nodes, 1);
      assert.equal(roadmapInDb.progress_percentage, 100);
    });
  });

  await t.test('9. Kiểm tra bảo mật và phân quyền dữ liệu người dùng (User Data Isolation)', async () => {
    const otherList = await createFlashcardList(otherUserId, {
      title: 'Private List of Other User',
      cards: [{ knowledge: 'Secret', description: '', code: '', note: '' }],
    });

    // testUserId không thể truy xuất list của otherUserId
    await assert.rejects(
      async () => {
        await getFlashcardsInList(otherList.id, testUserId);
      },
      { status: 404 }
    );

    // testUserId không thể sửa list của otherUserId
    await assert.rejects(
      async () => {
        await updateFlashcardList(otherList.id, testUserId, { title: 'Hack' });
      },
      { status: 404 }
    );

    // testUserId không thể cập nhật trạng thái thẻ của otherUserId
    await assert.rejects(
      async () => {
        await updateCardStatus(otherList.id, otherList.cards[0].card_id, testUserId, 'đã học');
      },
      { status: 404 }
    );
  });
});
