import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { ObjectId } from 'mongodb';
import { getMongoDb, closeMongoDb } from '../../db.js';
import {
  validateEmail,
  calculateReadTime,
  generateSlug,
  countWords,
  sanitizeHtmlContent,
  generateUniqueSlug,
  generateSeoMetadata,
  formatBlogPost,
  extractTableOfContents,
  injectHeadingsWithIds,
  getBlogCollection,
  getBlogList,
  getManageBlogList,
  getBlogDetail,
  getPopularTopics,
  getMostViewedBlogPosts,
  getBlogSidebar,
  subscribeNewsletter,
  notifySubscribersNewPost,
  saveBlogPost,
  saveDraftPost,
  deleteBlogPost,
  uploadBlogImage,
  supplementExistingPostsSeo,
  reactBlogPost,
  generateShareLinks,
  formatBlogComment,
  getBlogComments,
  addBlogComment,
  createBlogRouter,
} from '../blog.user.js';

function newsletterNotificationFixture() {
  const tables = new Map();
  const copy = value => value instanceof ObjectId ? new ObjectId(String(value)) : value instanceof Date ? new Date(value)
    : Array.isArray(value) ? value.map(copy) : value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).map(([k,v]) => [k,copy(v)])) : value;
  const equal = (a,b) => a instanceof ObjectId || b instanceof ObjectId ? String(a) === String(b)
    : a instanceof Date || b instanceof Date ? +new Date(a) === +new Date(b) : b === null ? a == null : a === b;
  const match = (row,query) => Object.entries(query).every(([key,value]) => {
    if (key === '$or') return value.some(item => match(row,item));
    if (value && typeof value === 'object' && !(value instanceof ObjectId) && !(value instanceof Date)) {
      return Object.entries(value).every(([op,wanted]) => {
        if (op === '$ne') return !equal(row[key],wanted);
        if (op === '$lte') return row[key] <= wanted;
        throw new Error(`Unsupported query ${op}`);
      });
    }
    return equal(row[key],value);
  });
  const db = { tables,failPreferences:false,collection(name) {
    if (db.failPreferences && name === 'notification_preferences') throw new Error('Preferences offline');
    if (!tables.has(name)) tables.set(name,[]);
    const rows = tables.get(name);
    return {
      async findOne(query) { return copy(rows.find(row => match(row,query)) ?? null); },
      find(query) { return { project() { return this; },async toArray() { return copy(rows.filter(row => match(row,query))); } }; },
      async insertOne(doc) {
        const row = copy(doc);row._id ??= new ObjectId();
        if (rows.some(item => equal(item._id,row._id))) throw Object.assign(new Error('Duplicate'),{ code:11000 });
        rows.push(row);return { insertedId:row._id };
      },
      async updateOne(query,update,options = {}) {
        let row = rows.find(row => match(row,query));
        if (!row && options.upsert) { row = { ...copy(query),...copy(update.$setOnInsert || {}) };rows.push(row); }
        if (!row) return { matchedCount:0 };
        Object.assign(row,copy(update.$set || {}));return { matchedCount:1 };
      },
      async findOneAndUpdate(query,update) {
        const row = rows.find(row => match(row,query));if (!row) return null;
        Object.assign(row,copy(update.$set || {}));return copy(row);
      },
    };
  } };
  const uid = new ObjectId(),mails = [];
  tables.set('users',[{ _id:uid,email:'member@example.test',email_verified:true,status:'active',is_active:true }]);
  tables.set('newsletter_subscribers',[{ _id:'sub',email:'member@example.test',status:'active' }]);
  tables.set('notification_preferences',[{ _id:String(uid),marketingOptIn:true }]);
  const options = { db,now:Date.parse('2026-10-31T08:00:00Z'),
    sendEmail:async message => { mails.push(message);return { accepted:[message.to] }; } };
  const post = { id:'post-1',title:'Bài viết mới',slug:'bai-viet-moi',description:'Thông tin bài viết' };
  return { db,options,post,mails,uid:String(uid) };
}

