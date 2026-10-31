import { getMongoDb } from '../db.js';

export const COLLECTION_LEARNING_PREFERENCES = 'learning_preferences';
export const DEFAULT_LEARNING_PREFERENCES = Object.freeze({ language:'vi',timezone:'Asia/Ho_Chi_Minh',
  videoQuality:'auto',playbackSpeed:'1.0',subtitles:false,autoNext:true,downloadQuality:'high',downloadLocation:'downloads' });
const QUALITY = ['360p','480p','720p','1080p'];
const SPEEDS = [0.5,0.75,1,1.25,1.5,1.75,2];
const CAPABILITIES = Object.freeze({ languages:['vi'],playbackSpeed:true,autoNext:true,
  videoQuality:'per_lesson',subtitles:'per_lesson',downloadQuality:false,downloadLocation:false });
const database = async options => options.db || await getMongoDb();
function failure(message,status=400,code='LEARNING_SETTINGS_INVALID') {
  return Object.assign(new Error(message),{ status,code });
}
function owner(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 128) throw failure('Yêu cầu đăng nhập.',401,'LEARNING_SETTINGS_AUTH_REQUIRED');
  return value;
}
export function normalizeLearningTimezone(value) {
  const aliases = { 'GMT+07:00':'Asia/Ho_Chi_Minh','GMT+08:00':'Asia/Singapore','GMT+09:00':'Asia/Tokyo','GMT+00:00':'Etc/UTC' };
  if (typeof value !== 'string' || !value || value.length > 100) throw failure('Múi giờ không hợp lệ.');
  const timezone = Object.hasOwn(aliases,value) ? aliases[value] : value;
  try { new Intl.DateTimeFormat('en',{ timeZone:timezone }).format(0); }
  catch { throw failure('Múi giờ không hợp lệ.'); }
  return timezone;
}
function normalizeField(key,value) {
  if (key === 'timezone') return normalizeLearningTimezone(value);
  if (key === 'language') {
    if (value === 'en') throw failure('Chưa có bộ bản dịch tiếng Anh.',409,'LEARNING_LANGUAGE_UNAVAILABLE');
    if (value !== 'vi') throw failure('Ngôn ngữ không hợp lệ.');
  } else if (key === 'videoQuality') {
    if (!['auto',...QUALITY].includes(value)) throw failure('Chất lượng video không hợp lệ.');
  } else if (key === 'playbackSpeed') {
    if (!['string','number'].includes(typeof value) || !SPEEDS.includes(Number(value)) ||
        (typeof value === 'string' && !/^(?:0\.5|0\.75|1(?:\.0)?|1\.25|1\.5|1\.75|2(?:\.0)?)$/.test(value))) {
      throw failure('Tốc độ phát không hợp lệ.');
    }
    return Number.isInteger(Number(value)) ? `${Number(value)}.0` : String(Number(value));
  } else if (key === 'subtitles' || key === 'autoNext') {
    if (typeof value !== 'boolean') throw failure('Tùy chọn bật/tắt phải là boolean.');
  } else if (key === 'downloadQuality') {
    if (['standard','saving'].includes(value)) throw failure('Chưa có phiên bản tải theo chất lượng.',409,'LEARNING_DOWNLOAD_QUALITY_UNAVAILABLE');
    if (value !== 'high') throw failure('Chất lượng tải không hợp lệ.');
  } else if (key === 'downloadLocation') {
    if (['documents','choose'].includes(value)) throw failure('Thư mục tải do trình duyệt quyết định.',409,'LEARNING_DOWNLOAD_LOCATION_UNAVAILABLE');
    if (value !== 'downloads') throw failure('Vị trí tải không hợp lệ.');
  }
  return value;
}
function preferencesView(doc) {
  const prefs = {};
  try {
    for (const key of Object.keys(DEFAULT_LEARNING_PREFERENCES)) prefs[key] = normalizeField(key,doc?.[key] ?? DEFAULT_LEARNING_PREFERENCES[key]);
  } catch { throw failure('Dữ liệu cấu hình học tập chưa hợp lệ.',503,'LEARNING_SETTINGS_STORAGE_ERROR'); }
  const revision = doc?.revision ?? 0;
  if (!Number.isSafeInteger(revision) || revision < 0) throw failure('Phiên bản cấu hình không hợp lệ.',503,'LEARNING_SETTINGS_STORAGE_ERROR');
  return { ...prefs,revision };
}
export async function getLearningPreferences(userId,options={}) {
  const id = owner(userId);
  return preferencesView(await (await database(options)).collection(COLLECTION_LEARNING_PREFERENCES).findOne({ _id:id }));
}
export async function getLearningSettings(userId,options={}) {
  return { ...await getLearningPreferences(userId,options),defaults:{ ...DEFAULT_LEARNING_PREFERENCES },
    capabilities:{ ...CAPABILITIES,languages:[...CAPABILITIES.languages] },
    options:{ videoQuality:['auto',...QUALITY],playbackSpeed:SPEEDS } };
}
export async function updateLearningPreferences(userId,payload,options={}) {
  const id = owner(userId);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw failure('Cấu hình học tập không hợp lệ.');
  const fields = Object.keys(payload).filter(key => key !== 'expectedRevision');
  if (!fields.length || fields.some(key => !Object.hasOwn(DEFAULT_LEARNING_PREFERENCES,key))) throw failure('Trường cấu hình không được hỗ trợ.');
  if (!Number.isSafeInteger(payload.expectedRevision) || payload.expectedRevision < 0 || payload.expectedRevision >= Number.MAX_SAFE_INTEGER) {
    throw failure('Cần gửi phiên bản cấu hình hợp lệ.');
  }
  const patch = Object.fromEntries(fields.map(key => [key,normalizeField(key,payload[key])]));
  const collection = (await database(options)).collection(COLLECTION_LEARNING_PREFERENCES);
  const existing = await collection.findOne({ _id:id });
  const current = preferencesView(existing);
  const conflict = () => failure('Cấu hình đã thay đổi. Vui lòng tải lại trước khi lưu.',409,'LEARNING_SETTINGS_CONFLICT');
  if (current.revision !== payload.expectedRevision) throw conflict();
  const next = { _id:id,...current,...patch,revision:current.revision+1,updated_at:new Date(options.now ?? Date.now()) };
  if (!existing) {
    try { await collection.insertOne(next); } catch (error) { if (error.code === 11000) throw conflict();throw error; }
  } else {
    const { _id,...update } = next;
    const result = await collection.updateOne({ _id,revision:Object.hasOwn(existing,'revision') ? existing.revision : { $exists:false } },{ $set:update });
    if (!result.matchedCount) throw conflict();
  }
  return preferencesView(next);
}

