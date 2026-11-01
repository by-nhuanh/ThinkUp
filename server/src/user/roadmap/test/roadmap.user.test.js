import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COLLECTION_USER_ROADMAPS,
  COLLECTION_ROADMAP_QUESTIONS,
  COLLECTION_ROADMAP_SUBMISSIONS,
  SEED_STAGE_QUESTIONS,
  STATUS_NOT_STARTED,
  STATUS_IN_PROGRESS,
  STATUS_REVIEW,
  STATUS_COMPLETED,
  EWMA_ALPHA,
  getCareerRoadmapsList,
  getRoadmapTemplate,
  selectUserRoadmap,
  getMyRoadmap,
  getStageTestQuestions,
  submitStageTest,
  syncCourseProgressToRoadmap,
  getUserSubmissionHistory,
  determineNodeStatus,
  calculateRoadmapProgress,
  getNodeCourseRecommendations
} from '../roadmap.user.js';
import { getMongoDb, closeMongoDb } from '../../db.js';

test('Roadmap Backend Service Test Suite', async (t) => {
  const db = await getMongoDb();
  const roadmapsColl = db.collection(COLLECTION_USER_ROADMAPS);
  const submissionsColl = db.collection(COLLECTION_ROADMAP_SUBMISSIONS);
  const questionsColl = db.collection(COLLECTION_ROADMAP_QUESTIONS);
  const preexistingQuestionIds = new Set((await questionsColl.find({}, { projection: { question_id: 1 } }).toArray())
    .map(question => question.question_id));

  // Tạo ID test giả lập cô lập
  const testUserId = 'test_user_roadmap_9999';
  const testTailwindCourseId = 'roadmap-test-course-tailwind';
  const testNodeCourseId = 'roadmap-test-course-node';
  const testReactCourseId = 'roadmap-test-course-react';
  const testTagIds = ['roadmap-test-tag-tailwind', 'roadmap-test-tag-node', 'roadmap-test-tag-react'];
  let ownsFrontendCategoryFixture = false;

  // Dọn dẹp dữ liệu test trước khi chạy
  await roadmapsColl.deleteMany({ user_id: testUserId });
  await submissionsColl.deleteMany({ user_id: testUserId });
  await db.collection('user_course_progress').deleteMany({ user_id: testUserId });
  await db.collection('user_enrollments').deleteMany({ user_id: testUserId });
  await db.collection('courses').deleteMany({
    course_id: { $in: [testTailwindCourseId, testNodeCourseId, testReactCourseId] },
  });
  await db.collection('course_tags').deleteMany({
    course_id: { $in: [testTailwindCourseId, testNodeCourseId, testReactCourseId] },
  });
  await db.collection('tags').deleteMany({ tag_id: { $in: testTagIds } });
  if (!await db.collection('course_categories').findOne({ category_id: 1 })) {
    const categoryFixture = await db.collection('course_categories').insertOne({
      category_id: 1,
      name: 'Frontend Developer',
      test_fixture_id: 'roadmap-user-test-frontend-category',
    });
    ownsFrontendCategoryFixture = Boolean(categoryFixture.insertedId);
  }
  await db.collection('courses').insertMany([
    { course_id: testTailwindCourseId, title: 'TailwindCSS test course', status: 'published', price: 100 },
    { course_id: testNodeCourseId, title: 'Node.js test course', status: 'published', price: 100 },
    { course_id: testReactCourseId, title: 'ReactJS test course', status: 'published', price: 100 },
  ]);
  await db.collection('course_tags').insertMany([
    { course_id: testTailwindCourseId, tag_id: testTagIds[0] },
    { course_id: testNodeCourseId, tag_id: testTagIds[1] },
    { course_id: testReactCourseId, tag_id: testTagIds[2] },
  ]);
  await db.collection('tags').insertMany([
    { tag_id: testTagIds[0], name: 'TailwindCSS' },
    { tag_id: testTagIds[1], name: 'Node.js' },
    { tag_id: testTagIds[2], name: 'ReactJS' },
  ]);

  t.after(async () => {
    // Dọn dẹp sau khi kiểm thử kết thúc
    await roadmapsColl.deleteMany({ user_id: testUserId });
    await submissionsColl.deleteMany({ user_id: testUserId });
    const testInsertedQuestionIds = SEED_STAGE_QUESTIONS
      .map(question => question.question_id)
      .filter(questionId => !preexistingQuestionIds.has(questionId));
    if (testInsertedQuestionIds.length > 0) {
      await questionsColl.deleteMany({ question_id: { $in: testInsertedQuestionIds } });
    }
    await db.collection('user_course_progress').deleteMany({ user_id: testUserId });
    await db.collection('user_enrollments').deleteMany({ user_id: testUserId });
    await db.collection('courses').deleteMany({
      course_id: { $in: [testTailwindCourseId, testNodeCourseId, testReactCourseId] },
    });
    await db.collection('course_tags').deleteMany({
      course_id: { $in: [testTailwindCourseId, testNodeCourseId, testReactCourseId] },
    });
    await db.collection('tags').deleteMany({ tag_id: { $in: testTagIds } });
    if (ownsFrontendCategoryFixture) {
      await db.collection('course_categories').deleteOne({
        test_fixture_id: 'roadmap-user-test-frontend-category',
      });
    }
    await closeMongoDb();
  });

  await t.test('1. Lấy danh sách nghề nghiệp và template lộ trình', async () => {
    const careers = await getCareerRoadmapsList();
    assert.ok(Array.isArray(careers), 'Danh sách nghề phải là một mảng');
    assert.ok(careers.length > 0, 'Phải có ít nhất 1 nghề nghiệp từ database');

    const feCareer = careers.find(c => c.category_id === 1);
    assert.ok(feCareer, 'Phải tìm thấy Frontend Developer (Category 1)');
    assert.equal(feCareer.has_custom_template, true, 'Frontend phải có template tùy chỉnh');
    assert.ok(feCareer.total_stages >= 3, 'Frontend phải có ít nhất 3 stages');

    // Lấy template chi tiết của Frontend
    const feTemplate = await getRoadmapTemplate(1);
    assert.equal(feTemplate.category_id, 1);
    assert.ok(Array.isArray(feTemplate.stages));
    assert.ok(feTemplate.stages[0].nodes.length >= 3);
  });

  await t.test('2. Quy tắc chuyển trạng thái Node và bảo toàn cờ REVIEW', async () => {
    // a. Điểm >= 80% chuyển completed
    assert.equal(determineNodeStatus(STATUS_NOT_STARTED, 85, false), STATUS_COMPLETED);

    // b. Điểm từ 40% đến 79% chuyển in_progress
    assert.equal(determineNodeStatus(STATUS_NOT_STARTED, 60, false), STATUS_IN_PROGRESS);

    // c. Điểm 0% giữ not_started nếu chưa từng học
    assert.equal(determineNodeStatus(STATUS_NOT_STARTED, 0, false), STATUS_NOT_STARTED);

    // d. Rớt test (< 40%) sau khi đã từng học -> rơi vào REVIEW
    assert.equal(determineNodeStatus(STATUS_IN_PROGRESS, 30, true), STATUS_REVIEW);
    assert.equal(determineNodeStatus(STATUS_COMPLETED, 20, true), STATUS_REVIEW);

    // e. QUY TẮC CỐT LÕI: Một khi đã REVIEW thì KHÔNG THỂ tự chuyển về completed hay in_progress
    assert.equal(determineNodeStatus(STATUS_REVIEW, 100, false), STATUS_REVIEW);
    assert.equal(determineNodeStatus(STATUS_REVIEW, 80, false), STATUS_REVIEW);
    assert.equal(determineNodeStatus(STATUS_REVIEW, 50, false), STATUS_REVIEW);
    assert.equal(determineNodeStatus(STATUS_REVIEW, 0, false), STATUS_REVIEW);
  });

  await t.test('3. Chọn lộ trình và khởi tạo nodes cho người dùng', async () => {
    // Lỗi khi thiếu user
    await assert.rejects(
      async () => {
        await selectUserRoadmap(null, 1);
      },
      { status: 401 }
    );

    // Lỗi khi category không hợp lệ
    await assert.rejects(
      async () => {
        await selectUserRoadmap(testUserId, 'invalid_id');
      },
      { status: 400 }
    );

    // Chọn thành công lộ trình Frontend
    const roadmap = await selectUserRoadmap(testUserId, 1);
    assert.ok(roadmap);
    assert.equal(roadmap.user_id, testUserId);
    assert.equal(roadmap.category_id, 1);
    assert.equal(roadmap.is_active, true);
    assert.ok(Array.isArray(roadmap.nodes));
    assert.ok(roadmap.nodes.length > 0);

    // Toàn bộ node ban đầu phải ở trạng thái not_started với điểm 0
    roadmap.nodes.forEach(node => {
      assert.equal(node.status, STATUS_NOT_STARTED);
      assert.equal(node.score, 0);
      assert.equal(node.is_review, false);
    });

    // Lấy thông tin lộ trình hiện tại qua getMyRoadmap
    const myRoadmap = await getMyRoadmap(testUserId);
    assert.equal(myRoadmap.has_roadmap, true);
    assert.equal(myRoadmap.category_id, 1);
    assert.equal(myRoadmap.stages.length, 3);
  });

  await t.test('4. Lấy bộ câu hỏi bài test giai đoạn (ẩn đáp án đúng)', async () => {
    const stageQuestions = await getStageTestQuestions('fe-stage-1');
    assert.equal(stageQuestions.stage_id, 'fe-stage-1');
    assert.equal(stageQuestions.questions.length, 20);
    const perTagCounts = stageQuestions.questions.reduce((counts, question) => {
      counts[question.skill_tag] = (counts[question.skill_tag] || 0) + 1;
      return counts;
    }, {});
    for (const tag of ['HTML', 'CSS', 'JavaScript', 'Git']) assert.ok(perTagCounts[tag] >= 5, `${tag} phải có ít nhất 5 câu`);

    // Đảm bảo không để lộ đáp án đúng hay lời giải
    stageQuestions.questions.forEach(q => {
      assert.equal(q.correct_option, undefined, 'Phải ẩn correct_option');
      assert.equal(q.explanation, undefined, 'Phải ẩn explanation');
      assert.ok(q.question_id);
      assert.ok(q.node_id);
      assert.ok(q.skill_tag);
      assert.ok(Array.isArray(q.options));
      assert.equal(q.options.length, 4);
    });
  });

  await t.test('4.1 Ngân hàng mỗi tag có tối thiểu 5 câu ở các stage đã gieo seed', async () => {
    const expectations = [
      ['fe-stage-1', ['HTML', 'CSS', 'JavaScript', 'Git']],
      ['fe-stage-2', ['TailwindCSS', 'ReactJS', 'TypeScript', 'REST API']],
      ['be-stage-1', ['Node.js', 'JavaScript', 'SQL', 'MongoDB']],
    ];
    for (const [stageId, tags] of expectations) {
      const result = await getStageTestQuestions(stageId);
      const counts = result.questions.reduce((acc, question) => {
        acc[question.skill_tag] = (acc[question.skill_tag] || 0) + 1;
        return acc;
      }, {});
      for (const tag of tags) assert.ok(counts[tag] >= 5, `${stageId}/${tag} có ${counts[tag] || 0} câu`);
      assert.equal(result.total_questions, result.questions.length);
    }
  });

  await t.test('5. Nộp bài test, phân rã điểm theo node và cập nhật EWMA', async () => {
    const answers = SEED_STAGE_QUESTIONS.filter(question => question.stage_id === 'fe-stage-1').map(question => ({
      question_id: question.question_id,
      selected_option: question.skill_tag === 'Git'
        ? (question.correct_option === 'A' ? 'B' : 'A')
        : question.correct_option,
    }));

    const result = await submitStageTest(testUserId, 'fe-stage-1', answers);
    assert.ok(result.submission_id);
    assert.equal(result.total_questions, 20);
    assert.equal(result.correct_count, 15);
    assert.equal(result.score_percentage, 75);
    assert.equal(result.detailed_results.length, 20);
    result.detailed_results.forEach(detail => {
      assert.equal(detail.correct_option, undefined);
      assert.equal(detail.explanation, undefined);
      assert.equal(detail.is_correct, undefined);
    });

    // Kiểm tra phân rã node: fe-node-html đạt 5/5 = 100%
    const breakdown = result.node_breakdown;
    assert.ok(breakdown['fe-node-html']);
    assert.equal(breakdown['fe-node-html'].correct, 5);
    assert.equal(breakdown['fe-node-html'].total, 5);
    assert.equal(breakdown['fe-node-html'].quiz_score, 100);
    assert.equal(breakdown['fe-node-html'].new_status, STATUS_COMPLETED);

    // Kiểm tra phân rã node: fe-node-git sai cả 5 câu = 0%
    assert.ok(breakdown['fe-node-git']);
    assert.equal(breakdown['fe-node-git'].correct, 0);
    assert.equal(breakdown['fe-node-git'].total, 5);
    assert.equal(breakdown['fe-node-git'].quiz_score, 0);

    // Kiểm tra trạng thái trong DB sau bài test
    const updatedMyRoadmap = await getMyRoadmap(testUserId);
    const htmlNode = updatedMyRoadmap.raw_nodes.find(n => n.node_id === 'fe-node-html');
    assert.equal(htmlNode.status, STATUS_COMPLETED);
    assert.equal(htmlNode.score, 100);

    // Kiểm tra lịch sử làm bài test
    const history = await getUserSubmissionHistory(testUserId, 'fe-stage-1');
    assert.ok(history.length >= 1);
    assert.equal(history[0].score_percentage, 75);
  });

  await t.test('5.1 Từ chối bài nộp thiếu câu, trùng câu, sai stage hoặc option', async () => {
    const validQuestions = await getStageTestQuestions('fe-stage-1');
    const completeAnswers = validQuestions.questions.map(question => ({
      question_id: question.question_id,
      selected_option: 'A',
    }));
    const beforeCount = await submissionsColl.countDocuments({ user_id: testUserId, stage_id: 'fe-stage-1' });

    await assert.rejects(
      () => submitStageTest(testUserId, 'fe-stage-1', completeAnswers.slice(0, -1)),
      error => error.status === 400 && error.code === 'STAGE_ANSWER_SET_INVALID',
    );
    const duplicateAnswers = [...completeAnswers];
    duplicateAnswers[duplicateAnswers.length - 1] = { ...duplicateAnswers[0] };
    await assert.rejects(
      () => submitStageTest(testUserId, 'fe-stage-1', duplicateAnswers),
      error => error.status === 400 && error.code === 'STAGE_ANSWER_SET_INVALID',
    );
    const crossStageAnswers = [...completeAnswers];
    crossStageAnswers[0] = { question_id: 'fe-s2-q1', selected_option: 'A' };
    await assert.rejects(
      () => submitStageTest(testUserId, 'fe-stage-1', crossStageAnswers),
      error => error.status === 400 && error.code === 'STAGE_ANSWER_SET_INVALID',
    );
    const invalidOptionAnswers = [...completeAnswers];
    invalidOptionAnswers[0] = { ...invalidOptionAnswers[0], selected_option: 'Z' };
    await assert.rejects(
      () => submitStageTest(testUserId, 'fe-stage-1', invalidOptionAnswers),
      error => error.status === 400 && error.code === 'STAGE_ANSWER_INVALID',
    );

    assert.equal(await submissionsColl.countDocuments({ user_id: testUserId, stage_id: 'fe-stage-1' }), beforeCount);
  });

  await t.test('5.2 Không sinh bộ câu hỏi fallback không có ngân hàng đã duyệt', async () => {
    await assert.rejects(
      () => getStageTestQuestions('stage-without-approved-question-bank'),
      error => error.status === 404 && error.code === 'STAGE_QUESTION_BANK_EMPTY',
    );
    assert.equal(await questionsColl.countDocuments({ stage_id: 'stage-without-approved-question-bank' }), 0);
  });

  await t.test('6. Đánh dấu trạng thái REVIEW khi làm rớt bài test và kiểm tra bất biến', async () => {
    // Làm lại bài test nhưng cố tình làm sai toàn bộ câu hỏi của fe-node-html (trước đó đang là completed)
    const stageQuestions = await getStageTestQuestions('fe-stage-1');
    const seedCorrectOptions = new Map(SEED_STAGE_QUESTIONS.map(question => [question.question_id, question.correct_option]));
    const failAnswers = stageQuestions.questions.map(question => ({
      question_id: question.question_id,
      selected_option: question.skill_tag === 'HTML'
        ? (question.options.find(option => option.key !== seedCorrectOptions.get(question.question_id))?.key || 'A')
        : 'D',
    }));

    const failResult = await submitStageTest(testUserId, 'fe-stage-1', failAnswers);
    const htmlBreakdown = failResult.node_breakdown['fe-node-html'];
    assert.ok(htmlBreakdown);
    assert.equal(htmlBreakdown.correct, 0);
    assert.equal(htmlBreakdown.quiz_score, 0);

    // Kiểm tra công thức EWMA: 0.6 * 0 + 0.4 * 100 = 40
    assert.equal(htmlBreakdown.new_overall_score, 40);

    // Vì trước đó fe-node-html đã completed nhưng bài test này rớt (< 40%) -> Rơi vào REVIEW!
    assert.equal(htmlBreakdown.new_status, STATUS_REVIEW);
    assert.equal(htmlBreakdown.is_review, true);

    // Giờ nộp bài lại 100% đúng cho fe-node-html để kiểm tra tính bất biến của REVIEW
    const htmlCorrectOptions = new Map(SEED_STAGE_QUESTIONS
      .filter(question => question.stage_id === 'fe-stage-1' && question.skill_tag === 'HTML')
      .map(question => [question.question_id, question.correct_option]));
    const retryAnswers = stageQuestions.questions.map(question => ({
      question_id: question.question_id,
      selected_option: htmlCorrectOptions.get(question.question_id) || 'D',
    }));
    const retryResult = await submitStageTest(testUserId, 'fe-stage-1', retryAnswers);
    const retryBreakdown = retryResult.node_breakdown['fe-node-html'];

    // Dù điểm EWMA tăng lên (0.6 * 100 + 0.4 * 40 = 76), trạng thái VẪN LÀ REVIEW
    assert.equal(retryBreakdown.new_status, STATUS_REVIEW, 'Trạng thái REVIEW không được tự động chuyển đổi trong roadmap');
    assert.equal(retryBreakdown.is_review, true);
  });

  await t.test('7. Đồng bộ tiến độ khóa học đã mua vào Roadmap Nodes', async () => {
    const enrollmentsColl = db.collection('user_enrollments');

    // Giả lập ghi danh 1 khóa học TailwindCSS cho test user với tiến độ 90%
    await enrollmentsColl.deleteMany({ user_id: testUserId });
    await enrollmentsColl.insertOne({
      enrollment_id: 'test_enroll_1',
      user_id: testUserId,
      course_id: testTailwindCourseId,
      progress_percentage: '0',
      enrolled_at: new Date()
    });
    await db.collection('user_course_progress').insertOne({
      user_id: testUserId,
      course_id: testTailwindCourseId,
      progress_percentage: 90,
    });

    try {
      const syncResult = await syncCourseProgressToRoadmap(testUserId);
      assert.equal(syncResult.synced, true);
      assert.ok(syncResult.synced_nodes.length > 0);

      const tailwindNodeLog = syncResult.synced_nodes.find(n => n.node_id === 'fe-node-tailwind');
      assert.ok(tailwindNodeLog, 'Node TailwindCSS phải được đồng bộ');
      assert.equal(tailwindNodeLog.avg_course_progress, 90);
      assert.equal(tailwindNodeLog.new_score, 90);
      assert.equal(tailwindNodeLog.new_status, STATUS_COMPLETED);

      // Node fe-node-html đang là review, đảm bảo sau khi sync vẫn giữ nguyên review
      const myRoadmapAfterSync = await getMyRoadmap(testUserId);
      const htmlNode = myRoadmapAfterSync.raw_nodes.find(n => n.node_id === 'fe-node-html');
      assert.equal(htmlNode.status, STATUS_REVIEW, 'fe-node-html vẫn phải giữ trạng thái review sau khi đồng bộ khóa học');
    } finally {
      await enrollmentsColl.deleteMany({ user_id: testUserId });
      await db.collection('user_course_progress').deleteMany({ user_id: testUserId });
    }
  });

  await t.test('8. Kiểm tra hàm tính tiến độ học lộ trình calculateRoadmapProgress', async () => {
    // Trường hợp mảng rỗng hoặc invalid
    assert.deepEqual(calculateRoadmapProgress([]), {
      completed_nodes: 0,
      total_nodes: 0,
      progress_percentage: 0
    });

    // Trường hợp 4 node: 2 completed, 1 in_progress, 1 review -> (2 / 4) * 100 = 50%
    const mockNodes = [
      { node_id: 'n1', status: STATUS_COMPLETED },
      { node_id: 'n2', status: STATUS_COMPLETED },
      { node_id: 'n3', status: STATUS_IN_PROGRESS },
      { node_id: 'n4', status: STATUS_REVIEW }
    ];
    const progress = calculateRoadmapProgress(mockNodes);
    assert.equal(progress.total_nodes, 4);
    assert.equal(progress.completed_nodes, 2);
    assert.equal(progress.progress_percentage, 50);

    // Trường hợp 3 node: 1 completed -> (1 / 3) * 100 = 33%
    const mockNodes2 = [
      { node_id: 'n1', status: STATUS_COMPLETED },
      { node_id: 'n2', status: STATUS_IN_PROGRESS },
      { node_id: 'n3', status: STATUS_NOT_STARTED }
    ];
    assert.equal(calculateRoadmapProgress(mockNodes2).progress_percentage, 33);
  });

  await t.test('9. Đồng bộ tiến độ cho các roadmap khác theo tag khi người dùng học khóa học phù hợp', async () => {
    // Giả lập người dùng từng khởi tạo cả roadmap Backend (Category 2)
    // Sau đó chọn active lại Frontend (Category 1). Lúc này Backend là inactive (lộ trình khác)
    await selectUserRoadmap(testUserId, 2); // Kích hoạt Backend (Category 2)
    await selectUserRoadmap(testUserId, 1); // Quay lại kích hoạt Frontend (Category 1)

    // Đảm bảo trong DB user có 2 bản ghi roadmap: Frontend (active) và Backend (inactive)
    const countRoadmaps = await roadmapsColl.countDocuments({ user_id: testUserId });
    assert.equal(countRoadmaps, 2, 'User phải có 2 roadmap được lưu');

    const enrollmentsColl = db.collection('user_enrollments');
    // Ghi danh 1 khóa học Node.js / Express (Khóa học 3 mang tag Node.js, SQL, REST API)
    await enrollmentsColl.insertOne({
      enrollment_id: 'test_enroll_multi_1',
      user_id: testUserId,
      course_id: testNodeCourseId,
      progress_percentage: '100',
      enrolled_at: new Date()
    });

    try {
      const syncResult = await syncCourseProgressToRoadmap(testUserId);
      assert.equal(syncResult.synced, true);
      assert.ok(Array.isArray(syncResult.all_roadmaps_progress));
      assert.equal(syncResult.all_roadmaps_progress.length, 2);

      // Kiểm tra Backend roadmap (dù đang inactive) vẫn được đồng bộ node có tag Node.js!
      const beRoadmapDoc = await roadmapsColl.findOne({ user_id: testUserId, category_id: 2 });
      assert.ok(beRoadmapDoc);
      const nodeJsNode = beRoadmapDoc.nodes.find(n => n.node_id === 'be-node-nodejs');
      assert.ok(nodeJsNode, 'Node be-node-nodejs phải tồn tại trong Backend roadmap');
      assert.equal(nodeJsNode.score, 100, 'Điểm Node.js trong Backend roadmap phải được tính 100%');
      assert.equal(nodeJsNode.status, STATUS_COMPLETED, 'Trạng thái Node.js trong Backend roadmap phải chuyển completed');

      // Tiến độ tổng của Backend roadmap (inactive) cũng được cập nhật
      assert.ok(beRoadmapDoc.progress_percentage > 0, 'Tiến độ tổng của roadmap khác phải > 0%');
    } finally {
      await enrollmentsColl.deleteMany({ user_id: testUserId });
    }
  });

  await t.test('10. Đề xuất ~4 khóa học chưa sở hữu theo node để thúc đẩy sale (Upsell)', async () => {
    // 10.1: Lấy đề xuất khóa học cho node fe-node-react
    const result = await getNodeCourseRecommendations(testUserId, 'fe-node-react', {
      limit: 4,
      db
    });

    assert.ok(result.node, 'Phải có thông tin node');
    assert.equal(result.node.node_id, 'fe-node-react');
    assert.ok(Array.isArray(result.courses), 'Danh sách khóa học phải là mảng');
    assert.ok(result.courses.length > 0 && result.courses.length <= 4, 'Số lượng khóa học đề xuất từ 1 đến 4');

    // Kiểm tra tất cả các khóa đề xuất đều chưa mua
    for (const c of result.courses) {
      assert.equal(c.is_purchased, false, 'Khóa đề xuất bắt buộc phải là khóa chưa mua');
      assert.ok(c.title, 'Phải có tiêu đề khóa học');
      assert.ok(c.price, 'Phải có thông tin giá');
      assert.ok(c.relevance_score > 0, 'Điểm liên quan phải > 0');
    }

    // 10.2: Giả lập học viên đã mua khóa đầu tiên -> Khóa đó phải bị LOẠI BỎ khỏi đề xuất
    const firstCourseId = result.courses[0].course_id;
    await db.collection('user_enrollments').insertOne({
      user_id: testUserId,
      course_id: firstCourseId,
      enrolled_at: new Date()
    });

    try {
      const resultAfterBuy = await getNodeCourseRecommendations(testUserId, 'fe-node-react', {
        limit: 4,
        db
      });

      const stillHasFirstCourse = resultAfterBuy.courses.some(c => c.course_id === firstCourseId);
      assert.equal(stillHasFirstCourse, false, 'Khóa đã mua tuyệt đối không được xuất hiện trong danh sách đề xuất');
    } finally {
      await db.collection('user_enrollments').deleteMany({ user_id: testUserId });
    }

    // 10.3: Báo lỗi 404 khi nodeId không tồn tại
    await assert.rejects(
      async () => {
        await getNodeCourseRecommendations(testUserId, 'non-existent-node-xyz', { db });
      },
      { status: 404 }
    );
  });
});