describe('Notification integration: Blog isolated', () => {
  it('checks marketing/email/DND before sending while preserving one registered-user inbox entry', async () => {
    for (const patch of [{ marketingOptIn:false },{ email:false },{ dnd:{ mode:'indefinite' } }]) {
      const f = newsletterNotificationFixture();Object.assign(f.db.tables.get('notification_preferences')[0],patch);
      const result = await notifySubscribersNewPost(f.post,f.options);
      assert.equal(result.notified,0);assert.equal(result.suppressed,1);assert.equal(f.mails.length,0);
      assert.equal(f.db.tables.get('notifications').length,1);
    }
  });
  it('deduplicates inbox and actual email across repeated or concurrent publication notifications', async () => {
    const f = newsletterNotificationFixture();
    f.db.tables.get('newsletter_subscribers').push({ _id:'uppercase',email:'MEMBER@example.test',status:'active' });
    await Promise.all([notifySubscribersNewPost(f.post,f.options),notifySubscribersNewPost(f.post,f.options)]);
    await notifySubscribersNewPost(f.post,f.options);
    assert.equal(f.mails.length,1);assert.equal(f.db.tables.get('notifications').length,1);
    assert.equal(f.mails[0].text.includes('/main/blog/article/post-1'),true);
  });
  it('preserves guest subscription delivery, but never silently changes registered-user consent via a public subscribe', async () => {
    const f = newsletterNotificationFixture();f.db.tables.get('notification_preferences')[0].marketingOptIn = false;
    f.db.tables.set('newsletter_subscribers',[]);
    await subscribeNewsletter({ email:'member@example.test' },f.options);
    assert.equal(f.mails.length,0);assert.equal(f.db.tables.get('notification_preferences')[0].marketingOptIn,false);
    await subscribeNewsletter({ email:'guest@example.test' },f.options);
    assert.equal(f.mails.length,1);assert.equal(f.mails[0].to,'guest@example.test');
  });
  it('fails closed on preference errors, tracks delivery failures and allows retry after lease expiry', async () => {
    const f = newsletterNotificationFixture();f.db.failPreferences = true;
    assert.equal((await notifySubscribersNewPost(f.post,f.options)).failed,1);assert.equal(f.mails.length,0);
    f.db.failPreferences = false;f.options.sendEmail = async () => ({ sent:false });
    assert.equal((await notifySubscribersNewPost(f.post,f.options)).failed,1);
    f.options.now += 60_001;
    f.options.sendEmail = async message => { f.mails.push(message);return { accepted:[message.to] }; };
    assert.equal((await notifySubscribersNewPost(f.post,f.options)).notified,1);
    assert.equal(f.mails.length,1);assert.equal(f.db.tables.get('notifications').length,1);
  });
  it('does not send campaign mail or create inbox entries for unverified or suspended accounts', async () => {
    for (const patch of [{ email_verified:false },{ status:'locked' },{ is_active:false }]) {
      const f = newsletterNotificationFixture();Object.assign(f.db.tables.get('users')[0],patch);
      const result = await notifySubscribersNewPost(f.post,f.options);
      assert.equal(result.notified,0);assert.equal(f.mails.length,0);
      assert.equal(f.db.tables.get('notifications')?.length || 0,0);
    }
  });
});