function mediaUrl(value) {
  if (typeof value !== 'string' || !value || /[\\\s\u0000-\u001f]/.test(value)) throw failure('Nguồn phát chưa hợp lệ.',503,'LEARNING_MEDIA_INVALID');
  if (/^\/(?!\/)/.test(value)) return value;
  try { if (['http:','https:'].includes(new URL(value).protocol)) return value; } catch { /* Reject below. */ }
  throw failure('Nguồn phát chưa hợp lệ.',503,'LEARNING_MEDIA_INVALID');
}
/** Only call after the course/lesson access check; URLs are read exclusively from stored media metadata. */
export async function resolveLearningPlayback(userId,video,options={}) {
  const prefs = userId ? await getLearningPreferences(userId,options) : { ...DEFAULT_LEARNING_PREFERENCES,revision:0 };
  if (!video || typeof video !== 'object' || (video.video_sources !== undefined && !Array.isArray(video.video_sources)) ||
      (video.caption_tracks !== undefined && !Array.isArray(video.caption_tracks))) throw failure('Metadata video không hợp lệ.',503,'LEARNING_MEDIA_INVALID');
  const sources = [];
  for (const source of video.video_sources || []) {
    if (!source || !QUALITY.includes(source.quality) || sources.some(item => item.quality === source.quality)) {
      throw failure('Metadata chất lượng video không hợp lệ.',503,'LEARNING_MEDIA_INVALID');
    }
    sources.push({ quality:source.quality,url:mediaUrl(source.url) });
  }
  const original = video.video_url ? { quality:QUALITY.includes(video.quality) ? video.quality : 'source',url:mediaUrl(video.video_url) } : null;
  if (original && !sources.some(item => item.url === original.url)) sources.push(original);
  if (!sources.length) throw failure('Bài học chưa có video.',404,'LEARNING_VIDEO_UNAVAILABLE');
  const selected = (prefs.videoQuality !== 'auto' ? sources.find(item => item.quality === prefs.videoQuality) : null) || original || sources[0];
  const captions = (video.caption_tracks || []).map(track => {
    if (!track || typeof track.language !== 'string' || !/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(track.language) ||
        typeof track.label !== 'string' || !track.label.trim() || track.label.length > 100) {
      throw failure('Metadata phụ đề không hợp lệ.',503,'LEARNING_MEDIA_INVALID');
    }
    return { language:track.language,label:track.label,url:mediaUrl(track.url) };
  });
  const caption = prefs.subtitles ? captions.find(track => track.language === prefs.language) || captions[0] || null : null;
  return { videoUrl:selected.url,sources,captionTracks:captions,selectedCaption:caption,
    requested:{ videoQuality:prefs.videoQuality,playbackSpeed:Number(prefs.playbackSpeed),subtitles:prefs.subtitles,autoNext:prefs.autoNext },
    effective:{ videoQuality:selected.quality,playbackSpeed:Number(prefs.playbackSpeed),subtitles:Boolean(caption),autoNext:prefs.autoNext },
    qualityFallback:prefs.videoQuality !== 'auto' && selected.quality !== prefs.videoQuality,
    capabilities:{ videoQuality:sources.length > 1,subtitles:captions.length > 0 },revision:prefs.revision };
}

