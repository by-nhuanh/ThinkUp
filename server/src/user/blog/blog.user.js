import { ObjectId } from 'mongodb';
import { getMongoDb, sendEmail } from '../db.js';
import { renderNewsletterWelcomeEmail, renderNewBlogPostEmail } from '../email/email-templates.js';

// ─── 0. Xác Định Collection MongoDB ─────────────────────────────────────────

/**
 * Lấy collection bài viết blog chính từ cơ sở dữ liệu.
 * Ưu tiên 'blog_posts' chứa các bài mẫu hệ thống, hỗ trợ 'blogs'.
 *
 * @param {import('mongodb').Db} db
 * @returns {import('mongodb').Collection}
 */
export function getBlogCollection(db) {
  return db.collection('blog_posts');
}

// ─── 1. Các Hàm Tiện Ích (Helpers & XSS Sanitizer & SEO Utilities) ──────────

/**
 * Kiểm tra định dạng email hợp lệ.
 * @param {string} email
 * @returns {{ valid: boolean, message?: string, value?: string }}
 */
export function validateEmail(email) {
  if (!email || typeof email !== 'string') {
    return { valid: false, message: 'Vui lòng cung cấp địa chỉ email.' };
  }
  const trimmed = email.trim();
  if (/\s/.test(trimmed)) {
    return { valid: false, message: 'Địa chỉ email không được chứa khoảng trắng.' };
  }
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!regex.test(trimmed)) {
    return { valid: false, message: 'Địa chỉ email không đúng định dạng.' };
  }
  return { valid: true, value: trimmed.toLowerCase() };
}

/**
 * Chuyển đổi chuỗi tiếng Việt có dấu thành slug không dấu dùng cho URL.
 * Tuân thủ BR-BLOG-01: chữ thường, không dấu, ngăn cách bằng gạch nối -.
 *
 * @param {string} text
 * @returns {string}
 */
export function generateSlug(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

/**
 * Đếm số từ trong chuỗi văn bản (sau khi đã loại bỏ thẻ HTML).
 * @param {string} text
 * @returns {number}
 */
export function countWords(text) {
  if (!text || typeof text !== 'string') return 0;
  const clean = text.replace(/<[^>]*>/g, ' ').trim();
  if (!clean) return 0;
  return clean.split(/\s+/).filter(Boolean).length;
}

/**
 * Ước lượng thời gian đọc dựa trên độ dài nội dung (trung bình ~200 từ/phút).
 * @param {string} content
 * @returns {string} Ví dụ: "4 phút" hoặc "1 phút"
 */
export function calculateReadTime(content) {
  if (!content || typeof content !== 'string') return '3 phút';
  const words = countWords(content);
  const minutes = Math.max(1, Math.ceil(words / 200));
  return `${minutes} phút`;
}

/**
 * Bộ lọc làm sạch mã HTML chống tấn công XSS (Tuân thủ BR-BLOG-03 & AC-BLG-13).
 * Loại bỏ thẻ <script>, <iframe>, <object>, <embed>, <applet>, <meta>, <link>,
 * các thuộc tính bắt sự kiện nguy hại (onerror, onload, onclick...) và uri javascript:.
 *
 * @param {string} html
 * @returns {string} Chuỗi HTML đã được làm sạch an toàn
 */
export function sanitizeHtmlContent(html) {
  if (!html || typeof html !== 'string') return '';

  let sanitized = html;

  // 1. Loại bỏ triệt để các thẻ nguy hại kèm nội dung bên trong
  sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  sanitized = sanitized.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
  sanitized = sanitized.replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '');
  sanitized = sanitized.replace(/<embed\b[^>]*>/gi, '');
  sanitized = sanitized.replace(/<applet\b[^<]*(?:(?!<\/applet>)<[^<]*)*<\/applet>/gi, '');
  sanitized = sanitized.replace(/<meta\b[^>]*>/gi, '');
  sanitized = sanitized.replace(/<link\b[^>]*>/gi, '');
  sanitized = sanitized.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

  // 2. Loại bỏ các thuộc tính event handler nguy hiểm: onerror, onload, onclick, onmouseover...
  sanitized = sanitized.replace(/\son\w+\s*=\s*(["'][^"']*["']|[^\s>]+)/gi, '');

  // 3. Loại bỏ các protocol javascript:, vbscript:, data:text/html trong href hoặc src
  sanitized = sanitized.replace(/(href|src)\s*=\s*["']?\s*(javascript|vbscript|data:\s*text\/html):[^"'>\s]*["']?/gi, '$1="#"');

  return sanitized.trim();
}

/**
 * Đảm bảo tính duy nhất của slug trên toàn hệ thống (Tuân thủ BR-BLOG-01 & AC-BLG-05).
 * Nếu trùng, tự động thêm hậu tố số tăng dần (-1, -2, -3...).
 *
 * @param {import('mongodb').Db} db
 * @param {string} baseSlug
 * @param {string|ObjectId} [currentId] - ID của bài viết hiện tại (nếu đang cập nhật)
 * @returns {Promise<string>}
 */
export async function generateUniqueSlug(db, baseSlug, currentId = null) {
  const cleanSlug = generateSlug(baseSlug) || 'bai-viet';
  if (!db) return cleanSlug;

  const collection = getBlogCollection(db);
  const regex = new RegExp(`^${cleanSlug}(-[0-9]+)?$`, 'i');

  const filter = { slug: regex };
  if (currentId) {
    const objId = ObjectId.isValid(currentId) ? new ObjectId(currentId) : currentId;
    filter._id = { $ne: objId };
  }

  const existing = await collection.find(filter).project({ slug: 1 }).toArray();

  if (existing.length === 0) {
    return cleanSlug;
  }

  const existingSlugs = new Set(existing.map(p => p.slug));
  if (!existingSlugs.has(cleanSlug)) {
    return cleanSlug;
  }

  let counter = 1;
  while (existingSlugs.has(`${cleanSlug}-${counter}`)) {
    counter += 1;
  }
  return `${cleanSlug}-${counter}`;
}

/**
 * Sinh cấu hình tham số SEO và OpenGraph / Schema Markup chuẩn (BR-BLOG-02, BR-BLOG-04, AC-BLG-11, AC-BLG-12).
 *
 * @param {object} params
 * @param {string} params.title - Tiêu đề bài viết
 * @param {string} [params.summary] - Tóm tắt bài viết
 * @param {string} [params.content] - Nội dung bài viết
 * @param {string} [params.seoTitle] - Tiêu đề SEO tùy chọn (tối đa 60 ký tự)
 * @param {string} [params.seoDescription] - Mô tả SEO tùy chọn (tối đa 160 ký tự)
 * @param {string[]|string} [params.keywords] - Từ khóa tìm kiếm (tối đa 5 từ khóa)
 * @param {string} [params.coverImage] - Ảnh đại diện
 * @param {string} [params.status='published'] - Trạng thái bài viết
 * @param {string} [params.author='ThinkUp Team'] - Tác giả
 * @param {string} [params.slug=''] - Slug bài viết
 * @returns {object} Cấu trúc SEO và thẻ meta
 */
export function generateSeoMetadata(params = {}, options = {}) {
  const rawTitle = (params.title || '').trim();
  const rawSummary = (params.summary || params.description || '').trim();
  const rawContent = (params.content || '').replace(/<[^>]*>/g, ' ').trim();

  // 1. Tiêu đề SEO (<title>): tối đa 60 ký tự. Fallback: Tiêu đề bài viết
  let finalSeoTitle = (params.seoTitle || '').trim();
  if (!finalSeoTitle) {
    finalSeoTitle = rawTitle;
  }
  if (finalSeoTitle.length > 60) {
    finalSeoTitle = finalSeoTitle.slice(0, 60).trim();
  }

  // 2. Mô tả SEO (<meta name="description">): tối đa 160 ký tự. Fallback: Tóm tắt bài viết
  let finalSeoDescription = (params.seoDescription || '').trim();
  if (!finalSeoDescription) {
    finalSeoDescription = rawSummary || rawContent;
  }
  if (finalSeoDescription.length > 160) {
    finalSeoDescription = finalSeoDescription.slice(0, 160).trim();
  }

  // 3. Từ khóa tìm kiếm (Keywords): tối đa 5 từ khóa
  let finalKeywords = [];
  if (Array.isArray(params.keywords)) {
    finalKeywords = params.keywords.map(k => String(k).trim()).filter(Boolean);
  } else if (typeof params.keywords === 'string' && params.keywords.trim()) {
    try {
      const parsed = JSON.parse(params.keywords);
      if (Array.isArray(parsed)) {
        finalKeywords = parsed.map(k => String(k).trim()).filter(Boolean);
      } else {
        finalKeywords = [params.keywords.trim()];
      }
    } catch {
      finalKeywords = params.keywords.split(',').map(k => k.trim()).filter(Boolean);
    }
  }
  if (finalKeywords.length > 5) {
    finalKeywords = finalKeywords.slice(0, 5);
  }

  // 4. Thẻ Robots Meta (BR-BLOG-04 & AC-BLG-11, AC-BLG-12)
  const isDraft = String(params.status).toLowerCase() === 'draft';
  const robots = isDraft ? 'noindex, nofollow' : 'index, follow';

  // 5. Open Graph Meta Tags
  const coverImage = params.coverImage || '/assets/blog/article-1.jpg';
  const openGraph = {
    title: finalSeoTitle || rawTitle,
    description: finalSeoDescription || rawSummary,
    image: coverImage,
    type: 'article',
  };

  // 6. Schema.org JSON-LD Article Markup
  const schemaMarkup = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: finalSeoTitle || rawTitle,
    description: finalSeoDescription || rawSummary,
    image: coverImage,
    author: {
      '@type': 'Person',
      name: params.author || 'ThinkUp Team',
    },
    publisher: {
      '@type': 'Organization',
      name: 'ThinkUp',
      logo: {
        '@type': 'ImageObject',
        url: 'https://think-up-edu.vercel.app/assets/logo.png',
      },
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `${(options.clientUrl || process.env.CLIENT_URL || 'https://think-up-edu.vercel.app').split(',')[0].trim().replace(/\/+$/, '')}/blog/${params.slug || ''}`,
    },
  };

  return {
    seoTitle: finalSeoTitle,
    seoDescription: finalSeoDescription,
    keywords: finalKeywords,
    robots,
    openGraph,
    schemaMarkup,
  };
}