describe('Chức Năng Blog User (Kiểm thử đơn vị & tích hợp CSDL)', () => {
  let db;
  const testCategoryA = 'Lập trình Web Test';
  const testCategoryB = 'Kỹ năng mềm Test';
  const testSubEmail1 = 'tester_newsletter_1@thinkup.vn';
  const testSubEmail2 = 'tester_newsletter_2@thinkup.vn';
  const testOwnerEmail = 'author_tester@thinkup.vn';
  const testOwnerId = 'test_blog_owner_authenticated';
  const otherOwnerId = 'test_blog_other_authenticated';
  const insertedBlogIds = [];

  before(async () => {
    db = await getMongoDb();
    const collection = getBlogCollection(db);

    // Dọn dẹp dữ liệu kiểm thử cũ nếu có
    await collection.deleteMany({ category: { $in: [testCategoryA, testCategoryB] } });
    await collection.deleteMany({ owner_email: testOwnerEmail });
    await collection.deleteMany({ owner_user_id: { $in: [testOwnerId, otherOwnerId] } });
    await db.collection('users').deleteMany({ id: { $in: [testOwnerId, otherOwnerId] } });
    await db.collection('users').insertMany([
      { id: testOwnerId, email: testOwnerEmail, full_name: 'Blog Owner' },
      { id: otherOwnerId, email: 'other_author_tester@thinkup.vn', full_name: 'Other Owner' },
    ]);
    await db.collection('newsletter_subscribers').deleteMany({ email: { $in: [testSubEmail1, testSubEmail2] } });

    // Tạo các bài viết blog mẫu cho bộ kiểm thử
    const now = new Date();
    const sampleBlogs = [
      {
        title: 'Hướng dẫn Lập Trình React Toàn Tập',
        slug: 'huong-dan-lap-trinh-react-toan-tap-test',
        description: 'Tài liệu học React từ cơ bản tới nâng cao cho người mới bắt đầu.',
        summary: 'Tài liệu học React từ cơ bản tới nâng cao cho người mới bắt đầu.',
        content: '<p>Nội dung bài viết chi tiết về React hooks, components, state management và nhiều kiến thức bổ ích khác.</p>',
        category: testCategoryA,
        category_id: generateSlug(testCategoryA),
        author: 'Nguyễn Văn Dev',
        views: 1500,
        status: 'published',
        cover_image: '/assets/blog/react-cover.jpg',
        tags: ['React', 'Frontend', 'JavaScript'],
        published_at: new Date(now.getTime() - 86400000 * 3),
        created_at: new Date(now.getTime() - 86400000 * 3),
        owner_email: testOwnerEmail,
      },
      {
        title: 'Bí quyết viết Clean Code cho JavaScript Developer',
        slug: 'bi-quyet-viet-clean-code-js-test',
        description: 'Các nguyên tắc vàng để mã nguồn của bạn luôn gọn gàng và dễ bảo trì.',
        summary: 'Các nguyên tắc vàng để mã nguồn của bạn luôn gọn gàng và dễ bảo trì.',
        content: '<p>Clean code là tiêu chuẩn không thể thiếu đối với mọi lập trình viên chuyên nghiệp...</p>',
        category: testCategoryA,
        category_id: generateSlug(testCategoryA),
        author: 'Trần Thị Code',
        views: 3200,
        status: 'published',
        cover_image: '/assets/blog/cleancode-cover.jpg',
        tags: ['CleanCode', 'JavaScript'],
        published_at: new Date(now.getTime() - 86400000 * 2),
        created_at: new Date(now.getTime() - 86400000 * 2),
        owner_email: testOwnerEmail,
      },
      {
        title: 'Kỹ năng giao tiếp và làm việc nhóm trong dự án Agile',
        slug: 'ky-nang-giao-tiep-va-lam-viec-nhom-agile-test',
        description: 'Phương pháp nâng cao sự thấu hiểu và phối hợp hiệu quả trong team tech.',
        summary: 'Phương pháp nâng cao sự thấu hiểu và phối hợp hiệu quả trong team tech.',
        content: '<p>Giao tiếp là chìa khóa then chốt quyết định sự thành bại của một dự án công nghệ...</p>',
        category: testCategoryB,
        category_id: generateSlug(testCategoryB),
        author: 'Lê Quản Trị',
        views: 850,
        status: 'published',
        cover_image: '/assets/blog/softskills-cover.jpg',
        tags: ['Agile', 'SoftSkills'],
        published_at: new Date(now.getTime() - 86400000 * 1),
        created_at: new Date(now.getTime() - 86400000 * 1),
        owner_email: testOwnerEmail,
      },
    ];

    const insertResult = await collection.insertMany(sampleBlogs);
    Object.values(insertResult.insertedIds).forEach(id => insertedBlogIds.push(id));
  });

  after(async () => {
    // Dọn dẹp toàn bộ dữ liệu kiểm thử
    if (db) {
      const collection = getBlogCollection(db);
      if (insertedBlogIds.length > 0) {
        await collection.deleteMany({ _id: { $in: insertedBlogIds } });
      }
      await collection.deleteMany({ category: { $in: [testCategoryA, testCategoryB] } });
      await collection.deleteMany({ owner_email: testOwnerEmail });
    await collection.deleteMany({ owner_user_id: { $in: [testOwnerId, otherOwnerId] } });
    await db.collection('users').deleteMany({ id: { $in: [testOwnerId, otherOwnerId] } });
      await db.collection('newsletter_subscribers').deleteMany({ email: { $in: [testSubEmail1, testSubEmail2] } });
    }
    await closeMongoDb();
  });

  describe('1. Kiểm thử các hàm tiện ích (Helpers & SEO & XSS Utilities)', () => {
    it('TC-UTIL-01: validateEmail kiểm tra đúng định dạng email', () => {
      assert.strictEqual(validateEmail('test@thinkup.vn').valid, true);
      assert.strictEqual(validateEmail('invalid-email').valid, false);
      assert.strictEqual(validateEmail('test with space@thinkup.vn').valid, false);
      assert.strictEqual(validateEmail('').valid, false);
      assert.strictEqual(validateEmail(null).valid, false);
    });

    it('TC-UTIL-02: generateSlug chuyển đổi tiếng Việt có dấu thành slug không dấu chuẩn', () => {
      const slug = generateSlug('Lập trình Fullstack Web 2026 với Node.js & React!');
      assert.strictEqual(slug, 'lap-trinh-fullstack-web-2026-voi-nodejs-react');
    });

    it('TC-UTIL-03: calculateReadTime tính đúng thời gian đọc theo số lượng từ', () => {
      const shortText = 'Một đoạn văn ngắn khoảng mười từ.';
      assert.strictEqual(calculateReadTime(shortText), '1 phút');

      const longText = Array(450).fill('từ').join(' ');
      assert.strictEqual(calculateReadTime(longText), '3 phút');
    });

    it('TC-UTIL-04: countWords đếm chính xác số từ tiếng Việt và loại trừ thẻ HTML', () => {
      const htmlText = '<p>Xin chào <strong>các bạn</strong> học viên ThinkUp!</p>';
      assert.strictEqual(countWords(htmlText), 7);
    });

    it('TC-UTIL-05: sanitizeHtmlContent loại bỏ mã độc XSS và bảo toàn định dạng Rich Text (BR-BLOG-03 & AC-BLG-13)', () => {
      const maliciousHtml = '<p>Hello world</p><script>alert("XSS Attack!")</script><img src="pic.jpg" onerror="alert(1)"><iframe src="evil.com"></iframe><a href="javascript:void(0)">Link</a>';
      const safeHtml = sanitizeHtmlContent(maliciousHtml);

      assert.strictEqual(safeHtml.includes('<script>'), false);
      assert.strictEqual(safeHtml.includes('alert('), false);
      assert.strictEqual(safeHtml.includes('onerror='), false);
      assert.strictEqual(safeHtml.includes('<iframe'), false);
      assert.strictEqual(safeHtml.includes('javascript:'), false);
      assert.strictEqual(safeHtml.includes('<p>Hello world</p>'), true);
    });

    it('TC-UTIL-06: generateUniqueSlug tự động thêm hậu tố -1, -2 khi slug bị trùng lặp (BR-BLOG-01)', async () => {
      const slug1 = await generateUniqueSlug(db, 'Huong dan lap trinh React Toan Tap test');
      assert.strictEqual(slug1, 'huong-dan-lap-trinh-react-toan-tap-test-1');
    });

    it('TC-UTIL-07: generateSeoMetadata áp dụng chuẩn SEO Google SERP và Smart Fallback (BR-BLOG-02)', () => {
      // Khi không nhập SEO Title và SEO Description -> Tự động Fallback
      const seoAuto = generateSeoMetadata({
        title: 'Học Lập Trình TypeScript Toàn Tập Từ A Đến Z',
        summary: 'Khoá học ngắn giúp bạn làm chủ ngôn ngữ TypeScript trong vòng 7 ngày.',
        status: 'published',
      });

      assert.strictEqual(seoAuto.seoTitle, 'Học Lập Trình TypeScript Toàn Tập Từ A Đến Z');
      assert.strictEqual(seoAuto.seoDescription, 'Khoá học ngắn giúp bạn làm chủ ngôn ngữ TypeScript trong vòng 7 ngày.');
      assert.strictEqual(seoAuto.robots, 'index, follow');
      assert.ok(seoAuto.openGraph);
      assert.strictEqual(seoAuto.schemaMarkup['@type'], 'BlogPosting');

      // Khi là bài nháp -> Robots phải là noindex, nofollow (BR-BLOG-04)
      const seoDraft = generateSeoMetadata({
        title: 'Bài viết nháp',
        status: 'draft',
      });
      assert.strictEqual(seoDraft.robots, 'noindex, nofollow');

      // Khi tiêu đề SEO vượt quá 60 ký tự -> Tự động cắt tối đa 60 ký tự
      const longTitle = 'A'.repeat(80);
      const seoCut = generateSeoMetadata({
        title: 'Tiêu đề ngắn',
        seoTitle: longTitle,
      });
      assert.strictEqual(seoCut.seoTitle.length, 60);
    });

    it('TC-UTIL-08: formatBlogPost chuẩn hóa đầy đủ các trường hiển thị và thông tin SEO của bài blog', () => {
      const mockDoc = {
        _id: new ObjectId(),
        title: 'Bài Viết Mẫu',
        description: 'Mô tả ngắn bài viết',
        summary: 'Mô tả ngắn bài viết',
        category: 'Công nghệ',
        author: 'Admin',
        published_at: new Date('2026-05-15T10:00:00Z'),
        views: 120,
        content: '<p>Nội dung bài viết mẫu</p>',
        status: 'published',
      };
      const formatted = formatBlogPost(mockDoc);
      assert.ok(formatted.id);
      assert.strictEqual(formatted.title, 'Bài Viết Mẫu');
      assert.strictEqual(formatted.description, 'Mô tả ngắn bài viết');
      assert.strictEqual(formatted.category, 'Công nghệ');
      assert.strictEqual(formatted.author, 'Admin');
      assert.strictEqual(formatted.date, '2026-05-15');
      assert.ok(formatted.readTime);
      assert.ok(formatted.coverImage);
      assert.strictEqual(formatted.views, 120);
      assert.strictEqual(formatted.seoTitle, 'Bài Viết Mẫu');
      assert.strictEqual(formatted.seoDescription, 'Mô tả ngắn bài viết');
      assert.strictEqual(formatted.robots, 'index, follow');
      assert.ok(formatted.schemaMarkup);
      assert.ok(Array.isArray(formatted.tableOfContents));
    });

    it('TC-UTIL-09: extractTableOfContents chỉ sinh neo cho heading người dùng có chủ động tạo id', () => {
      const html = '<h2 id="gioi-thieu">Giới thiệu</h2><p>Nội dung</p><h2>Không có ID</h2><h3 id="chi-tiet">Chi tiết</h3>';
      const toc = extractTableOfContents(html);
      assert.strictEqual(toc.length, 2);
      assert.strictEqual(toc[0].id, 'gioi-thieu');
      assert.strictEqual(toc[1].id, 'chi-tiet');
    });

    it('TC-UTIL-10: injectHeadingsWithIds luôn bảo toàn 100% nội dung gốc của người dùng', () => {
      const raw = '<h2>Tiêu đề</h2>';
      assert.strictEqual(injectHeadingsWithIds(raw), raw);
    });

    it('TC-UTIL-11: uploadBlogImage validate dung lượng và định dạng ảnh (AC-BLG-10)', async () => {
      // URL/base64 giả không còn được trả về như thể đã lưu trữ thành công.
      await assert.rejects(
        () => uploadBlogImage({ url: 'https://cdn.thinkup.vn/avatar.png', fileName: 'avatar.png' }),
        err => err.code === 'INVALID_IMAGE_DATA',
      );

      // Kích thước được tính từ byte ảnh, bỏ qua sizeBytes client khai báo.
      const oversizedImage = `data:image/jpeg;base64,${Buffer.alloc(2 * 1024 * 1024 + 1).toString('base64')}`;
      await assert.rejects(
        () => uploadBlogImage({ fileName: 'large.jpg', sizeBytes: 1, base64: oversizedImage, type: 'thumbnail' }),
        err => err.code === 'IMAGE_TOO_LARGE',
      );

      // Báo lỗi khi sai định dạng file (không phải jpg, png, webp).
      await assert.rejects(
        () => uploadBlogImage({ fileName: 'document.pdf' }),
        err => err.code === 'INVALID_IMAGE_FORMAT'
      );
    });
  });

  describe('2. Kiểm thử luồng Lưu bản nháp (Save Draft Flow - D1 & D2 & AC-BLG-09)', () => {
    let savedDraftId = null;

    it('TC-DRAFT-01: Lưu bản nháp CHỈ CẦN DUY NHẤT TIÊU ĐỀ, không bắt buộc ảnh hay nội dung đầy đủ', async () => {
      const draftResult = await saveDraftPost({
        title: 'Ý tưởng bài viết mới về Docker Compose',
        ownerEmail: testOwnerEmail,
      }, { db });

      assert.ok(draftResult.id);
      assert.strictEqual(draftResult.status, 'draft');
      assert.strictEqual(draftResult.slug, 'y-tuong-bai-viet-moi-ve-docker-compose');
      assert.ok(draftResult.message.includes('Đã lưu bản nháp lúc'));

      savedDraftId = draftResult.id;
      insertedBlogIds.push(new ObjectId(savedDraftId));
    });

    it('TC-DRAFT-02: Báo lỗi khi lưu bản nháp mà không có tiêu đề', async () => {
      await assert.rejects(
        () => saveDraftPost({ title: '   ' }, { db }),
        err => err.code === 'MISSING_BLOG_TITLE'
      );
    });

    it('TC-DRAFT-03: Bài viết DRAFT KHÔNG ĐƯỢC PHÉP HIỂN THỊ trên trang /main/blog (Lưu ý cốt lõi của USER)', async () => {
      const publicList = await getBlogList({}, { db });
      const foundDraft = publicList.posts.find(p => p.id === savedDraftId || p.status === 'draft');
      assert.strictEqual(foundDraft, undefined, 'Bản nháp không được phép xuất hiện trên trang public blog!');
    });

    it('TC-DRAFT-04: Khách vãng lai không được phép xem chi tiết bài DRAFT nếu không có quyền preview', async () => {
      await assert.rejects(
        () => getBlogDetail(savedDraftId, { db }),
        err => err.code === 'DRAFT_NOT_PUBLIC'
      );

      // Nhưng chủ sở hữu hoặc người có link xem trước (preview=true) thì xem được
      const detail = await getBlogDetail(savedDraftId, { db, allowDraft: true, ownerEmail: testOwnerEmail });
      assert.strictEqual(detail.post.id, savedDraftId);
      assert.strictEqual(detail.post.status, 'draft');
      assert.strictEqual(detail.post.robots, 'noindex, nofollow');
    });

    it('TC-DRAFT-AUTH-01: Chủ bài lấy từ tài khoản DB; không thể giả owner khi tạo, sửa hoặc xem draft', async () => {
      const created = await saveDraftPost({
        title: 'Bản nháp thuộc tài khoản đã xác thực',
        ownerEmail: 'victim@example.com',
        owner_email: 'victim@example.com',
      }, { db, ownerUserId: testOwnerId, ownerEmail: testOwnerEmail });
      insertedBlogIds.push(new ObjectId(created.id));
      const saved = await getBlogCollection(db).findOne({ _id: new ObjectId(created.id) });
      assert.equal(saved.owner_user_id, testOwnerId);
      assert.equal(saved.owner_email, testOwnerEmail);

      await assert.rejects(
        () => saveBlogPost({ id: created.id, title: 'Bản nháp bị sửa bởi người khác', status: 'draft' }, {
          db,
          ownerUserId: otherOwnerId,
          ownerEmail: 'other_author_tester@thinkup.vn',
        }),
        error => error.status === 404 && error.code === 'BLOG_NOT_FOUND',
      );
      await assert.rejects(
        () => getBlogDetail(created.id, { db, allowDraft: true, ownerEmail: 'victim@example.com' }),
        error => error.status === 404 && error.code === 'DRAFT_NOT_PUBLIC',
      );
      const ownerView = await getBlogDetail(created.id, {
        db,
        ownerUserId: testOwnerId,
        ownerEmail: testOwnerEmail,
      });
      assert.equal(ownerView.post.id, created.id);
    });
  });

  describe('3. Kiểm thử luồng Đăng bài viết (Publish Flow - Luồng 5 & 6 & AC-BLG-08)', () => {
    let publishedPostId = null;

    it('TC-PUB-01: Chặn đăng bài khi thiếu thông tin bắt buộc (AC-BLG-08)', async () => {
      // 1. Tiêu đề dưới 5 ký tự
      await assert.rejects(
        () => saveBlogPost({ title: 'Abc', status: 'published' }, { db }),
        err => err.code === 'INVALID_TITLE_LENGTH'
      );

      // 2. Nội dung chưa đủ 50 từ
      await assert.rejects(
        () => saveBlogPost({
          title: 'Học Lập Trình Golang Nâng Cao',
          content: '<p>Nội dung quá ngắn dưới năm mươi từ.</p>',
          status: 'published',
        }, { db }),
        err => err.code === 'INSUFFICIENT_CONTENT_WORDS'
      );

      // 3. Thiếu danh mục
      const longContent = Array(60).fill('từ').join(' ');
      await assert.rejects(
        () => saveBlogPost({
          title: 'Học Lập Trình Golang Nâng Cao',
          content: longContent,
          status: 'published',
        }, { db }),
        err => err.code === 'MISSING_CATEGORY'
      );

      // 4. Thiếu ảnh đại diện
      await assert.rejects(
        () => saveBlogPost({
          title: 'Học Lập Trình Golang Nâng Cao',
          content: longContent,
          category: testCategoryA,
          status: 'published',
        }, { db }),
        err => err.code === 'MISSING_COVER_IMAGE'
      );
    });

    it('TC-PUB-02: Đăng bài viết thành công khi nhập đầy đủ thông tin hợp lệ (HTTP 201)', async () => {
      const validContent = `<p>${Array(60).fill('kiến thức').join(' ')}</p><script>alert("hacker")</script>`;
      const pubResult = await saveBlogPost({
        title: 'Học Lập Trình Golang Từ Cơ Bản Đến Nâng Cao 2026',
        content: validContent,
        category: testCategoryA,
        coverImage: '/assets/blog/golang-cover.jpg',
        summary: 'Khoá học Golang đầy đủ từ syntax đến microservices.',
        tags: ['Golang', 'Backend'],
        ownerEmail: testOwnerEmail,
        status: 'published',
        notify: false,
      }, { db, notify: false });

      assert.ok(pubResult.id);
      assert.strictEqual(pubResult.status, 'published');
      assert.strictEqual(pubResult.message, 'Xuất bản bài viết thành công!');

      publishedPostId = pubResult.id;
      insertedBlogIds.push(new ObjectId(publishedPostId));

      // Kiểm tra trong CSDL nội dung đã được làm sạch XSS
      const detail = await getBlogDetail(publishedPostId, { db });
      assert.strictEqual(detail.post.content.includes('<script>'), false);
      assert.strictEqual(detail.post.seoTitle, 'Học Lập Trình Golang Từ Cơ Bản Đến Nâng Cao 2026');
      assert.strictEqual(detail.post.robots, 'index, follow');
    });

    it('TC-PUB-03: Cập nhật bài viết đã xuất bản sẽ đổi trạng thái thành updated', async () => {
      const updateResult = await saveBlogPost({
        id: publishedPostId,
        title: 'Học Lập Trình Golang Từ Cơ Bản Đến Nâng Cao 2026 (Đã cập nhật)',
        content: `<p>${Array(60).fill('bổ sung').join(' ')}</p>`,
        category: testCategoryA,
        coverImage: '/assets/blog/golang-cover.jpg',
        status: 'published',
      }, { db });

      assert.strictEqual(updateResult.status, 'updated');
      assert.strictEqual(updateResult.message, 'Cập nhật bài viết thành công!');
    });
  });

  describe('4. Màn hình Quản lý bài viết cá nhân (/account/posts - 4 Tab trạng thái & Tìm kiếm)', () => {
    it('TC-MANAGE-01: getManageBlogList trả về số lượng thống kê theo 4 tab trạng thái (AC-BLG-02)', async () => {
      const manageRes = await getManageBlogList({
        ownerEmail: testOwnerEmail,
        tab: 'all',
      }, { db });

      assert.ok(manageRes.counts);
      assert.strictEqual(typeof manageRes.counts.all, 'number');
      assert.strictEqual(typeof manageRes.counts.draft, 'number');
      assert.strictEqual(typeof manageRes.counts.published, 'number');
      assert.strictEqual(typeof manageRes.counts.updated, 'number');
      assert.ok(manageRes.counts.all >= manageRes.counts.draft + manageRes.counts.published);
    });

    it('TC-MANAGE-02: Lọc theo tab Bản nháp (draft) chỉ trả về bài có status = draft', async () => {
      const draftTabRes = await getManageBlogList({
        ownerEmail: testOwnerEmail,
        tab: 'draft',
      }, { db });

      draftTabRes.posts.forEach(p => {
        assert.strictEqual(p.status, 'draft');
      });
    });

    it('TC-MANAGE-03: Lọc theo tab Đã đăng (published) chỉ trả về bài có status = published', async () => {
      const pubTabRes = await getManageBlogList({
        ownerEmail: testOwnerEmail,
        tab: 'published',
      }, { db });

      pubTabRes.posts.forEach(p => {
        assert.strictEqual(p.status, 'published');
      });
    });

    it('TC-MANAGE-04: Tìm kiếm theo tiêu đề hoặc đường dẫn URL (slug)', async () => {
      const searchRes = await getManageBlogList({
        ownerEmail: testOwnerEmail,
        search: 'clean-code-js',
      }, { db });

      assert.ok(searchRes.posts.length > 0);
      assert.ok(searchRes.posts.some(p => p.slug.includes('clean-code-js')));
    });

    it('TC-MANAGE-05: Trả về trạng thái trống khi không tìm thấy bài viết (AC-BLG-03)', async () => {
      const emptyRes = await getManageBlogList({
        ownerEmail: testOwnerEmail,
        search: 'tu_khoa_khong_bao_gio_ton_tai_123456789',
      }, { db });

      assert.strictEqual(emptyRes.posts.length, 0);
      assert.strictEqual(emptyRes.total, 0);
    });
  });

  describe('5. Bổ sung SEO cho các bài mẫu cũ trong CSDL (Yêu cầu của USER)', () => {
    it('TC-SEO-01: supplementExistingPostsSeo tự động kiểm tra và làm giàu dữ liệu SEO cho các bài mẫu', async () => {
      const result = await supplementExistingPostsSeo(db);
      assert.strictEqual(typeof result.updatedCount, 'number');

      // Xác minh bài mẫu cicd-intro đã có seoTitle và seoDescription đầy đủ
      const collection = getBlogCollection(db);
      const post = await collection.findOne({ slug: 'cicd-intro' });
      if (post) {
        assert.ok(post.seoTitle && post.seoTitle.length > 0);
        assert.ok(post.seoDescription && post.seoDescription.length > 0);
        assert.ok(Array.isArray(post.keywords) || typeof post.keywords === 'string');
      }
    });
  });

  describe('6. Kiểm thử các chức năng Blog công khai, Sidebar, Thống kê, Bản tin', () => {
    it('TC-LIST-01: getBlogList xuất đầy đủ các trường yêu cầu cho trang /main/blog', async () => {
      const result = await getBlogList({ category: testCategoryA }, { db });
      assert.ok(result.posts.length > 0);
      const first = result.posts[0];
      assert.ok(first.title);
      assert.ok(first.category);
      assert.ok(first.author);
      assert.ok(first.readTime);
      assert.ok(first.coverImage);
      assert.strictEqual(result.posts.every(p => p.status !== 'draft'), true);
    });

    it('TC-TOPIC-01: getPopularTopics thống kê số lượng bài viết của từng chủ đề', async () => {
      const topics = await getPopularTopics({ db, limit: 5 });
      assert.ok(Array.isArray(topics));
      assert.ok(topics.length > 0);
      assert.ok(topics[0].label);
      assert.strictEqual(typeof topics[0].count, 'number');
    });

    it('TC-VIEW-01: getMostViewedBlogPosts xuất tên bài blog và lượt xem sắp xếp giảm dần', async () => {
      const mostViewed = await getMostViewedBlogPosts({ db, limit: 3 });
      assert.ok(mostViewed.length > 0);
      assert.ok(mostViewed[0].views >= (mostViewed[1]?.views || 0));
    });

    it('TC-SIDEBAR-01: getBlogSidebar gộp cả chủ đề phổ biến và bài viết xem nhiều', async () => {
      const sidebar = await getBlogSidebar({ db });
      assert.ok(Array.isArray(sidebar.popularTopics));
      assert.ok(Array.isArray(sidebar.mostViewedArticles));
    });

    it('TC-SUB-01: subscribeNewsletter đăng ký email hợp lệ và lưu vào CSDL', async () => {
      const subRes = await subscribeNewsletter({ email: testSubEmail1 }, { db });
      assert.strictEqual(subRes.success, true);

      // Đăng ký lại cùng email -> thông báo đã đăng ký trước đó
      const repeatRes = await subscribeNewsletter({ email: testSubEmail1 }, { db });
      assert.strictEqual(repeatRes.alreadySubscribed, true);
    });

    it('TC-NOTIFY-01: notifySubscribersNewPost phát thông báo tới danh sách email nhận bản tin', async () => {
      const notifyRes = await notifySubscribersNewPost({
        id: 'test-id-123',
        title: 'Bài viết công nghệ mới phát hành',
        slug: 'bai-viet-cong-nghe-moi-phat-hanh',
        description: 'Mô tả bài viết công nghệ mới.',
      }, { db });

      assert.strictEqual(typeof notifyRes.notified, 'number');
      assert.strictEqual(typeof notifyRes.totalSubscribers, 'number');
    });

    it('TC-DELETE-01: deleteBlogPost xóa bài viết thành công', async () => {
      const tempPost = await saveDraftPost({
        title: 'Bài viết tạm thời để xóa',
        ownerEmail: testOwnerEmail,
      }, { db });

      const delRes = await deleteBlogPost(tempPost.id, { db, ownerEmail: testOwnerEmail });
      assert.strictEqual(delRes.success, true);
      assert.strictEqual(delRes.message, 'Xóa bài viết thành công!');
    });

    it('TC-ROUTER-01: createBlogRouter khởi tạo router Express độc lập chứa đầy đủ endpoint', () => {
      const router = createBlogRouter(express);
      assert.ok(router);
      assert.strictEqual(typeof router, 'function');
    });
  });

  describe('7. Kiểm thử Tương tác Hữu ích / Không hữu ích, Chia sẻ mạng xã hội & Thảo luận', () => {
    const testArticleSlug = 'huong-dan-lap-trinh-react-toan-tap-test';
    const testVoterEmail = 'voter_tester_1@thinkup.vn';

    it('TC-REACT-01: reactBlogPost ghi nhận đánh giá Hữu ích (like) và Không hữu ích (dislike) cho bài viết', async () => {
      // 1. Đánh giá hữu ích
      const likeRes = await reactBlogPost(testArticleSlug, {
        action: 'like',
        userEmail: testVoterEmail,
      }, { db });

      assert.strictEqual(likeRes.success, true);
      assert.strictEqual(likeRes.action, 'like');
      assert.ok(likeRes.likesCount >= 1);
      assert.ok(likeRes.message.includes('hữu ích'));

      // 2. Chuyển sang đánh giá không hữu ích (dislike)
      const dislikeRes = await reactBlogPost(testArticleSlug, {
        action: 'dislike',
        userEmail: testVoterEmail,
      }, { db });

      assert.strictEqual(dislikeRes.success, true);
      assert.strictEqual(dislikeRes.action, 'dislike');
      assert.ok(dislikeRes.dislikesCount >= 1);
    });

    it('TC-REACT-02: getBlogDetail lưu và hiển thị đúng trạng thái tương tác khi người dùng xem lại bài viết', async () => {
      const detail = await getBlogDetail(testArticleSlug, {
        db,
        userEmail: testVoterEmail,
      });

      assert.ok(detail.post);
      assert.strictEqual(detail.userInteraction, 'dislike', 'Người dùng mở lại bài viết phải lưu đúng trạng thái dislike trước đó');
      assert.ok(typeof detail.post.likesCount === 'number');
      assert.ok(typeof detail.post.dislikesCount === 'number');
    });

    it('TC-SHARE-01: generateShareLinks sinh đúng định dạng link chia sẻ Facebook, LinkedIn và Copy URL', () => {
      const links = generateShareLinks('bai-viet-chia-se-test');
      assert.ok(links.postUrl.includes('/blog/bai-viet-chia-se-test'));
      assert.ok(links.facebook.includes('facebook.com/sharer/sharer.php?u='));
      assert.ok(links.linkedin.includes('linkedin.com/sharing/share-offsite/?url='));
      assert.strictEqual(links.copyUrl, links.postUrl);
    });

    it('TC-COMMENT-01: Lấy danh sách bình luận thảo luận liên quan đến bài viết', async () => {
      const commentsRes = await getBlogComments(testArticleSlug, { db });
      assert.ok(Array.isArray(commentsRes.comments));
      assert.strictEqual(typeof commentsRes.total, 'number');
    });

    it('TC-COMMENT-02: addBlogComment thêm bình luận mới thành công và lọc sạch mã độc XSS', async () => {
      const commentRes = await addBlogComment(testArticleSlug, {
        content: '<p>Bài viết chia sẻ rất chi tiết, cảm ơn tác giả!</p><script>alert("hack")</script>',
        authorName: 'Học viên ABC',
        userEmail: testVoterEmail,
      }, { db });

      assert.ok(commentRes.comment);
      assert.ok(commentRes.comment.id);
      assert.strictEqual(commentRes.comment.content.includes('<script>'), false);
      assert.strictEqual(commentRes.comment.authorName, 'Học viên ABC');
      assert.ok(commentRes.message.includes('thành công'));

      // Sau khi thêm, danh sách bình luận của bài viết phải chứa bình luận mới này
      const updatedComments = await getBlogComments(testArticleSlug, { db });
      const found = updatedComments.comments.find(c => c.id === commentRes.comment.id);
      assert.ok(found, 'Bình luận mới phải xuất hiện trong phần thảo luận bài viết');
    });

    it('TC-COMMENT-03: addBlogComment báo lỗi khi nội dung bình luận để trống', async () => {
      await assert.rejects(
        () => addBlogComment(testArticleSlug, { content: '   ' }, { db }),
        err => err.code === 'MISSING_COMMENT_CONTENT'
      );
    });
  });
});