/** Old naive transaction strings represent Vietnam local time; explicit offsets and Date values retain their instant. */
export function learningUtcDate(value) {
  if (value == null || value === '' || !['string','number','object'].includes(typeof value) ||
      (typeof value === 'object' && !(value instanceof Date))) return null;
  const text = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?$/.test(value)
    ? value.replace(' ','T')+'+07:00' : value;
  const date = new Date(text);
  return Number.isFinite(+date) ? date : null;
}
const formatters = new Map();
export function learningDateParts(value,timezone=DEFAULT_LEARNING_PREFERENCES.timezone) {
  const date = learningUtcDate(value);if (!date) return null;
  const zone = normalizeLearningTimezone(timezone);
  if (!formatters.has(zone)) {
    if (formatters.size >= 100) formatters.clear();
    formatters.set(zone,new Intl.DateTimeFormat('en-CA',{ timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',
      hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23' }));
  }
  const p = Object.fromEntries(formatters.get(zone).formatToParts(date).map(item => [item.type,item.value]));
  return { date:`${p.year}-${p.month}-${p.day}`,dateOnly:`${p.day}/${p.month}/${p.year}`,
    timeOnly:`${p.hour}:${p.minute}:${p.second}`,iso:date.toISOString(),timezone:zone };
}
export function learningCalendarDay(value,delta=0) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw failure('Ngày không hợp lệ.');
  const date = new Date(value+'T00:00:00.000Z');
  if (!Number.isFinite(+date) || date.toISOString().slice(0,10) !== value) throw failure('Ngày không hợp lệ.');
  date.setUTCDate(date.getUTCDate()+delta);
  return date.toISOString().slice(0,10);
}
export function learningDayStart(day,timezone) {
  learningCalendarDay(day);
  const center = Date.parse(day+'T00:00:00Z');
  let low = center-36*3600_000,high = center+36*3600_000;
  // Search by local calendar date, avoiding host timezone and ambiguous/repeated local hours.
  while (low < high) {
    const middle = Math.floor((low+high)/2);
    if (learningDateParts(middle,timezone).date < day) low = middle+1;else high = middle;
  }
  if (learningDateParts(low,timezone).date !== day) throw failure('Ngày không tồn tại trong múi giờ đã chọn.');
  return new Date(low);
}
export function learningDateRange(filters,timezone,reference=new Date()) {
  let fromDay = filters.dateFrom || null,toDay = filters.dateTo || null;
  if (filters.datePreset) {
    const today = learningDateParts(reference,timezone)?.date;
    if (!today) throw failure('Mốc thời gian không hợp lệ.');
    const first = today.slice(0,7)+'-01';
    const previousLast = learningCalendarDay(first,-1);
    const nextMonth = new Date(first+'T00:00:00Z');nextMonth.setUTCMonth(nextMonth.getUTCMonth()+1);
    const ranges = { today:[today,today],yesterday:[learningCalendarDay(today,-1),learningCalendarDay(today,-1)],
      last7days:[learningCalendarDay(today,-6),today],last30days:[learningCalendarDay(today,-29),today],
      thismonth:[first,learningCalendarDay(nextMonth.toISOString().slice(0,10),-1)],lastmonth:[previousLast.slice(0,7)+'-01',previousLast] };
    if (!Object.hasOwn(ranges,filters.datePreset)) throw failure('Khoảng ngày không hợp lệ.');
    [fromDay,toDay] = ranges[filters.datePreset];
  }
  if (fromDay) learningCalendarDay(fromDay);if (toDay) learningCalendarDay(toDay);
  if (fromDay && toDay && fromDay > toDay) throw failure('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.');
  return { from:fromDay ? learningDayStart(fromDay,timezone) : null,
    to:toDay ? new Date(+learningDayStart(learningCalendarDay(toDay,1),timezone)-1) : null };
}

export function createLearningSettingsRouter(express,requireAuth,options={}) {
  const router = express.Router();router.use(requireAuth);
  router.use((req,res,next) => { res.set('Cache-Control','no-store');next(); });
  const handle = operation => async (req,res) => {
    try { res.json({ success:true,data:await operation(req) }); }
    catch (error) {
      const known = error.code?.startsWith?.('LEARNING_') && error.status >= 400 && error.status < 500;
      res.status(known ? error.status : 503).json({ success:false,code:known ? error.code : 'LEARNING_SETTINGS_UNAVAILABLE',
        message:known ? error.message : 'Không thể xử lý cấu hình học tập lúc này. Vui lòng thử lại.' });
    }
  };
  router.get('/',handle(req => getLearningSettings(req.userId,options)));
  router.put('/',handle(req => updateLearningPreferences(req.userId,req.body,options)));
  return router;
}