/**
 * Bóc tách Mục lục nội dung bài viết (Table of Contents - TOC).
 * @param {string} content - Nội dung bài viết HTML
 * @returns {Array<{ id: string, text: string, level: number }>}
 */
export function extractTableOfContents(content) {
  if (!content || typeof content !== 'string') return [];
  const toc = [];
  const seenIds = new Set();

  const headingRegex = /<h([1-6])([^>]*\sid\s*=\s*["']([^"']+)["'][^>]*)>([\s\S]*?)<\/h\1>/gi;
  let match;

  while ((match = headingRegex.exec(content)) !== null) {
    const level = Number.parseInt(match[1], 10);
    const explicitId = match[3]?.trim();
    const rawInnerHtml = match[4] || '';
    const cleanText = rawInnerHtml.replace(/<[^>]*>/g, '').trim();

    if (!cleanText || !explicitId) continue;

    let uniqueId = explicitId;
    let counter = 1;
    while (seenIds.has(uniqueId)) {
      uniqueId = `${explicitId}-${counter++}`;
    }
    seenIds.add(uniqueId);

    toc.push({ id: uniqueId, text: cleanText, level });
  }

  return toc;
}

/**
 * Giữ nguyên 100% nội dung gốc của người dùng.
 * @param {string} content
 * @returns {string}
 */
export function injectHeadingsWithIds(content) {
  return content || '';
}

/**
 * Chuẩn hóa một bản ghi blog từ MongoDB sang đối tượng dữ liệu API chuẩn.
 * Bổ sung đầy đủ các trường SEO, cấu hình xuất bản, OpenGraph và Schema Markup.
 *
 * @param {object} doc
 * @param {object} [authorUser=null]
 * @returns {object|null}
 */
export function formatBlogPost(doc, authorUser = null) {
  if (!doc) return null;
  const id = doc._id ? doc._id.toString() : String(doc.id || '');

  let dateStr = '';
  if (doc.published_at || doc.publishedDate || doc.date || doc.created_at) {
    const d = new Date(doc.published_at || doc.publishedDate || doc.date || doc.created_at);
    if (!Number.isNaN(d.getTime())) {
      dateStr = d.toISOString().split('T')[0];
    } else if (typeof doc.publishedDate === 'string') {
      dateStr = doc.publishedDate;
    }
  }

  const content = doc.content || '';
  const readTime = doc.read_time || doc.readTime || calculateReadTime(content);
  const category = doc.category || (Array.isArray(doc.topics) && doc.topics[0]) || 'Chung';
  const categoryId = doc.category_id || doc.categoryId || generateSlug(category);
  const authorName = doc.author || doc.author_name || authorUser?.full_name || 'ThinkUp Team';
  const authorAvatar = doc.author_avatar || doc.authorAvatar || authorUser?.avatar_url || authorUser?.avatar || null;
  const tableOfContents = doc.tableOfContents || extractTableOfContents(content);
  const hasToc = tableOfContents.length > 0;
  const status = (doc.status || 'published').toLowerCase();
  const summary = doc.summary || doc.description || '';
  const coverImage = doc.cover_image || doc.coverImage || '/assets/blog/article-1.jpg';
  const slug = doc.slug || generateSlug(doc.title || '');

  // Xử lý từ khóa tìm kiếm
  let keywords = [];
  if (Array.isArray(doc.keywords)) {
    keywords = doc.keywords;
  } else if (typeof doc.keywords === 'string' && doc.keywords.trim()) {
    try {
      const parsed = JSON.parse(doc.keywords);
      if (Array.isArray(parsed)) keywords = parsed;
      else keywords = [doc.keywords.trim()];
    } catch {
      keywords = doc.keywords.split(',').map(s => s.trim()).filter(Boolean);
    }
  }

  // Tự động bổ sung/fallback SEO nếu bản ghi thiếu (BR-BLOG-02)
  const seo = generateSeoMetadata({
    title: doc.title,
    summary,
    content,
    seoTitle: doc.seoTitle || doc.seo_title,
    seoDescription: doc.seoDescription || doc.seo_description,
    keywords,
    coverImage,
    status,
    author: authorName,
    slug,
  });

  return {
    id,
    title: doc.title || '',
    slug,
    description: summary,
    summary,
    content,
    category,
    categoryId,
    author: authorName,
    authorAvatar,
    date: dateStr,
    publishedDate: dateStr,
    readTime,
    coverImage,
    tags: Array.isArray(doc.tags) ? doc.tags : (typeof doc.tags === 'string' && doc.tags ? doc.tags.split(',').map(t => t.trim()) : []),
    views: typeof doc.views === 'number' ? doc.views : Number.parseInt(doc.views, 10) || 0,
    status,
    topics: Array.isArray(doc.topics) ? doc.topics : (typeof doc.topics === 'string' && doc.topics.startsWith('[') ? JSON.parse(doc.topics) : [category]),
    ownerEmail: (doc.owner_email || doc.ownerEmail || '').toLowerCase(),
    hasToc,
    tableOfContents,
    updatedAt: doc.updated_at ? new Date(doc.updated_at).toISOString() : undefined,
    // Các trường đặc tả quản lý & soạn thảo bài viết mới (SPEC-BLOG-MGT-01)
    featuredContent: doc.featuredContent || doc.featured_content || '',
    commentsEnabled: doc.commentsEnabled ?? doc.comments_enabled ?? doc.allowComments ?? true,
    pinned: Boolean(doc.pinned ?? doc.isPinned ?? false),
    showOnHome: Boolean(doc.showOnHome ?? doc.show_on_home ?? false),
    // Tham số SEO chuẩn quốc tế
    seoTitle: seo.seoTitle,
    seoDescription: seo.seoDescription,
    keywords: seo.keywords,
    robots: seo.robots,
    openGraph: seo.openGraph,
    schemaMarkup: seo.schemaMarkup,
  };
}

/**
 * Bổ sung trường SEO cho các bài mẫu trong CSDL nếu chưa có (yêu cầu của người dùng).
 * Cập nhật trực tiếp vào MongoDB để các bài mẫu có đầy đủ seoTitle, seoDescription, keywords.
 *
 * @param {import('mongodb').Db} db
 * @returns {Promise<{ updatedCount: number }>}
 */
export async function supplementExistingPostsSeo(db) {
  if (!db) return { updatedCount: 0 };
  const collection = getBlogCollection(db);
  const posts = await collection.find({
    $or: [
      { seoTitle: { $exists: false } },
      { seoTitle: '' },
      { seoDescription: { $exists: false } },
      { seoDescription: '' },
    ],
  }).toArray();

  let updatedCount = 0;
  for (const post of posts) {
    const rawTitle = post.title || '';
    const rawDesc = post.description || post.summary || (post.content ? post.content.replace(/<[^>]*>/g, ' ').trim() : '');
    const seoTitle = (post.seoTitle && post.seoTitle.trim()) || rawTitle.slice(0, 60).trim();
    const seoDescription = (post.seoDescription && post.seoDescription.trim()) || rawDesc.slice(0, 160).trim();

    let keywords = [];
    if (Array.isArray(post.keywords)) {
      keywords = post.keywords;
    } else if (typeof post.keywords === 'string' && post.keywords.trim()) {
      try {
        const parsed = JSON.parse(post.keywords);
        if (Array.isArray(parsed)) keywords = parsed;
        else keywords = [post.keywords.trim()];
      } catch {
        keywords = post.keywords.split(',').map(s => s.trim()).filter(Boolean);
      }
    }
    if (keywords.length === 0) {
      const cat = post.category ? post.category.toLowerCase() : 'cong nghe';
      keywords = [cat, 'thinkup', 'lap trinh'];
    }
    keywords = keywords.slice(0, 5);

    // Chuẩn hóa trường views sang số nguyên (Number) để tránh lỗi MongoServerError $inc
    const numViews = typeof post.views === 'number' ? post.views : (Number.parseInt(post.views, 10) || 0);

    await collection.updateOne(
      { _id: post._id },
      {
        $set: {
          seoTitle,
          seoDescription,
          keywords,
          seo_title: seoTitle,
          seo_description: seoDescription,
          views: numViews,
        },
      }
    );
    updatedCount += 1;
  }

  // Quét thêm bất kỳ bài viết nào trong DB mà views vẫn còn là chuỗi (string)
  try {
    const stringViewPosts = await collection.find({ views: { $type: 'string' } }).toArray();
    for (const p of stringViewPosts) {
      const numViews = Number.parseInt(p.views, 10) || 0;
      await collection.updateOne({ _id: p._id }, { $set: { views: numViews } });
      updatedCount += 1;
    }
  } catch {
    // Không làm gián đoạn nếu collection chưa sẵn sàng
  }

  return { updatedCount };
}

// ─── 2. Hàm Truy Xuất Danh Sách Bài Blog Công Khai (/main/blog) ─────────────

/**
 * Truy xuất danh sách bài blog công khai trên trang /main/blog.
 * QUY TẮC BẮT BUỘC (LƯU Ý CỦA USER):
 * - BẢN NHÁP (status = 'draft') TUYỆT ĐỐI KHÔNG ĐƯỢC PUBLIC LÊN /main/blog!
 * - Trang công khai chỉ hiển thị bài có trạng thái 'published' hoặc 'updated'.
 *
 * @param {object} query - Các tham số truy vấn
 * @param {string} [query.category] - Lọc theo chủ đề/category
 * @param {string} [query.topic] - Lọc theo chủ đề phụ/topic
 * @param {string} [query.search] - Từ khóa tìm kiếm trong tiêu đề/mô tả/nội dung
 * @param {string} [query.ownerEmail] - Lọc bài của tác giả cụ thể
 * @param {number|string} [query.page=1] - Số trang hiện tại
 * @param {number|string} [query.limit=6] - Số lượng bài mỗi trang
 * @param {object} [options] - Tùy chọn kiểm thử
 * @returns {Promise<{ posts: object[], total: number, page: number, limit: number, hasMore: boolean }>}
 */
export async function getBlogList(query = {}, options = {}) {
  const db = options.db || await getMongoDb();
  const collection = getBlogCollection(db);

  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.max(1, Math.min(50, Number.parseInt(query.limit, 10) || 6));
  const skip = (page - 1) * limit;

  const filter = {};

  // QUY TẮC: /main/blog CHỈ HIỂN THỊ CÁC BÀI ĐÃ XUẤT BẢN HOẶC ĐÃ CẬP NHẬT.
  // Tuyệt đối không để lọt bài 'draft' ra ngoài công chúng.
  filter.status = { $in: ['published', 'updated'] };

  if (query.category && query.category !== 'all' && query.category !== 'Tất cả') {
    const catRegex = new RegExp(`^${query.category.trim()}$`, 'i');
    filter.$or = [
      { category: catRegex },
      { category_id: query.category.trim().toLowerCase() },
      { categoryId: query.category.trim().toLowerCase() },
      { topics: { $in: [query.category.trim()] } },
    ];
  }

  if (query.topic) {
    const topicRegex = new RegExp(`^${query.topic.trim()}$`, 'i');
    filter.topics = { $elemMatch: { $regex: topicRegex } };
  }

  if (query.ownerEmail) {
    filter.$or = [
      { owner_email: query.ownerEmail.trim().toLowerCase() },
      { ownerEmail: query.ownerEmail.trim().toLowerCase() },
    ];
  }

  if (query.search && typeof query.search === 'string') {
    const sanitizedSearch = query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (sanitizedSearch) {
      const searchRegex = new RegExp(sanitizedSearch, 'i');
      const searchConditions = [
        { title: searchRegex },
        { slug: searchRegex },
        { description: searchRegex },
        { summary: searchRegex },
        { tags: { $in: [searchRegex] } },
      ];
      if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, { $or: searchConditions }];
        delete filter.$or;
      } else {
        filter.$or = searchConditions;
      }
    }
  }

  const [total, rawPosts] = await Promise.all([
    collection.countDocuments(filter),
    collection
      .find(filter)
      .sort({ published_at: -1, created_at: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .toArray(),
  ]);

  const posts = rawPosts.map(doc => formatBlogPost(doc));
  const hasMore = skip + posts.length < total;

  return {
    posts,
    total,
    page,
    limit,
    hasMore,
  };
}

// ─── 3. Hàm Quản Lý Bài Viết Cá Nhân (/account/posts) ────────────────────────

/**
 * Truy xuất danh sách bài viết trong phân hệ Quản lý bài viết cá nhân (/account/posts).
 * Hỗ trợ 4 tab trạng thái: [Tất cả], [Bản nháp], [Đã đăng], [Đã cập nhật].
 * Tìm kiếm theo tiêu đề hoặc đường dẫn URL (slug).
 * Tính số lượng bài viết của từng tab để hiển thị badge.
 *
 * @param {object} query
 * @param {string} [query.ownerEmail] - Email của người dùng đăng nhập
 * @param {string} [query.userId] - ID của người dùng đăng nhập
 * @param {string} [query.tab='all'] - 'all' | 'draft' | 'published' | 'updated'
 * @param {string} [query.status] - Alias cho query.tab
 * @param {string} [query.search] - Tìm kiếm theo tiêu đề hoặc đường dẫn URL
 * @param {number|string} [query.page=1]
 * @param {number|string} [query.limit=10]
 * @param {object} [options]
 * @returns {Promise<{ posts: object[], total: number, page: number, limit: number, hasMore: boolean, counts: object }>}
 */
export async function getManageBlogList(query = {}, options = {}) {
  const db = options.db || await getMongoDb();
  const collection = getBlogCollection(db);

  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.max(1, Math.min(50, Number.parseInt(query.limit, 10) || 10));
  const skip = (page - 1) * limit;

  // Lọc chính xác theo chủ sở hữu bài viết (chỉ bài do chính người dùng tạo)
  const baseOwnerFilter = {};
  const ownerEmail = (query.ownerEmail || options.ownerEmail || '').trim().toLowerCase();
  if (ownerEmail) {
    baseOwnerFilter.$or = [
      { owner_email: ownerEmail },
      { ownerEmail: ownerEmail },
    ];
  }

  // 1. Thống kê số lượng bài theo 4 tab trạng thái (Counts badge cho giao diện)
  const [countAll, countDraft, countPublished, countUpdated] = await Promise.all([
    collection.countDocuments({ ...baseOwnerFilter }),
    collection.countDocuments({ ...baseOwnerFilter, status: 'draft' }),
    collection.countDocuments({ ...baseOwnerFilter, status: 'published' }),
    collection.countDocuments({ ...baseOwnerFilter, status: 'updated' }),
  ]);

  const counts = {
    all: countAll,
    draft: countDraft,
    published: countPublished,
    updated: countUpdated,
  };

  // 2. Xây dựng điều kiện lọc theo tab đã chọn (AC-BLG-02)
  const activeTab = (query.tab || query.status || 'all').toLowerCase();
  const filter = { ...baseOwnerFilter };

  if (activeTab === 'draft') {
    filter.status = 'draft';
  } else if (activeTab === 'published') {
    filter.status = 'published';
  } else if (activeTab === 'updated') {
    filter.status = 'updated';
  }
  // Nếu activeTab === 'all' -> lấy tất cả các trạng thái

  // 3. Tìm kiếm theo tiêu đề hoặc đường dẫn URL (slug) (Màn hình 1 ô tìm kiếm)
  if (query.search && typeof query.search === 'string') {
    const sanitizedSearch = query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (sanitizedSearch) {
      const searchRegex = new RegExp(sanitizedSearch, 'i');
      const searchConditions = [
        { title: searchRegex },
        { slug: searchRegex },
      ];
      if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, { $or: searchConditions }];
        delete filter.$or;
      } else {
        filter.$or = searchConditions;
      }
    }
  }

  const [total, rawPosts] = await Promise.all([
    collection.countDocuments(filter),
    collection
      .find(filter)
      .sort({ updated_at: -1, created_at: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .toArray(),
  ]);

  const posts = rawPosts.map(doc => formatBlogPost(doc));
  const hasMore = skip + posts.length < total;

  return {
    posts,
    total,
    page,
    limit,
    hasMore,
    counts,
    currentTab: activeTab,
  };
}

// ─── 4. Hàm Lưu Bài Viết: Đăng Bài hoặc Lưu Bản Nháp ────────────────────────

/**
 * Lưu bài viết: Hỗ trợ cả 2 luồng:
 * 1. Đăng bài viết (Publish Flow): status = 'published' (hoặc 'updated').
 *    Bắt buộc validate đầy đủ:
 *    - Tiêu đề (5 <= ký tự <= 100)
 *    - Nội dung (tối thiểu 50 từ)
 *    - Danh mục (ít nhất 1 danh mục)
 *    - Ảnh đại diện (bắt buộc, <= 2MB)
 *    - Tóm tắt (tối đa 160 ký tự)
 * 2. Lưu bản nháp (Save Draft Flow): status = 'draft'.
 *    CHỈ KIỂM TRA DUY NHẤT TIÊU ĐỀ (không bắt buộc ảnh hay nội dung đầy đủ).
 *
 * @param {object} blogData
 * @param {object} [options]
 * @returns {Promise<{ id: string, slug: string, status: string, message: string, notifiedSubscribers?: number }>}
 */
export async function saveBlogPost(blogData = {}, options = {}) {
  if (!blogData || typeof blogData !== 'object') {
    const err = new Error('Dữ liệu bài viết không hợp lệ.');
    err.status = 400;
    err.code = 'INVALID_BLOG_DATA';
    throw err;
  }

  const rawTitle = (blogData.title || '').trim();
  const rawStatus = (blogData.status || (options.isDraft ? 'draft' : 'published')).toLowerCase();
  const isDraft = rawStatus === 'draft';

  // ── Kiểm tra điều kiện Tiêu đề (Áp dụng cho cả Lưu nháp & Đăng bài) ──
  if (!rawTitle) {
    const err = new Error('Tiêu đề bài viết là bắt buộc.');
    err.status = 400;
    err.field = 'title';
    err.code = 'MISSING_BLOG_TITLE';
    throw err;
  }

  const db = options.db || await getMongoDb();
  const collection = getBlogCollection(db);

  let rawContent = blogData.content || '';
  let cleanContent = sanitizeHtmlContent(rawContent); // Lọc mã độc XSS theo BR-BLOG-03
  let rawCategory = blogData.category || (Array.isArray(blogData.categories) && blogData.categories[0]) || (Array.isArray(blogData.topics) && blogData.topics[0]) || '';
  let summary = (blogData.summary || blogData.description || '').trim();
  let coverImage = blogData.coverImage || blogData.cover_image || '';
  const now = new Date();

  // ── Kiểm tra điều kiện khi ĐĂNG BÀI (Publish Validation - AC-BLG-07, AC-BLG-08) ──
  if (!isDraft) {
    // 1. Giới hạn độ dài Tiêu đề: 5 <= ký tự <= 100 (AC-BLG-07)
    if (rawTitle.length < 5 || rawTitle.length > 100) {
      const err = new Error('Tiêu đề bài viết phải từ 5 đến 100 ký tự.');
      err.status = 400;
      err.field = 'title';
      err.code = 'INVALID_TITLE_LENGTH';
      throw err;
    }

    // 2. Nội dung: Tối thiểu 50 từ (PDF Page 2 & AC-BLG-08)
    const wordCount = countWords(cleanContent);
    if (!cleanContent || wordCount < 50) {
      const err = new Error(`Nội dung bài viết bắt buộc tối thiểu 50 từ khi xuất bản (hiện có ${wordCount} từ).`);
      err.status = 400;
      err.field = 'content';
      err.code = 'INSUFFICIENT_CONTENT_WORDS';
      throw err;
    }

    // 3. Danh mục: Bắt buộc chọn ít nhất 01 danh mục (PDF Page 3 & AC-BLG-08)
    if (!rawCategory) {
      const err = new Error('Vui lòng chọn ít nhất 01 danh mục cho bài viết.');
      err.status = 400;
      err.field = 'category';
      err.code = 'MISSING_CATEGORY';
      throw err;
    }

    // 4. Ảnh đại diện (Thumbnail): Bắt buộc khi Đăng bài (PDF Page 3 & AC-BLG-08)
    if (!coverImage) {
      const err = new Error('Ảnh đại diện là bắt buộc khi xuất bản bài viết.');
      err.status = 400;
      err.field = 'coverImage';
      err.code = 'MISSING_COVER_IMAGE';
      throw err;
    }

    // 5. Tóm tắt bài viết: Bắt buộc khi Đăng bài, tối đa 160 ký tự (PDF Page 3 & AC-BLG-07)
    if (!summary) {
      // Tự trích xuất 160 ký tự đầu từ nội dung nếu để trống
      summary = cleanContent.replace(/<[^>]*>/g, ' ').trim().slice(0, 160);
    }
    if (summary.length > 160) {
      summary = summary.slice(0, 160).trim();
    }
  }

  // ── Sinh slug duy nhất toàn hệ thống (BR-BLOG-01) ──
  const targetId = blogData.id || blogData._id;
  const desiredSlug = blogData.slug ? generateSlug(blogData.slug) : generateSlug(rawTitle);
  const uniqueSlug = await generateUniqueSlug(db, desiredSlug, targetId);

  // ── Tính toán SEO Metadata với cơ chế Fallback thông minh (BR-BLOG-02) ──
  const seo = generateSeoMetadata({
    title: rawTitle,
    summary,
    content: cleanContent,
    seoTitle: blogData.seoTitle || blogData.seo_title,
    seoDescription: blogData.seoDescription || blogData.seo_description,
    keywords: blogData.keywords || blogData.seoKeywords || blogData.seo_keywords,
    coverImage: coverImage || '/assets/blog/article-1.jpg',
    status: rawStatus,
    author: blogData.author || 'ThinkUp Team',
    slug: uniqueSlug,
  });

  const categoryId = generateSlug(rawCategory) || 'chung';
  const readTime = blogData.readTime || calculateReadTime(cleanContent);
  const ownerEmail = (blogData.ownerEmail || blogData.owner_email || options.ownerEmail || '').toLowerCase();
  const authorName = blogData.author || blogData.author_name || 'ThinkUp Team';
  const authorAvatar = blogData.authorAvatar || blogData.author_avatar || null;
  const featuredContent = (blogData.featuredContent || blogData.featured_content || '').slice(0, 200);
  const commentsEnabled = blogData.commentsEnabled ?? blogData.comments_enabled ?? blogData.allowComments ?? true;
  const pinned = Boolean(blogData.pinned ?? blogData.isPinned ?? false);
  const showOnHome = Boolean(blogData.showOnHome ?? blogData.show_on_home ?? false);
  const tags = Array.isArray(blogData.tags) ? blogData.tags.slice(0, 10) : [];
  const contentImages = Array.isArray(blogData.contentImages) ? blogData.contentImages : [];

  let postId = targetId;

  if (postId) {
    // ── Cập nhật bài viết hiện có ──
    const existingObjId = ObjectId.isValid(postId) ? new ObjectId(postId) : postId;
    const existingPost = await collection.findOne({ _id: existingObjId });

    // Nếu bài viết đã từng publish trước đó và cập nhật lại -> chuyển thành 'updated'
    let finalStatus = rawStatus;
    if (!isDraft && existingPost && (existingPost.status === 'published' || existingPost.status === 'updated')) {
      finalStatus = 'updated';
    }

    const updateDoc = {
      title: rawTitle,
      slug: uniqueSlug,
      description: summary,
      summary,
      content: cleanContent,
      category: rawCategory,
      category_id: categoryId,
      categoryId,
      author: authorName,
      read_time: readTime,
      readTime,
      cover_image: coverImage || existingPost?.cover_image || existingPost?.coverImage || '/assets/blog/article-1.jpg',
      coverImage: coverImage || existingPost?.coverImage || existingPost?.cover_image || '/assets/blog/article-1.jpg',
      tags,
      status: finalStatus,
      updated_at: now,
      featuredContent,
      commentsEnabled,
      pinned,
      showOnHome,
      seoTitle: seo.seoTitle,
      seoDescription: seo.seoDescription,
      keywords: seo.keywords,
      contentImages,
    };

    if (authorAvatar) updateDoc.author_avatar = authorAvatar;
    if (ownerEmail) {
      updateDoc.owner_email = ownerEmail;
      updateDoc.ownerEmail = ownerEmail;
    }

    await collection.updateOne({ _id: existingObjId }, { $set: updateDoc });

    return {
      id: String(postId),
      slug: uniqueSlug,
      status: finalStatus,
      message: isDraft
        ? `Đã lưu bản nháp lúc ${now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`
        : 'Cập nhật bài viết thành công!',
    };
  }

  // ── Tạo mới bài viết ──
  const insertDoc = {
    title: rawTitle,
    slug: uniqueSlug,
    description: summary,
    summary,
    content: cleanContent,
    category: rawCategory,
    category_id: categoryId,
    categoryId,
    author: authorName,
    author_avatar: authorAvatar,
    read_time: readTime,
    readTime,
    cover_image: coverImage || '/assets/blog/article-1.jpg',
    coverImage: coverImage || '/assets/blog/article-1.jpg',
    tags,
    views: 0,
    status: rawStatus,
    created_at: now,
    updated_at: now,
    owner_email: ownerEmail,
    ownerEmail,
    featuredContent,
    commentsEnabled,
    pinned,
    showOnHome,
    seoTitle: seo.seoTitle,
    seoDescription: seo.seoDescription,
    keywords: seo.keywords,
    contentImages,
  };

  if (!isDraft) {
    insertDoc.published_at = now;
    insertDoc.publishedDate = now.toISOString().split('T')[0];
  }

  const insertResult = await collection.insertOne(insertDoc);
  postId = insertResult.insertedId.toString();

  // Tự động phát thông báo bản tin nếu bài viết mới được xuất bản ngay
  let notifyCount = 0;
  if (!isDraft && options.notify !== false) {
    try {
      const notifyRes = await notifySubscribersNewPost({
        id: postId,
        title: rawTitle,
        slug: uniqueSlug,
        description: summary,
        category: rawCategory,
        coverImage,
        readTime,
      }, options);
      notifyCount = notifyRes.notified;
    } catch {
      // Bỏ qua lỗi gửi email để không cản trở tiến trình lưu bài viết
    }
  }

  return {
    id: postId,
    slug: uniqueSlug,
    status: rawStatus,
    notifiedSubscribers: notifyCount,
    message: isDraft
      ? `Đã lưu bản nháp lúc ${now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`
      : 'Xuất bản bài viết thành công!',
  };
}

/**
 * Lưu bản nháp bài viết (Save Draft Flow - D1 & D2).
 * CHỈ KIỂM TRA DUY NHẤT TIÊU ĐỀ.
 *
 * @param {object} draftData
 * @param {object} [options]
 * @returns {Promise<{ id: string, slug: string, status: 'draft', message: string }>}
 */
export async function saveDraftPost(draftData = {}, options = {}) {
  return saveBlogPost({ ...draftData, status: 'draft' }, { ...options, isDraft: true });
}

// ─── 5. Hàm Tương Tác Hữu Ích / Không Hữu Ích (Reactions - Like/Dislike) ────

/**
 * Xử lý tương tác đánh giá "Hữu ích" (like) và "Không hữu ích" (dislike) cho tác giả bài viết.
 * Lưu trữ trạng thái tương tác vào collection 'blog_post_likes'.
 * Tự động cập nhật tổng số lượt hữu ích/không hữu ích vào bài viết để tác giả theo dõi,
 * và duy trì trạng thái để khi người dùng mở lại bài viết sẽ hiển thị đúng lựa chọn trước đó.
 *
 * @param {string} idOrSlug - ID hoặc Slug của bài viết
 * @param {object} reactionData
 * @param {string} [reactionData.action] - 'like' | 'dislike' | 'none'
 * @param {string} [reactionData.type] - Alias: 'helpful' | 'unhelpful' | 'none'
 * @param {string} [reactionData.userEmail] - Email của người dùng
 * @param {string} [reactionData.userId] - ID của người dùng
 * @param {object} [options]
 * @returns {Promise<{ success: boolean, action: string, userInteraction: string, likesCount: number, dislikesCount: number, helpfulCount: number, unhelpfulCount: number, message: string }>}
 */
export async function reactBlogPost(idOrSlug, reactionData = {}, options = {}) {
  if (!idOrSlug) {
    const err = new Error('Mã bài viết không hợp lệ.');
    err.status = 400;
    throw err;
  }

  const db = options.db || await getMongoDb();
  const postColl = getBlogCollection(db);
  const likesColl = db.collection('blog_post_likes');

  // Tìm bài viết theo ID hoặc slug
  const queryConditions = [{ slug: idOrSlug.trim() }];
  if (ObjectId.isValid(idOrSlug.trim())) {
    queryConditions.push({ _id: new ObjectId(idOrSlug.trim()) });
  }
  const post = await postColl.findOne({ $or: queryConditions });
  if (!post) {
    const err = new Error('Bài viết blog không tồn tại.');
    err.status = 404;
    err.code = 'BLOG_NOT_FOUND';
    throw err;
  }

  const postId = post._id.toString();

  // Chuẩn hóa hành động tương tác: 'like' (hữu ích) hoặc 'dislike' (không hữu ích) hoặc 'none'
  const rawAction = (reactionData.action || reactionData.type || 'like').toLowerCase();
  let normalizedAction = 'like';
  if (rawAction === 'helpful' || rawAction === 'like') {
    normalizedAction = 'like';
  } else if (rawAction === 'unhelpful' || rawAction === 'dislike') {
    normalizedAction = 'dislike';
  } else if (rawAction === 'none' || rawAction === 'neutral' || rawAction === 'remove') {
    normalizedAction = 'none';
  }

  // Xác định định danh người dùng tương tác
  const userEmail = (reactionData.userEmail || options.userEmail || options.user?.email || '').toLowerCase().trim();
  const userId = String(reactionData.userId || options.userId || options.user?.id || userEmail || 'anonymous').trim();

  const now = new Date();
  const userFilter = {
    postId,
    $or: [
      { userEmail: userEmail || '__no_email__' },
      { userId },
    ],
  };

  const existingReaction = await likesColl.findOne(userFilter);

  if (normalizedAction === 'none') {
    if (existingReaction) {
      await likesColl.deleteOne({ _id: existingReaction._id });
    }
  } else if (existingReaction) {
    await likesColl.updateOne(
      { _id: existingReaction._id },
      { $set: { action: normalizedAction, updatedAt: now } }
    );
  } else {
    await likesColl.insertOne({
      postId,
      userId,
      userEmail,
      action: normalizedAction,
      createdAt: now,
      updatedAt: now,
    });
  }

  // Cập nhật lại số liệu thống kê hữu ích / không hữu ích vào bài viết
  const [likesCount, dislikesCount] = await Promise.all([
    likesColl.countDocuments({ postId, action: 'like' }),
    likesColl.countDocuments({ postId, action: 'dislike' }),
  ]);

  await postColl.updateOne(
    { _id: post._id },
    {
      $set: {
        likesCount,
        dislikesCount,
        helpfulCount: likesCount,
        unhelpfulCount: dislikesCount,
        updated_at: now,
      },
    }
  );

  return {
    success: true,
    action: normalizedAction,
    userInteraction: normalizedAction,
    likesCount,
    dislikesCount,
    helpfulCount: likesCount,
    unhelpfulCount: dislikesCount,
    message: normalizedAction === 'like'
      ? 'Bạn đã đánh giá bài viết này hữu ích!'
      : normalizedAction === 'dislike'
        ? 'Bạn đã đánh giá bài viết này chưa hữu ích.'
        : 'Đã hủy đánh giá bài viết.',
  };
}

// ─── 5b. Xử Lý Đường Dẫn Chia Sẻ Mạng Xã Hội (Facebook, LinkedIn, Copy) ──────

/**
 * Sinh các đường dẫn chia sẻ bài viết cho Facebook, LinkedIn và link sao chép vào bộ nhớ tạm.
 *
 * @param {string} slugOrId
 * @param {object} [options]
 * @returns {{ postUrl: string, facebook: string, linkedin: string, copyUrl: string }}
 */
export function generateShareLinks(slugOrId, options = {}) {
  const rawClientUrl = options.clientUrl || process.env.CLIENT_URL || 'https://think-up-edu.vercel.app';
  const clientUrl = rawClientUrl.split(',')[0].trim().replace(/\/+$/, '');
  const cleanSlug = encodeURIComponent(String(slugOrId || '').trim());
  const postUrl = `${clientUrl}/blog/${cleanSlug}`;

  return {
    postUrl,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(postUrl)}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(postUrl)}`,
    copyUrl: postUrl,
  };
}

// ─── 5c. Thảo Luận & Bình Luận Bài Viết (Comments & Discussions) ────────────

/**
 * Chuẩn hóa một bản ghi bình luận.
 * @param {object} doc
 * @returns {object|null}
 */
export function formatBlogComment(doc) {
  if (!doc) return null;
  const id = doc._id ? doc._id.toString() : String(doc.id || '');
  const likesCount = typeof doc.likesCount === 'number'
    ? doc.likesCount
    : Number.parseInt(doc.likesCount, 10) || 0;

  return {
    id,
    postId: String(doc.postId || ''),
    authorName: doc.authorName || doc.author_name || 'Người dùng ẩn danh',
    authorAvatar: doc.authorAvatar || doc.author_avatar || '/assets/blog/default-avatar.jpg',
    content: doc.content || '',
    likesCount,
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : new Date().toISOString(),
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : undefined,
  };
}

/**
 * Lấy danh sách các bình luận liên quan đến một bài viết cụ thể.
 * @param {string} idOrSlug - ID hoặc Slug của bài viết
 * @param {object} [options]
 * @returns {Promise<{ comments: object[], total: number }>}
 */
export async function getBlogComments(idOrSlug, options = {}) {
  if (!idOrSlug) {
    return { comments: [], total: 0 };
  }

  const db = options.db || await getMongoDb();
  const postColl = getBlogCollection(db);
  const commentColl = db.collection('blog_comments');

  // Tìm bài viết để lấy tất cả các khóa định danh liên quan (id, _id, slug)
  const queryConditions = [{ slug: idOrSlug.trim() }];
  if (ObjectId.isValid(idOrSlug.trim())) {
    queryConditions.push({ _id: new ObjectId(idOrSlug.trim()) });
  }
  const post = await postColl.findOne({ $or: queryConditions });

  const possibleIds = [idOrSlug.trim()];
  if (post) {
    possibleIds.push(post._id.toString());
    if (post.id) possibleIds.push(String(post.id));
    if (post.slug) possibleIds.push(post.slug);
  }

  const rawComments = await commentColl
    .find({ postId: { $in: possibleIds } })
    .sort({ createdAt: -1, _id: -1 })
    .toArray();

  const comments = rawComments.map(formatBlogComment);
  return {
    comments,
    total: comments.length,
  };
}

/**
 * Thêm một bình luận mới vào bài viết thảo luận.
 * Lọc sạch mã độc XSS trước khi lưu trữ.
 *
 * @param {string} idOrSlug - ID hoặc Slug của bài viết
 * @param {object} commentData
 * @param {string} commentData.content - Nội dung bình luận
 * @param {string} [commentData.authorName] - Tên người bình luận
 * @param {string} [commentData.authorAvatar] - Ảnh đại diện người bình luận
 * @param {object} [options]
 * @returns {Promise<{ comment: object, message: string }>}
 */
export async function addBlogComment(idOrSlug, commentData = {}, options = {}) {
  const rawContent = (commentData.content || '').trim();
  if (!rawContent) {
    const err = new Error('Nội dung bình luận không được để trống.');
    err.status = 400;
    err.code = 'MISSING_COMMENT_CONTENT';
    throw err;
  }

  const cleanContent = sanitizeHtmlContent(rawContent);
  const db = options.db || await getMongoDb();
  const postColl = getBlogCollection(db);
  const commentColl = db.collection('blog_comments');

  const queryConditions = [{ slug: idOrSlug.trim() }];
  if (ObjectId.isValid(idOrSlug.trim())) {
    queryConditions.push({ _id: new ObjectId(idOrSlug.trim()) });
  }
  const post = await postColl.findOne({ $or: queryConditions });
  if (!post) {
    const err = new Error('Bài viết không tồn tại.');
    err.status = 404;
    err.code = 'BLOG_NOT_FOUND';
    throw err;
  }

  const postId = post.id ? String(post.id) : post._id.toString();
  const now = new Date();
  const authorName = (commentData.authorName || options.user?.full_name || 'Học viên ThinkUp').trim();
  const authorAvatar = commentData.authorAvatar || options.user?.avatar_url || '/assets/blog/default-avatar.jpg';

  const insertDoc = {
    postId,
    authorName,
    authorAvatar,
    content: cleanContent,
    likesCount: 0,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    userEmail: (commentData.userEmail || options.user?.email || '').toLowerCase(),
  };

  const result = await commentColl.insertOne(insertDoc);
  insertDoc._id = result.insertedId;

  return {
    comment: formatBlogComment(insertDoc),
    message: 'Bình luận đã được gửi thành công!',
  };
}

// ─── 5d. Hàm Truy Xuất Chi Tiết Một Bài Blog ─────────────────────────────────

/**
 * Lấy chi tiết bài blog theo ID hoặc slug.
 * LƯU Ý BẢO MẬT: Nếu bài viết đang ở trạng thái 'draft', chỉ cho phép xem nếu
 * người dùng yêu cầu là chủ sở hữu hoặc có cờ allowDraft (preview mode).
 * Tự động trả về:
 * - Trạng thái tương tác của người dùng hiện tại (userInteraction: 'like' | 'dislike' | null).
 * - Các liên kết chia sẻ mạng xã hội (shareLinks: Facebook, LinkedIn, Copy Link).
 * - Danh sách bình luận thảo luận của bài viết (comments).
 *
 * @param {string} idOrSlug - ID hoặc Slug của bài viết
 * @param {object} [options]
 * @param {boolean} [options.incrementView=true]
 * @param {boolean} [options.allowDraft=false]
 * @param {string} [options.ownerEmail]
 * @param {string} [options.userEmail]
 * @param {string} [options.userId]
 * @returns {Promise<{ post: object, prevPost: object|null, nextPost: object|null, relatedPosts: object[], userInteraction: string|null, shareLinks: object, comments: object[] }>}
 */
export async function getBlogDetail(idOrSlug, options = {}) {
  if (!idOrSlug || typeof idOrSlug !== 'string') {
    const err = new Error('Mã bài viết hoặc đường dẫn không hợp lệ.');
    err.status = 400;
    err.code = 'INVALID_BLOG_ID';
    throw err;
  }

  const db = options.db || await getMongoDb();
  const collection = getBlogCollection(db);

  const queryConditions = [{ slug: idOrSlug.trim() }];
  if (ObjectId.isValid(idOrSlug.trim())) {
    queryConditions.push({ _id: new ObjectId(idOrSlug.trim()) });
  }

  let rawPost = await collection.findOne({ $or: queryConditions });

  if (!rawPost) {
    const err = new Error('Bài viết blog không tồn tại hoặc đã bị gỡ bỏ.');
    err.status = 404;
    err.code = 'BLOG_NOT_FOUND';
    throw err;
  }

  // Kiểm tra quyền xem bài nháp
  const isDraft = String(rawPost.status).toLowerCase() === 'draft';
  if (isDraft) {
    const isOwner = options.ownerEmail && (
      rawPost.owner_email === options.ownerEmail.toLowerCase() ||
      rawPost.ownerEmail === options.ownerEmail.toLowerCase()
    );
    if (!options.allowDraft && !isOwner) {
      const err = new Error('Bài viết này đang ở chế độ bản nháp và chưa được xuất bản công khai.');
      err.status = 404;
      err.code = 'DRAFT_NOT_PUBLIC';
      throw err;
    }
  }

  // Tăng lượt xem tự động nếu không phải xem bản nháp và được bật
  if (!isDraft && options.incrementView !== false) {
    const currentViews = typeof rawPost.views === 'number' ? rawPost.views : (Number.parseInt(rawPost.views, 10) || 0);
    if (typeof rawPost.views !== 'number') {
      await collection.updateOne(
        { _id: rawPost._id },
        { $set: { views: currentViews + 1, last_viewed_at: new Date() } }
      );
    } else {
      await collection.updateOne(
        { _id: rawPost._id },
        { $inc: { views: 1 }, $set: { last_viewed_at: new Date() } }
      );
    }
    rawPost.views = currentViews + 1;
  }

  let authorUser = null;
  const ownerEmail = (rawPost.owner_email || rawPost.ownerEmail || '').toLowerCase();
  if (ownerEmail) {
    try {
      authorUser = await db.collection('users').findOne(
        { email: ownerEmail },
        { projection: { full_name: 1, avatar_url: 1, avatar: 1, role: 1 } }
      );
    } catch {
      // Bỏ qua lỗi tra cứu nếu chưa có index
    }
  }

  const post = formatBlogPost(rawPost, authorUser);
  post.tableOfContents = extractTableOfContents(rawPost.content);
  post.hasToc = post.tableOfContents.length > 0;

  // Lấy liên kết chia sẻ mạng xã hội
  const shareLinks = generateShareLinks(post.slug || post.id, options);
  post.shareLinks = shareLinks;

  // Tra cứu tương tác hữu ích / không hữu ích của người dùng hiện tại
  let userInteraction = null;
  const currentEmail = (options.userEmail || options.ownerEmail || '').trim().toLowerCase();
  const currentUserId = String(options.userId || '').trim();

  if (currentEmail || currentUserId) {
    const postIdStr = rawPost._id.toString();
    const likeDoc = await db.collection('blog_post_likes').findOne({
      postId: postIdStr,
      $or: [
        { userEmail: currentEmail || '__no_email__' },
        { userId: currentUserId || '__no_user_id__' },
      ],
    });
    if (likeDoc && likeDoc.action) {
      userInteraction = likeDoc.action;
    }
  }

  // Đồng thời cập nhật số liệu hữu ích / không hữu ích lên post
  post.likesCount = typeof rawPost.likesCount === 'number'
    ? rawPost.likesCount
    : Number.parseInt(rawPost.likesCount, 10) || 0;
  post.dislikesCount = typeof rawPost.dislikesCount === 'number'
    ? rawPost.dislikesCount
    : Number.parseInt(rawPost.dislikesCount, 10) || 0;
  post.helpfulCount = post.likesCount;
  post.unhelpfulCount = post.dislikesCount;

  // Lấy các bài viết liên quan và bình luận thảo luận
  const [prevDoc, nextDoc, relatedDocs, commentsRes] = await Promise.all([
    collection
      .find({ _id: { $lt: rawPost._id }, status: { $in: ['published', 'updated'] } })
      .sort({ _id: -1 })
      .limit(1)
      .project({ title: 1, slug: 1 })
      .toArray(),
    collection
      .find({ _id: { $gt: rawPost._id }, status: { $in: ['published', 'updated'] } })
      .sort({ _id: 1 })
      .limit(1)
      .project({ title: 1, slug: 1 })
      .toArray(),
    collection
      .find({
        _id: { $ne: rawPost._id },
        category: rawPost.category,
        status: { $in: ['published', 'updated'] },
      })
      .sort({ views: -1, _id: -1 })
      .limit(3)
      .toArray(),
    getBlogComments(idOrSlug, { db }),
  ]);

  const prevPost = prevDoc.length > 0 ? { id: prevDoc[0]._id.toString(), title: prevDoc[0].title } : null;
  const nextPost = nextDoc.length > 0 ? { id: nextDoc[0]._id.toString(), title: nextDoc[0].title } : null;
  const relatedPosts = relatedDocs.map(doc => {
    const formatted = formatBlogPost(doc);
    return {
      id: formatted.id,
      title: formatted.title,
      coverImage: formatted.coverImage,
      readTime: formatted.readTime,
      category: formatted.category,
      categoryId: formatted.categoryId,
    };
  });

  return {
    post,
    prevPost,
    nextPost,
    relatedPosts,
    userInteraction,
    shareLinks,
    comments: commentsRes.comments,
  };
}

// ─── 6. Hàm Xóa Bài Viết Cá Nhân ───────────────────────────────────────────

/**
 * Xóa một bài viết khỏi cơ sở dữ liệu.
 * @param {string} id - ID bài viết cần xóa
 * @param {object} [options]
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export async function deleteBlogPost(id, options = {}) {
  if (!id) {
    const err = new Error('Mã bài viết không hợp lệ.');
    err.status = 400;
    throw err;
  }

  const db = options.db || await getMongoDb();
  const collection = getBlogCollection(db);

  const query = ObjectId.isValid(id) ? { _id: new ObjectId(id) } : { id: String(id) };
  if (options.ownerEmail) {
    query.$or = [
      { owner_email: options.ownerEmail.toLowerCase() },
      { ownerEmail: options.ownerEmail.toLowerCase() },
    ];
  }

  const result = await collection.deleteOne(query);
  if (result.deletedCount === 0) {
    const err = new Error('Bài viết không tồn tại hoặc bạn không có quyền xóa bài viết này.');
    err.status = 404;
    throw err;
  }

  return {
    success: true,
    message: 'Xóa bài viết thành công!',
  };
}

// ─── 7. Hàm Xuất Số Lượng Về Những Chủ Đề Phổ Biến ──────────────────────────

/**
 * Hàm xuất số lượng về những chủ đề phổ biến (Popular Topics with count).
 * @param {object} [options]
 * @returns {Promise<Array<{ id: string, label: string, count: number }>>}
 */
export async function getPopularTopics(options = {}) {
  const db = options.db || await getMongoDb();
  const collection = getBlogCollection(db);
  const limit = Math.max(1, Number.parseInt(options.limit, 10) || 10);

  const docs = await collection
    .find({
      status: { $in: ['published', 'updated'] },
      category: { $exists: true, $ne: '' },
    })
    .project({ category: 1 })
    .toArray();

  const categoryMap = new Map();
  for (const doc of docs) {
    const rawCategory = String(doc.category || '').trim();
    if (!rawCategory) continue;
    const slug = generateSlug(rawCategory);
    if (!categoryMap.has(slug)) {
      categoryMap.set(slug, {
        id: slug,
        label: rawCategory,
        count: 0,
      });
    }
    const entry = categoryMap.get(slug);
    entry.count += 1;
    // Ưu tiên nhãn viết hoa nếu có
    if (rawCategory === rawCategory.toUpperCase() && rawCategory !== entry.label) {
      entry.label = rawCategory;
    }
  }

  const sorted = Array.from(categoryMap.values())
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);

  return sorted;
}

// ─── 8. Hàm Xuất Những Bài Viết Được Xem Nhiều ──────────────────────────────

/**
 * Hàm xuất những bài viết được xem nhiều nhất (Most Viewed Blog Posts).
 * @param {object} [options]
 * @returns {Promise<Array<{ id: string, title: string, views: number, coverImage: string, readTime: string, slug: string }>>}
 */
export async function getMostViewedBlogPosts(options = {}) {
  const db = options.db || await getMongoDb();
  const collection = getBlogCollection(db);
  const limit = Math.max(1, Number.parseInt(options.limit, 10) || 5);

  const pipeline = [
    {
      $match: {
        status: { $in: ['published', 'updated'] },
      },
    },
    {
      $addFields: {
        numericViews: {
          $convert: {
            input: '$views',
            to: 'int',
            onError: 0,
            onNull: 0,
          },
        },
      },
    },
    {
      $sort: { numericViews: -1, published_at: -1, _id: -1 },
    },
    {
      $limit: limit,
    },
  ];

  const posts = await collection.aggregate(pipeline).toArray();

  return posts.map(doc => {
    const formatted = formatBlogPost(doc);
    return {
      id: formatted.id,
      title: formatted.title,
      views: formatted.views,
      coverImage: formatted.coverImage,
      readTime: formatted.readTime,
      slug: formatted.slug,
    };
  });
}

/**
 * Lấy dữ liệu tổng hợp cho Sidebar blog.
 * @param {object} [options]
 * @returns {Promise<{ popularTopics: Array<{ id: string, label: string, count: number }>, mostViewedArticles: Array<{ id: string, title: string, views: number, coverImage: string }> }>}
 */
export async function getBlogSidebar(options = {}) {
  const [popularTopics, mostViewedArticles] = await Promise.all([
    getPopularTopics(options),
    getMostViewedBlogPosts(options),
  ]);

  return {
    popularTopics,
    mostViewedArticles,
  };
}

// ─── 9. Đăng Ký Nhận Bản Tin & Thông Báo Gmail ─────────────────────────────

/**
 * Hàm đăng ký nhận bản tin qua email người dùng.
 * @param {object} params
 * @param {string} params.email
 * @param {object} [options]
 * @returns {Promise<{ success: boolean, alreadySubscribed: boolean, message: string }>}
 */
export async function subscribeNewsletter({ email }, options = {}) {
  const validation = validateEmail(email);
  if (!validation.valid) {
    const err = new Error(validation.message);
    err.status = 400;
    err.code = 'INVALID_EMAIL';
    throw err;
  }

  const normalizedEmail = validation.value;
  const db = options.db || await getMongoDb();
  const collection = db.collection('newsletter_subscribers');

  const existing = await collection.findOne({ email: normalizedEmail });

  if (existing) {
    if (existing.status === 'active') {
      return {
        success: true,
        alreadySubscribed: true,
        message: 'Bạn đã đăng ký nhận bản tin ThinkUp trước đó rồi! Cảm ơn bạn đã luôn quan tâm.',
      };
    }
    await collection.updateOne(
      { _id: existing._id },
      { $set: { status: 'active', resubscribed_at: new Date() } }
    );
  } else {
    await collection.insertOne({
      email: normalizedEmail,
      status: 'active',
      subscribed_at: new Date(),
      created_at: new Date(),
    });
  }

  try {
    await sendEmail({
      to: normalizedEmail,
      subject: '🎉 Chào mừng bạn đến với Bản Tin ThinkUp Blog!',
      html: renderNewsletterWelcomeEmail({
        email: normalizedEmail,
        clientUrl: process.env.CLIENT_URL,
      }),
      text: 'Cảm ơn bạn đã đăng ký nhận bản tin ThinkUp Blog! Bạn sẽ nhận được thông báo khi có bài viết công nghệ mới nhất.',
    });
  } catch (mailError) {
    console.warn('[Newsletter] Không thể gửi email xác nhận chào mừng:', mailError.message);
  }

  return {
    success: true,
    alreadySubscribed: false,
    message: 'Đăng ký nhận bản tin thành công! Bạn sẽ nhận được thông báo khi có bài viết mới.',
  };
}

/**
 * Gửi thông báo email đến người đăng ký bản tin khi có bài mới.
 * @param {object} blogPost
 * @param {object} [options]
 * @returns {Promise<{ notified: number, totalSubscribers: number, failed: number }>}
 */
export async function notifySubscribersNewPost(blogPost, options = {}) {
  if (!blogPost || !blogPost.title) {
    const err = new Error('Thông tin bài blog không hợp lệ để phát thông báo.');
    err.status = 400;
    err.code = 'INVALID_BLOG_DATA';
    throw err;
  }

  const db = options.db || await getMongoDb();
  const collection = db.collection('newsletter_subscribers');

  const subscribers = await collection
    .find({ status: 'active' })
    .project({ email: 1 })
    .toArray();

  if (subscribers.length === 0) {
    return {
      notified: 0,
      totalSubscribers: 0,
      failed: 0,
      message: 'Hiện chưa có người đăng ký nhận bản tin nào.',
    };
  }

  const clientUrl = options.clientUrl || process.env.CLIENT_URL || 'https://think-up-edu.vercel.app';
  const postUrl = `${clientUrl}/blog/${encodeURIComponent(blogPost.slug || blogPost.id || '')}`;
  const title = blogPost.title;
  const description = blogPost.description || blogPost.summary || 'Khám phá ngay bài viết mới nhất trên ThinkUp Blog!';
  const category = blogPost.category || 'Công nghệ & Lập trình';
  const readTime = blogPost.readTime || calculateReadTime(blogPost.content);
  const coverImage = blogPost.coverImage || '';

  const htmlContent = renderNewBlogPostEmail({
    title,
    description,
    category,
    readTime,
    coverImage,
    postUrl,
    clientUrl,
  });

  let notifiedCount = 0;
  let failedCount = 0;

  const emailPromises = subscribers.map(async sub => {
    try {
      await sendEmail({
        to: sub.email,
        subject: `[ThinkUp Blog] 📢 Bài viết mới: ${title}`,
        html: htmlContent,
        text: `Bài viết mới trên ThinkUp Blog: ${title}\nChủ đề: ${category} | Thời gian đọc: ${readTime}\n${description}\n\nĐọc ngay tại: ${postUrl}`,
      });
      notifiedCount += 1;
    } catch (err) {
      failedCount += 1;
      console.warn(`[Newsletter] Gửi email thất bại tới ${sub.email}:`, err.message);
    }
  });

  await Promise.allSettled(emailPromises);

  return {
    notified: notifiedCount,
    totalSubscribers: subscribers.length,
    failed: failedCount,
  };
}

// ─── 10. Hàm Tải Lên Hình Ảnh (Upload Image - AC-BLG-10) ────────────────────

/**
 * Xử lý tải lên hình ảnh cho bài viết (Ảnh đại diện hoặc ảnh trong bài viết).
 * Kiểm tra định dạng (.jpg, .png, .webp) và giới hạn dung lượng:
 * - Ảnh đại diện (cover/thumbnail): <= 2MB (AC-BLG-10)
 * - Ảnh trong nội dung: <= 5MB
 *
 * @param {object} payload
 * @param {string} [payload.url]
 * @param {string} [payload.base64]
 * @param {string} [payload.fileName]
 * @param {number} [payload.sizeBytes]
 * @param {string} [payload.type='thumbnail'] - 'thumbnail' | 'content'
 * @returns {Promise<{ url: string, message: string }>}
 */
export async function uploadBlogImage(payload = {}) {
  // 1. Kiểm tra dung lượng
  const isThumbnail = payload.type !== 'content';
  const maxBytes = isThumbnail ? 2 * 1024 * 1024 : 5 * 1024 * 1024; // 2MB cho thumbnail, 5MB cho ảnh nội dung
  const sizeLimitLabel = isThumbnail ? '2MB' : '5MB';

  if (payload.sizeBytes && payload.sizeBytes > maxBytes) {
    const err = new Error(`Dung lượng hình ảnh vượt quá giới hạn cho phép (${sizeLimitLabel}).`);
    err.status = 400;
    err.code = 'IMAGE_TOO_LARGE';
    throw err;
  }

  // 2. Kiểm tra định dạng tệp (.jpg, .jpeg, .png, .webp)
  if (payload.fileName && typeof payload.fileName === 'string') {
    const validExtensions = /\.(jpe?g|png|webp)$/i;
    if (!validExtensions.test(payload.fileName)) {
      const err = new Error('Định dạng hình ảnh không hợp lệ. Chỉ chấp nhận .jpg, .png, .webp.');
      err.status = 400;
      err.code = 'INVALID_IMAGE_FORMAT';
      throw err;
    }
  }

  // 3. Xử lý đường dẫn
  if (payload.url && typeof payload.url === 'string' && payload.url.trim().startsWith('http')) {
    return {
      url: payload.url.trim(),
      message: 'Liên kết ảnh hợp lệ',
    };
  }

  if (payload.base64 && typeof payload.base64 === 'string') {
    return {
      url: payload.base64,
      message: 'Tải ảnh lên thành công',
    };
  }

  return {
    url: '/assets/blog/article-1.jpg',
    message: 'Tải ảnh lên thành công',
  };
}

// ─── 11. Bộ Định Tuyến Express Độc Lập (createBlogRouter) ───────────────────

/**
 * Tạo một router Express độc lập chứa đầy đủ các endpoint cho chức năng blog.
 * Sẵn sàng gắn vào:
 * - app.use('/api/blog', createBlogRouter(express))
 * - app.use('/api/v1/posts', createBlogRouter(express))
 *
 * @param {object} expressModule
 * @returns {import('express').Router}
 */
export function createBlogRouter(expressModule) {
  const express = expressModule;
  if (!express || !express.Router) {
    throw new Error('Cần truyền module express vào createBlogRouter(express).');
  }

  const router = express.Router();

  // Tự động kiểm tra và chuẩn hóa SEO & trường views trong DB ở chế độ chạy nền
  getMongoDb()
    .then(db => supplementExistingPostsSeo(db))
    .catch(() => {});

  // 1. Quản lý bài viết cá nhân (/account/posts): Lọc theo 4 tab trạng thái, tìm kiếm
  router.get('/manage/posts', async (req, res, next) => {
    try {
      const result = await getManageBlogList(req.query);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // Alias tương thích: /my-posts
  router.get('/my-posts', async (req, res, next) => {
    try {
      const result = await getManageBlogList(req.query);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // 2. Danh sách bài blog công khai (/main/blog)
  // Nếu có query param manage=true -> chuyển tiếp sang getManageBlogList
  router.get('/', async (req, res, next) => {
    try {
      if (req.query.manage === 'true' || req.query.tab) {
        const result = await getManageBlogList(req.query);
        return res.json(result);
      }
      const result = await getBlogList(req.query);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // 3. Lấy dữ liệu Sidebar (Chủ đề phổ biến + Bài viết xem nhiều)
  router.get('/sidebar', async (req, res, next) => {
    try {
      const result = await getBlogSidebar();
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // 4. Lấy danh sách các chủ đề phổ biến
  router.get('/topics/popular', async (req, res, next) => {
    try {
      const limit = req.query.limit;
      const topics = await getPopularTopics({ limit });
      res.json({ topics });
    } catch (err) {
      next(err);
    }
  });

  // 5. Lấy danh sách các bài viết xem nhiều nhất
  router.get('/articles/most-viewed', async (req, res, next) => {
    try {
      const limit = req.query.limit;
      const articles = await getMostViewedBlogPosts({ limit });
      res.json({ articles });
    } catch (err) {
      next(err);
    }
  });

  // 6. Lưu bản nháp (Save Draft Flow - D1 & D2): POST /draft hoặc POST /posts/draft
  router.post('/draft', async (req, res, next) => {
    try {
      const result = await saveDraftPost(req.body);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  });

  // 7. Đăng ký nhận bản tin (Newsletter)
  router.post('/newsletter', async (req, res, next) => {
    try {
      const result = await subscribeNewsletter({ email: req.body.email });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post('/newsletter/subscribe', async (req, res, next) => {
    try {
      const result = await subscribeNewsletter({ email: req.body.email });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // 8. Gửi thông báo bản tin
  router.post('/notify-subscribers', async (req, res, next) => {
    try {
      const result = await notifySubscribersNewPost(req.body);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // 9. Đăng bài viết mới hoặc Lưu bài (Publish Flow - Luồng 5 & 6)
  router.post('/', async (req, res, next) => {
    try {
      const isDraft = String(req.body.status).toLowerCase() === 'draft';
      const result = await saveBlogPost(req.body, { isDraft });
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  });

  // 10. Endpoint tải ảnh lên
  router.post('/upload', async (req, res, next) => {
    try {
      const result = await uploadBlogImage(req.body);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // 11. Cập nhật bài viết hiện có
  router.put('/:id', async (req, res, next) => {
    try {
      const result = await saveBlogPost({ ...req.body, id: req.params.id });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // 12. Xóa bài viết
  router.delete('/:id', async (req, res, next) => {
    try {
      const result = await deleteBlogPost(req.params.id, { ownerEmail: req.query.ownerEmail });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // 13. Tương tác đánh giá bài viết (Hữu ích / Không hữu ích - Like / Dislike)
  const handleReaction = async (req, res, next) => {
    try {
      const result = await reactBlogPost(req.params.id, req.body);
      res.json(result);
    } catch (err) {
      next(err);
    }
  };
  router.post('/:id/like', handleReaction);
  router.post('/:id/reaction', handleReaction);

  // 14. Lấy liên kết chia sẻ mạng xã hội (Facebook, LinkedIn, Copy Link)
  router.get('/:id/share', (req, res) => {
    const shareLinks = generateShareLinks(req.params.id);
    res.json({ success: true, shareLinks });
  });

  // 15. Lấy danh sách bình luận thảo luận của bài viết
  router.get('/:id/comments', async (req, res, next) => {
    try {
      const result = await getBlogComments(req.params.id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // 16. Thêm bình luận thảo luận mới cho bài viết
  router.post('/:id/comments', async (req, res, next) => {
    try {
      const result = await addBlogComment(req.params.id, req.body);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  });

  // 17. Lấy chi tiết bài blog theo ID hoặc slug (kèm trạng thái tương tác, shareLinks, và bình luận)
  router.get('/:id', async (req, res, next) => {
    try {
      const allowDraft = req.query.preview === 'true' || req.query.allowDraft === 'true';
      const userEmail = req.query.userEmail || req.query.ownerEmail;
      const userId = req.query.userId;
      const result = await getBlogDetail(req.params.id, {
        allowDraft,
        ownerEmail: req.query.ownerEmail,
        userEmail,
        userId,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
