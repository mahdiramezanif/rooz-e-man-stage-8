'use strict';

// نسخهٔ هفتم «روزِ من»: ثبت و تحلیل ورزش و مطالعهٔ زبان + امکانات مراحل پیشین.
// تاریخ داخلی میلادی (YYYY-MM-DD) است؛ تاریخ‌های نشان‌داده‌شده شمسی‌اند.
const DB_NAME = 'rooz-e-man-local';
const DB_VERSION = 5;
const STORE_NAME = 'weeklyTasks';
const REMINDER_STORE = 'reminders';
const BASKET_STORE = 'basketTasks';
const DIARY_STORE = 'diaryEntries';
const EXERCISE_STORE = 'exerciseSessions';
const LANGUAGE_STORE = 'languageSessions';
const ACTIVITY_KINDS = { exercise:{label:'ورزش',name:'نوع ورزش',fallback:'پیاده‌روی'},language:{label:'مطالعهٔ زبان',name:'زبان مطالعه‌شده',fallback:'انگلیسی'} };
const ACTIVITY_PERIODS = { exercise:{mode:'week', anchor:new Date()},language:{mode:'week',anchor:new Date()} };

const DIARY_MOODS = {none:'بدون برچسب', happy:'شاد 😊', calm:'آرام 🌿', tired:'خسته 😴', sad:'دلگیر 🌧️', hopeful:'امیدوار ✨'};
const BASKET_CATEGORIES = [
  { id: 'work', name: 'کاری و اداری', hint: 'پیگیری‌های شغلی، بانکی، سازمانی و اداری', symbol: '▣' },
  { id: 'study', name: 'تحصیلی', hint: 'درس‌ها، پروژه‌ها، تکلیف‌ها و آموزش', symbol: '▤' },
  { id: 'personal', name: 'شخصی و متفرقه', hint: 'خریدها، کارهای منزل و برنامه‌های شخصی', symbol: '♡' }
];
const BASKET_PRIORITIES = { high: 'فوری', normal: 'عادی', low: 'کم‌اهمیت' };
const BASKET_STATUS = new Set(['pending', 'done', 'all']);
const WEEKDAYS = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];
const persianNumber = new Intl.NumberFormat('fa-IR', { useGrouping: false });
const PERSIAN_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
const persianNumericParts = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', {
  year: 'numeric', month: 'numeric', day: 'numeric'
});
const persianFullDate = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  day: 'numeric', month: 'long', year: 'numeric', numberingSystem: 'arabext'
});
const persianDayMonth = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  day: 'numeric', month: 'long', numberingSystem: 'arabext'
});

let db = null;
let tasks = [];
let reminders = [];
let basketTasks = [];
let diaryEntries = [];
let exerciseSessions = [];
let languageSessions = [];
let activeActivityKind = null;
let diarySearch = '';
let diaryFilteredMonth = null; // {year, month} یا null برای همهٔ تاریخ‌ها
let basketFilter = 'pending';
let basketSearch = '';
let reminderFilter = 'pending';
let weekStart = startOfWeek(new Date());
let toastTimer;
const REPEAT_TYPES = new Set(['none', 'weekly', 'monthly', 'yearly']);
const REPEAT_NAMES = {none: 'بدون تکرار', weekly: 'هفتگی', monthly: 'ماهانه (شمسی)', yearly: 'سالانه (شمسی)'};
const nativeAvailable = () => Boolean(window.AndroidPlanner && typeof window.AndroidPlanner.syncRules === 'function');
let nativeSyncLast = null;
let localDataLoaded = false;

const byId = (id) => document.getElementById(id);
const weekGrid = byId('weekGrid');
const dialog = byId('taskDialog');
const form = byId('taskForm');
const reminderDialog = byId('reminderDialog');
const reminderForm = byId('reminderForm');
const basketDialog = byId('basketDialog');
const basketForm = byId('basketForm');
const diaryDialog = byId('diaryDialog');
const diaryForm = byId('diaryForm');
const activityDialog = byId('activityDialog');
const activityForm = byId('activityForm');

function localNoon(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0);
}
function addDays(date, days) {
  const result = localNoon(date);
  result.setDate(result.getDate() + days);
  return result;
}
function startOfWeek(date) {
  const noon = localNoon(date);
  const daysSinceSaturday = (noon.getDay() + 1) % 7;
  return addDays(noon, -daysSinceSaturday);
}
function isoDay(date) {
  return [String(date.getFullYear()).padStart(4, '0'),
          String(date.getMonth() + 1).padStart(2, '0'),
          String(date.getDate()).padStart(2, '0')].join('-');
}
function parseIsoDay(value) {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}
function isValidDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const result = parseIsoDay(value);
  return !Number.isNaN(result.getTime()) && isoDay(result) === value;
}
function isValidTime(value) {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}
function faNumber(number) {
  return persianNumber.format(number);
}
function faDigits(text) {
  return String(text).replace(/[0-9]/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]);
}
function dayParts(date) {
  const parts = persianDayMonth.formatToParts(date);
  return {
    day: parts.find((p) => p.type === 'day')?.value || '',
    month: parts.find((p) => p.type === 'month')?.value || ''
  };
}
function daysOfWeek() {
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
}
function getPersianYmd(date) {
  const parts = persianNumericParts.formatToParts(date);
  const numberPart = (type) => Number(parts.find((p) => p.type === type)?.value);
  return { year: numberPart('year'), month: numberPart('month'), day: numberPart('day') };
}
function normalizeDigits(text) {
  return String(text).replace(/[۰-۹]/g, (ch) => String(ch.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (ch) => String(ch.charCodeAt(0) - 1632));
}
function persianDateToGregorian(year, month, day) {
  if (!Number.isInteger(year) || year < 1 || year > 3000 || !Number.isInteger(month) ||
      month < 1 || month > 12 || !Number.isInteger(day) || day < 1 || day > 31) return null;
  const spring = new Date(year + 621, 2, 21, 12);
  let firstFarvardin = null;
  for (let delta = -10; delta <= 10; delta++) {
    const candidate = addDays(spring, delta);
    const parts = getPersianYmd(candidate);
    if (parts.year === year && parts.month === 1 && parts.day === 1) {
      firstFarvardin = candidate;
      break;
    }
  }
  if (!firstFarvardin) return null;
  const dayOffset = (month <= 6 ? (month - 1) * 31 : 186 + (month - 7) * 30) + day - 1;
  const converted = addDays(firstFarvardin, dayOffset);
  const actual = getPersianYmd(converted);
  return actual.year === year && actual.month === month && actual.day === day ? converted : null;
}
function updateJumpControls(date) {
  const { year, month, day } = getPersianYmd(date);
  byId('jumpYear').value = faNumber(year);
  byId('jumpMonth').value = String(month);
  byId('jumpDay').value = String(day);
}
function setupJumpControls() {
  const monthSelect = byId('jumpMonth');
  const daySelect = byId('jumpDay');
  PERSIAN_MONTHS.forEach((name, i) => {
    const option = document.createElement('option');
    option.value = String(i + 1);
    option.textContent = name;
    monthSelect.append(option);
  });
  for (let d = 1; d <= 31; d++) {
    const option = document.createElement('option');
    option.value = String(d);
    option.textContent = faNumber(d);
    daySelect.append(option);
  }
}
function jumpToWeek(event) {
  event.preventDefault();
  const year = Number(normalizeDigits(byId('jumpYear').value.trim()));
  const month = Number(byId('jumpMonth').value);
  const day = Number(byId('jumpDay').value);
  const target = persianDateToGregorian(year, month, day);
  if (!target) return showToast('تاریخ شمسی معتبر نیست؛ لطفاً روز، ماه و سال را بررسی کن.');
  weekStart = startOfWeek(target);
  renderWeek();
  showToast('هفتهٔ انتخاب‌شده نمایش داده شد.');
}
function makeId() {
  if (globalThis.crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `task-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
function textNode(tag, value, className) {
  const node = document.createElement(tag);
  node.textContent = value;
  if (className) node.className = className;
  return node;
}
function showToast(message) {
  const toast = byId('toast');
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 3300);
}
function setError(message) {
  const error = byId('formError');
  error.textContent = message;
  error.hidden = !message;
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB در این مرورگر فعال نیست.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('date', 'date', { unique: false });
      }
      if (!database.objectStoreNames.contains(REMINDER_STORE)) {
        const store = database.createObjectStore(REMINDER_STORE, { keyPath: 'id' });
        store.createIndex('date', 'date', { unique: false });
      }
      if (!database.objectStoreNames.contains(BASKET_STORE)) {
        const store = database.createObjectStore(BASKET_STORE, { keyPath: 'id' });
        store.createIndex('category', 'category', {unique: false});
      }
      if (!database.objectStoreNames.contains(DIARY_STORE)) {
        const store = database.createObjectStore(DIARY_STORE, {keyPath:'id'});
        store.createIndex('date', 'date', {unique:false});
      }
      for (const name of [EXERCISE_STORE, LANGUAGE_STORE]) {
        if (!database.objectStoreNames.contains(name)) {
          const store = database.createObjectStore(name, {keyPath:'id'});
          store.createIndex('date', 'date', {unique:false});
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('امکان بازکردن پایگاه داده وجود ندارد.'));
    request.onblocked = () => reject(new Error('یک نسخهٔ دیگر برنامه مانع دسترسی به داده‌ها شده است.'));
  });
}
function readAllTasks() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}
function putTask(task) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(task);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
function deleteTask(id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
function replaceAllTasks(importedTasks) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.clear();
    importedTasks.forEach((task) => store.put(task));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
function readAllReminders() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(REMINDER_STORE, 'readonly');
    const request = tx.objectStore(REMINDER_STORE).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}
function putReminder(reminder) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(REMINDER_STORE, 'readwrite');
    tx.objectStore(REMINDER_STORE).put(reminder);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
function deleteReminder(id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(REMINDER_STORE, 'readwrite');
    tx.objectStore(REMINDER_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
function getAllBasketTasks() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BASKET_STORE, 'readonly');
    const req = tx.objectStore(BASKET_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}
function putBasketTask(item) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BASKET_STORE, 'readwrite');
    tx.objectStore(BASKET_STORE).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
function deleteBasketTask(id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BASKET_STORE, 'readwrite');
    tx.objectStore(BASKET_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
function getAllDiaryEntries() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DIARY_STORE, 'readonly');
    const request = tx.objectStore(DIARY_STORE).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}
function putDiaryEntry(entry) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DIARY_STORE, 'readwrite');
    tx.objectStore(DIARY_STORE).put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
function deleteDiaryEntry(id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DIARY_STORE, 'readwrite');
    tx.objectStore(DIARY_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
function validateDiaryEntry(item) {
  if (!item || typeof item !== 'object' || !isValidDay(item.date) ||
      typeof item.body !== 'string' || !item.body.trim() || item.body.length > 50000 ||
      (item.title != null && (typeof item.title !== 'string' || item.title.length > 120)) ||
      (item.mood != null && !Object.prototype.hasOwnProperty.call(DIARY_MOODS, item.mood))) {
    throw new Error('تاریخ، متن یا اطلاعات دل‌نوشته معتبر نیست. متن را تا ۵۰ هزار نویسه وارد کن.');
  }
  return {
    id: typeof item.id === 'string' && item.id.length > 0 && item.id.length <= 120 ? item.id : makeId(),
    date:item.date,
    title:(item.title || '').trim(),
    body:item.body.trim(),
    mood:item.mood || 'none',
    createdAt:typeof item.createdAt === 'string' && Number.isFinite(Date.parse(item.createdAt)) ? item.createdAt : new Date().toISOString(),
    updatedAt:typeof item.updatedAt === 'string' && Number.isFinite(Date.parse(item.updatedAt)) ? item.updatedAt : new Date().toISOString()
  };
}
function validateDiaryBackup(items) {
  if (!Array.isArray(items) || items.length > 10000) throw new Error('تعداد خاطرات پشتیبان نامعتبر یا بیش از حد است.');
  const seen = new Set();
  return items.map(raw => {
    const item = validateDiaryEntry(raw);
    if (seen.has(item.id)) item.id = makeId();
    seen.add(item.id);
    return item;
  });
}

// Sessions are stored separately from plans and reminders. Both share validation.
function activityStore(kind) {
  if (!Object.prototype.hasOwnProperty.call(ACTIVITY_KINDS, kind)) throw new Error('بخش فعالیت نامعتبر است.');
  return kind === 'exercise' ? EXERCISE_STORE : LANGUAGE_STORE;
}
function getAllActivitySessions(kind) {
  return new Promise((resolve,reject) => {
    const tx = db.transaction(activityStore(kind),'readonly');
    const request = tx.objectStore(activityStore(kind)).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}
function putActivitySession(kind,item) {
  return new Promise((resolve,reject) => {
    const tx = db.transaction(activityStore(kind),'readwrite');
    tx.objectStore(activityStore(kind)).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
function deleteActivitySession(kind,id) {
  return new Promise((resolve,reject) => {
    const tx = db.transaction(activityStore(kind),'readwrite');
    tx.objectStore(activityStore(kind)).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
function validateActivitySession(item,kind) {
  activityStore(kind);
  if (!item || typeof item !== 'object' ||
      !isValidDay(item.date) || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 80 ||
      typeof item.minutes !== 'number' || !Number.isInteger(item.minutes) || item.minutes < 1 || item.minutes > 1440 ||
      (item.notes != null && (typeof item.notes !== 'string' || item.notes.length > 2000)) ||
      (item.notifyEnabled === true && (!isValidTime(item.notifyTime) || !REPEAT_TYPES.has(item.notifyRepeat || 'none')))) {
    throw new Error('اطلاعات فعالیت معتبر نیست. مدت باید بین ۱ تا ۱۴۴۰ دقیقه باشد.');
  }
  return {
    id: typeof item.id === 'string' && item.id.length > 0 && item.id.length <= 120 ? item.id : makeId(),
    date:item.date, name:item.name.trim(), minutes:item.minutes, notes:item.notes || '',
    notifyEnabled:item.notifyEnabled === true,
    notifyTime:item.notifyEnabled === true ? item.notifyTime : '',
    notifyRepeat:item.notifyEnabled === true ? (item.notifyRepeat || 'none') : 'none',
    createdAt:typeof item.createdAt === 'string' && Number.isFinite(Date.parse(item.createdAt)) ? item.createdAt : new Date().toISOString(),
    updatedAt:typeof item.updatedAt === 'string' && Number.isFinite(Date.parse(item.updatedAt)) ? item.updatedAt : new Date().toISOString()
  };
}
function validateActivityBackup(items,kind) {
  if (!Array.isArray(items) || items.length > 30000) throw new Error('تعداد ثبت‌های فعالیت در پشتیبان بیش از حد مجاز است.');
  const seen = new Set();
  return items.map(raw=>{
    const item = validateActivitySession(raw,kind);
    if (seen.has(item.id)) item.id = makeId();
    seen.add(item.id);
    return item;
  });
}

function replaceBackupData(importedTasks, importedReminders, importedBaskets = null, importedDiary = null, importedExercises = null, importedLanguages = null) {
  // بازگردانی نسخهٔ قدیمی نباید داده‌های بخش‌های جدیدتر را پاک کند.
  // نسخهٔ ۵ همهٔ بخش‌ها را در یک تراکنش واحد جایگزین می‌کند.
  const stores = [STORE_NAME];
  if (importedReminders !== null) stores.push(REMINDER_STORE);
  if (importedBaskets !== null) stores.push(BASKET_STORE);
  if (importedDiary !== null) stores.push(DIARY_STORE);
  if (importedExercises !== null) stores.push(EXERCISE_STORE);
  if (importedLanguages !== null) stores.push(LANGUAGE_STORE);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, 'readwrite');
    const taskStore = tx.objectStore(STORE_NAME);
    taskStore.clear();
    importedTasks.forEach(item => taskStore.put(item));
    if (importedReminders !== null) {
      const reminderStore = tx.objectStore(REMINDER_STORE);
      reminderStore.clear();
      importedReminders.forEach(item => reminderStore.put(item));
    }
    if (importedBaskets !== null) {
      const basketStore = tx.objectStore(BASKET_STORE);
      basketStore.clear();
      importedBaskets.forEach(item => basketStore.put(item));
    }
    if (importedDiary !== null) {
      const diaryStore = tx.objectStore(DIARY_STORE);
      diaryStore.clear();
      importedDiary.forEach(item => diaryStore.put(item));
    }
    if (importedExercises !== null) {
      const exerciseStore = tx.objectStore(EXERCISE_STORE);
      exerciseStore.clear();
      importedExercises.forEach(item => exerciseStore.put(item));
    }
    if (importedLanguages !== null) {
      const languageStore = tx.objectStore(LANGUAGE_STORE);
      languageStore.clear();
      importedLanguages.forEach(item => languageStore.put(item));
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
async function refresh() {
  [tasks, reminders, basketTasks, diaryEntries, exerciseSessions, languageSessions] = await Promise.all([
    readAllTasks(),readAllReminders(),getAllBasketTasks(),getAllDiaryEntries(),
    getAllActivitySessions('exercise'),getAllActivitySessions('language')
  ]);
  localDataLoaded = true;
  renderWeek();
  renderReminders();
  renderBaskets();
  renderDiary();
  renderActivityPanel('exercise');
  renderActivityPanel('language');
  syncToNative();
  renderNotificationCenter();
  if (typeof window.dispatchEvent === 'function' && typeof window.CustomEvent === 'function') {
    window.dispatchEvent(new window.CustomEvent('rooz:data', {detail: homeSummary()}));
  }
}
function homeSummary() {
  const now = new Date(), today=isoDay(now), week=isoDay(startOfWeek(now));
  const weekEnd=isoDay(addDays(startOfWeek(now),7));
  const current = item => item.date >= week && item.date < weekEnd;
  const upcoming = [];
  for (const t of tasks.filter(t=>!t.done)) {
    const time = new Date(`${t.date}T${t.start}:00`);
    if (time.getTime() >= now.getTime() - 3600000) upcoming.push({title:t.title, when:time.getTime(), type:'برنامه', page:'planner'});
  }
  for (const r of reminders.filter(r=>!r.done)) {
    const time = nextOccurrenceLocal({date:r.date, time:r.time, repeat:r.notifyRepeat || 'none'},new Date(now.getTime()-60000));
    if (time) upcoming.push({title:r.title, when:time.getTime(), type:'یادآوری', page:'reminders'});
  }
  upcoming.sort((a,b)=>a.when-b.when);
  return {
    todayTasks:tasks.filter(t=>t.date===today && !t.done).length,
    pendingReminders:reminders.filter(r=>!r.done).length,
    pendingBaskets:basketTasks.filter(b=>!b.done).length,
    exerciseMinutes:exerciseSessions.filter(current).reduce((n,e)=>n+e.minutes,0),
    languageMinutes:languageSessions.filter(current).reduce((n,e)=>n+e.minutes,0),
    upcoming:upcoming.slice(0,5)
  };
}
function renderWeek() {
  const days = daysOfWeek();
  const first = days[0];
  const last = days[6];
  updateJumpControls(first);
  byId('weekTitle').textContent = `${persianFullDate.format(first)} تا ${persianFullDate.format(last)}`;
  byId('weekSubtitle').textContent = 'شنبه تا جمعه · تقویم هجری شمسی';
  const dates = new Set(days.map(isoDay));
  const weeklyTasks = tasks.filter((task) => dates.has(task.date));
  byId('totalCount').textContent = faNumber(weeklyTasks.length);
  byId('doneCount').textContent = faNumber(weeklyTasks.filter((task) => task.done).length);
  byId('remainingCount').textContent = faNumber(weeklyTasks.filter((task) => !task.done).length);
  const today = isoDay(new Date());
  const fragment = document.createDocumentFragment();
  days.forEach((day, index) => {
    const date = isoDay(day);
    const events = weeklyTasks.filter((task) => task.date === date)
      .sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
    const card = document.createElement('article');
    card.className = 'day-card' + (date === today ? ' today' : '');
    const header = textNode('div', '', 'day-head');
    const headLine = textNode('div', '', 'day-headline');
    const { day: persianDay, month } = dayParts(day);
    headLine.append(textNode('div', persianDay, 'date-tile'));
    const labels = document.createElement('div');
    labels.append(textNode('div', WEEKDAYS[index], 'day-name'));
    labels.append(textNode('div', `${month}${date === today ? ' · امروز' : ''}`, 'day-month'));
    headLine.append(labels);
    header.append(headLine, textNode('span', `${faNumber(events.length)} برنامه`, 'day-count' + (events.length ? ' has-events' : '')));
    card.append(header);
    const eventList = textNode('div', '', 'events');
    if (!events.length) {
      eventList.append(textNode('div', 'هنوز برنامه‌ای برای این روز نداری.', 'empty-day'));
    }
    events.forEach((event) => {
      const item = document.createElement('div');
      item.className = 'event' + (event.done ? ' done' : '');
      const main = textNode('div', '', 'event-main');
      const info = textNode('div', '', 'event-info');
      info.append(textNode('div', `${event.start} – ${event.end}`, 'event-time'));
      info.append(textNode('div', event.title, 'event-title'));
      if (event.notes) info.append(textNode('div', event.notes, 'event-notes'));
      const toggle = document.createElement('input');
      toggle.type = 'checkbox';
      toggle.className = 'done-toggle';
      toggle.checked = Boolean(event.done);
      toggle.dataset.taskId = event.id;
      toggle.setAttribute('aria-label', `علامت انجام‌شدنِ ${event.title}`);
      main.append(info, toggle);
      const actions = textNode('div', '', 'event-actions');
      const edit = textNode('button', 'ویرایش', 'text-btn');
      edit.type = 'button';
      edit.dataset.action = 'edit';
      edit.dataset.taskId = event.id;
      const remove = textNode('button', 'حذف', 'text-btn danger');
      remove.type = 'button';
      remove.dataset.action = 'remove';
      remove.dataset.taskId = event.id;
      actions.append(edit, remove);
      item.append(main, actions);
      if (event.notifyEnabled) {
        info.append(textNode('div', `🔔 ${getTaskNotifyLabel(event.notifyOffset || 0)} · ${REPEAT_NAMES[event.notifyRepeat || 'none']}`, 'event-notes'));
      }
      eventList.append(item);
    });
    card.append(eventList);
    const add = textNode('button', '＋ افزودن برنامه به این روز', 'add-day');
    add.type = 'button';
    add.dataset.action = 'add';
    add.dataset.date = date;
    card.append(add);
    fragment.append(card);
  });
  weekGrid.replaceChildren(fragment);
}
function populateDays(selectedDay) {
  const dropdown = byId('taskDay');
  dropdown.replaceChildren();
  daysOfWeek().forEach((date, index) => {
    const option = document.createElement('option');
    option.value = isoDay(date);
    option.textContent = `${WEEKDAYS[index]}، ${persianFullDate.format(date)}`;
    dropdown.append(option);
  });
  dropdown.value = selectedDay;
}
function openTaskDialog({ date, task = null } = {}) {
  form.reset();
  setError('');
  byId('taskId').value = task?.id || '';
  byId('dialogTitle').textContent = task ? 'ویرایش برنامه' : 'برنامهٔ جدید';
  byId('saveTask').textContent = task ? 'ذخیرهٔ تغییرات' : 'ذخیرهٔ برنامه';
  const today = isoDay(new Date());
  const selectedDay = task?.date || date || (daysOfWeek().some((day) => isoDay(day) === today) ? today : isoDay(weekStart));
  populateDays(selectedDay);
  byId('taskTitle').value = task?.title || '';
  byId('taskStart').value = task?.start || '09:00';
  byId('taskEnd').value = task?.end || '10:00';
  byId('taskNotes').value = task?.notes || '';
  byId('taskNotify').value = task?.notifyEnabled ? String(task.notifyOffset || 0) : 'off';
  byId('taskRepeat').value = task?.notifyRepeat || 'none';
  dialog.showModal();
  requestAnimationFrame(() => byId('taskTitle').focus());
}
async function submitTask(event) {
  event.preventDefault();
  if (!db) return;
  setError('');
  const title = byId('taskTitle').value.trim();
  const date = byId('taskDay').value;
  const start = byId('taskStart').value;
  const end = byId('taskEnd').value;
  const notes = byId('taskNotes').value.trim();
  const notifyEnabled = byId('taskNotify').value !== 'off';
  const notifyOffset = notifyEnabled ? Number(byId('taskNotify').value) : 0;
  const notifyRepeat = notifyEnabled ? byId('taskRepeat').value : 'none';
  if (![0,5,15,30,60].includes(notifyOffset) || !REPEAT_TYPES.has(notifyRepeat)) return setError('تنظیم اعلان معتبر نیست.');
  if (!title) return setError('لطفاً عنوان برنامه را بنویس.');
  if (title.length > 100 || notes.length > 2000) return setError('عنوان یا توضیحات بیش از اندازه طولانی است.');
  if (!isValidDay(date) || !isValidTime(start) || !isValidTime(end)) return setError('روز یا ساعت واردشده معتبر نیست.');
  if (end <= start) return setError('ساعت پایان باید بعد از ساعت شروع باشد (هر برنامه در یک روز ثبت می‌شود).');
  const previous = tasks.find((task) => task.id === byId('taskId').value);
  const task = {
    id: previous?.id || makeId(),
    title, date, start, end, notes, notifyEnabled, notifyOffset, notifyRepeat,
    done: previous?.done || false,
    updatedAt: new Date().toISOString()
  };
  const saveButton = byId('saveTask');
  saveButton.disabled = true;
  try {
    await putTask(task);
    await refresh();
    dialog.close();
    showToast(previous ? 'برنامه ویرایش شد.' : 'برنامه با موفقیت ثبت شد.');
  } catch (error) {
    console.error(error);
    setError('ذخیره انجام نشد. لطفاً فضای ذخیره‌سازی مرورگر را بررسی کن.');
  } finally {
    saveButton.disabled = false;
  }
}
async function onWeekGridClick(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  if (action === 'add') return openTaskDialog({ date: button.dataset.date });
  const task = tasks.find((item) => item.id === button.dataset.taskId);
  if (!task) return;
  if (action === 'edit') return openTaskDialog({ task });
  if (action === 'remove' && confirm(`برنامهٔ «${task.title}» حذف شود؟`)) {
    try {
      await deleteTask(task.id);
      await refresh();
      showToast('برنامه حذف شد.');
    } catch (error) {
      console.error(error);
      showToast('حذف برنامه انجام نشد.');
    }
  }
}
async function onWeekGridChange(event) {
  const checkbox = event.target.closest('input[data-task-id]');
  if (!checkbox) return;
  const task = tasks.find((item) => item.id === checkbox.dataset.taskId);
  if (!task) return;
  checkbox.disabled = true;
  try {
    await putTask({ ...task, done: checkbox.checked, updatedAt: new Date().toISOString() });
    await refresh();
    showToast(checkbox.checked ? 'آفرین! انجام شد.' : 'به برنامه‌های باقی‌مانده برگشت.');
  } catch (error) {
    console.error(error);
    checkbox.disabled = false;
    checkbox.checked = !checkbox.checked;
    showToast('تغییر وضعیت ذخیره نشد.');
  }
}
function exportBackup() {
  const backup = {
    app: 'rooz-e-man', version: 8, exportedAt: new Date().toISOString(),
    tasks, reminders, basketTasks, diaryEntries, exerciseSessions, languageSessions
  };
  if (nativeAvailable() && typeof window.AndroidPlanner.exportBackup === 'function') {
    window.AndroidPlanner.exportBackup(JSON.stringify(backup, null, 2));
    return;
  }
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `rooz-e-man-backup-${isoDay(new Date())}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
  showToast('پشتیبان همهٔ بخش‌ها، از جمله ورزش و زبان، آماده شد.');
}
function validateBackup(raw) {
  if (!raw || raw.app !== 'rooz-e-man' || ![1, 2, 3, 4, 5, 6, 7, 8].includes(raw.version) ||
    !Array.isArray(raw.tasks) || (raw.version >= 2 && !Array.isArray(raw.reminders)) ||
    (raw.version >= 4 && !Array.isArray(raw.basketTasks)) ||
    (raw.version >= 5 && !Array.isArray(raw.diaryEntries)) ||
    (raw.version >= 6 && !Array.isArray(raw.exerciseSessions)) ||
    (raw.version >= 7 && !Array.isArray(raw.languageSessions))) {
    throw new Error('فایل پشتیبان معتبر نیست یا متعلق به این برنامه نیست.');
  }
  if (raw.tasks.length > 10000) throw new Error('تعداد برنامه‌ها در فایل بیش از حد مجاز است.');
  const seenIds = new Set();
  const importedTasks = raw.tasks.map((item) => {
    if (!item || typeof item.title !== 'string' || !item.title.trim() || item.title.length > 100 ||
      !isValidDay(item.date) || !isValidTime(item.start) || !isValidTime(item.end) || item.end <= item.start ||
      (item.notes != null && (typeof item.notes !== 'string' || item.notes.length > 2000))) {
      throw new Error('یکی از برنامه‌های موجود در فایل، اطلاعات نامعتبر دارد.');
    }
    let id = typeof item.id === 'string' && item.id.length <= 120 && item.id ? item.id : makeId();
    if (seenIds.has(id)) id = makeId();
    seenIds.add(id);
    return {
      id,
      date: item.date,
      title: item.title.trim(),
      start: item.start,
      end: item.end,
      notes: item.notes || '',
      done: item.done === true,
      notifyEnabled: item.notifyEnabled === true,
      notifyOffset: [0,5,15,30,60].includes(item.notifyOffset) ? item.notifyOffset : 0,
      notifyRepeat: REPEAT_TYPES.has(item.notifyRepeat) ? item.notifyRepeat : 'none',
      updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt.slice(0, 40) : new Date().toISOString()
    };
  });
  if (raw.version === 1) return { tasks: importedTasks, reminders: null, basketTasks: null, version: 1 };
  if (raw.reminders.length > 10000) throw new Error('تعداد یادآوری‌ها در فایل بیش از حد مجاز است.');
  const seenReminderIds = new Set();
  const importedReminders = raw.reminders.map((item) => {
    if (!item || typeof item.title !== 'string' || !item.title.trim() || item.title.length > 100 ||
      !isValidDay(item.date) || !isValidTime(item.time) ||
      (item.notes != null && (typeof item.notes !== 'string' || item.notes.length > 2000))) {
      throw new Error('یکی از یادآوری‌های موجود در فایل نامعتبر است.');
    }
    let id = typeof item.id === 'string' && item.id.length <= 120 && item.id ? item.id : makeId();
    if (seenReminderIds.has(id)) id = makeId();
    seenReminderIds.add(id);
    return {
      id, title: item.title.trim(), date: item.date, time: item.time,
      notes: item.notes || '', done: item.done === true,
      notifyEnabled: item.notifyEnabled !== false,
      notifyRepeat: REPEAT_TYPES.has(item.notifyRepeat) ? item.notifyRepeat : 'none',
      updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt.slice(0, 40) : new Date().toISOString()
    };
  });
  const importedBaskets = raw.version >= 4 ? validateBasketBackup(raw.basketTasks) : null;
  const importedDiary = raw.version >= 5 ? validateDiaryBackup(raw.diaryEntries) : null;
  const importedExercises = raw.version >= 6 ? validateActivityBackup(raw.exerciseSessions,'exercise') : null;
  const importedLanguages = raw.version >= 7 ? validateActivityBackup(raw.languageSessions,'language') : null;
  return { tasks: importedTasks, reminders: importedReminders, basketTasks: importedBaskets,
    diaryEntries: importedDiary, exerciseSessions: importedExercises, languageSessions: importedLanguages, version: raw.version };
}
async function importBackup(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    if (file.size > 25 * 1024 * 1024) throw new Error('حجم فایل بیش از ۲۵ مگابایت است.');
    const imported = validateBackup(JSON.parse(await file.text()));
    const countText = `${faNumber(imported.tasks.length)} برنامه، ${faNumber(imported.reminders?.length || 0)} یادآوری، ${faNumber(imported.basketTasks?.length || 0)} کار سبد`;
    const message = `بازگردانی پشتیبان نسخهٔ ${faNumber(imported.version)} (${countText}) انجام شود؟ فقط بخش‌هایی که در این فایل وجود دارند جایگزین می‌شوند. اطلاعات بخش‌های جدیدتر، اگر در پشتیبان قدیمی نباشند، محفوظ می‌مانند.`;
    if (!confirm(message)) return;
    await replaceBackupData(imported.tasks, imported.reminders, imported.basketTasks,
      imported.diaryEntries ?? null, imported.exerciseSessions ?? null, imported.languageSessions ?? null);
    await refresh();
    showToast('بازیابی با موفقیت انجام شد.');
  } catch (error) {
    console.error(error);
    alert(error instanceof SyntaxError ? 'فرمت فایل JSON معتبر نیست.' : (error.message || 'بازیابی انجام نشد.'));
  } finally {
    event.target.value = '';
  }
}
// ---------------------------------------------------------------------------
// Persian-date reminders (v2) enhanced with native Android notification rules (v3).
// ---------------------------------------------------------------------------
function fillReminderDateDropdowns() {
  const monthSelect = byId('reminderMonth');
  const daySelect = byId('reminderDay');
  PERSIAN_MONTHS.forEach((month, index) => {
    const option = document.createElement('option');
    option.value = String(index + 1);
    option.textContent = month;
    monthSelect.append(option);
  });
  for (let day = 1; day <= 31; day++) {
    const option = document.createElement('option');
    option.value = String(day);
    option.textContent = faNumber(day);
    daySelect.append(option);
  }
}
function setReminderPersianDate(date) {
  const {year, month, day} = getPersianYmd(date);
  byId('reminderYear').value = faNumber(year);
  byId('reminderMonth').value = String(month);
  byId('reminderDay').value = String(day);
  previewReminderDate();
}
function selectedReminderDate() {
  const year = Number(normalizeDigits(byId('reminderYear').value.trim()));
  const month = Number(byId('reminderMonth').value);
  const day = Number(byId('reminderDay').value);
  return persianDateToGregorian(year, month, day);
}
function previewReminderDate() {
  const date = selectedReminderDate();
  const label = byId('reminderDatePreview');
  label.textContent = date ? persianFullDate.format(date) : 'تاریخ شمسی نامعتبر است';
  label.classList.toggle('invalid', !date);
}
function setReminderError(message) {
  const element = byId('reminderFormError');
  element.textContent = message;
  element.hidden = !message;
}
function openReminderDialog(reminder = null) {
  reminderForm.reset();
  setReminderError('');
  byId('reminderId').value = reminder?.id || '';
  byId('reminderDialogTitle').textContent = reminder ? 'ویرایش یادآوری' : 'یادآوری جدید';
  byId('saveReminder').textContent = reminder ? 'ذخیرهٔ تغییرات' : 'ذخیرهٔ یادآوری';
  byId('reminderTitle').value = reminder?.title || '';
  byId('reminderNotes').value = reminder?.notes || '';
  byId('reminderTime').value = reminder?.time || '09:00';
  byId('reminderNotify').checked = reminder?.notifyEnabled !== false;
  byId('reminderRepeat').value = reminder?.notifyRepeat || 'none';
  setReminderPersianDate(reminder ? parseIsoDay(reminder.date) : new Date());
  reminderDialog.showModal();
  requestAnimationFrame(() => byId('reminderTitle').focus());
}
async function submitReminder(event) {
  event.preventDefault();
  if (!db) return;
  setReminderError('');
  const title = byId('reminderTitle').value.trim();
  const time = byId('reminderTime').value;
  const notes = byId('reminderNotes').value.trim();
  const notifyEnabled = byId('reminderNotify').checked;
  const notifyRepeat = notifyEnabled ? byId('reminderRepeat').value : 'none';
  if (!REPEAT_TYPES.has(notifyRepeat)) return setReminderError('تکرار اعلان نامعتبر است.');
  const dateValue = selectedReminderDate();
  if (!title) return setReminderError('عنوان یادآوری را وارد کن.');
  if (title.length > 100 || notes.length > 2000) return setReminderError('عنوان یا توضیحات بیش از اندازه طولانی است.');
  if (!dateValue) return setReminderError('تاریخ شمسی درست نیست؛ ماه، روز و سال را بررسی کن.');
  if (!isValidTime(time)) return setReminderError('ساعت یادآوری معتبر نیست.');
  const previous = reminders.find((reminder) => reminder.id === byId('reminderId').value);
  const reminder = {
    id: previous?.id || makeId(), title, date: isoDay(dateValue), time, notes, notifyEnabled, notifyRepeat,
    done: previous?.done || false,
    updatedAt: new Date().toISOString()
  };
  const button = byId('saveReminder');
  button.disabled = true;
  try {
    await putReminder(reminder);
    await refresh();
    reminderDialog.close();
    reminderFilter = 'pending';
    renderReminders();
    showToast(previous ? 'یادآوری ویرایش شد.' : 'یادآوری جدید ثبت شد.');
  } catch (error) {
    console.error(error);
    setReminderError('امکان ذخیره‌سازی وجود ندارد؛ فضای حافظه را بررسی کن.');
  } finally {
    button.disabled = false;
  }
}
function nextOccurrenceLocal({date, time, repeat = 'none', offsetMinutes = 0}, after = new Date()) {
  const original = new Date(`${date}T${time}:00`);
  if (Number.isNaN(original.getTime())) return null;
  const shift = (offsetMinutes || 0) * 60000;
  if (repeat === 'none') return original.getTime() - shift > after.getTime() ? new Date(original.getTime()-shift) : null;
  if (repeat === 'weekly') {
    const days = Math.max(0, Math.floor((after.getTime()-(original.getTime()-shift))/604800000)-2);
    for (let i=days;i<days+6;i++) {
      const next = addDays(original, i*7);
      next.setHours(original.getHours(),original.getMinutes(),0,0);
      if (next.getTime()-shift > after.getTime()) return new Date(next.getTime()-shift);
    }
    return null;
  }
  const {year,month,day} = getPersianYmd(original);
  const step = repeat === 'monthly' ? 1 : 12;
  for(let i=0;i<3600/step;i++) {
    const number = year*12+(month-1)+step*i;
    const y = Math.floor(number/12), m = number%12+1;
    let candidate;
    for(let d=day;d>=1;d--) { candidate=persianDateToGregorian(y,m,d); if(candidate) break; }
    if (!candidate) continue;
    candidate.setHours(original.getHours(),original.getMinutes(),0,0);
    if(candidate.getTime()-shift > after.getTime()) return new Date(candidate.getTime()-shift);
  }
  return null;
}
function getReminderState(reminder, now = new Date()) {
  if (reminder.done) return 'done';
  const next = reminder.notifyRepeat && reminder.notifyRepeat !== 'none' ?
    nextOccurrenceLocal({...reminder,repeat:reminder.notifyRepeat}, now) : null;
  if (next) return isoDay(next) === isoDay(now) ? 'today' : 'upcoming';
  const time = new Date(`${reminder.date}T${reminder.time}:00`);
  if (time.getTime() < now.getTime()) return 'overdue';
  if (reminder.date === isoDay(now)) return 'today';
  return 'upcoming';
}
function renderReminders() {
  const now = new Date();
  const pending = reminders.filter((reminder) => !reminder.done);
  byId('pendingReminders').textContent = faNumber(pending.length);
  byId('overdueReminders').textContent = faNumber(pending.filter((reminder) => getReminderState(reminder, now) === 'overdue').length);
  byId('completedReminders').textContent = faNumber(reminders.length - pending.length);
  const selected = reminders.filter((reminder) => reminderFilter === 'all' ||
    (reminderFilter === 'done' ? reminder.done : !reminder.done));
  selected.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  byId('reminderListCount').textContent = `${faNumber(selected.length)} مورد`;
  document.querySelectorAll('.filter-btn').forEach((button) => {
    const active = button.dataset.filter === reminderFilter;
    button.classList.toggle('selected', active);
    button.setAttribute('aria-pressed', String(active));
  });
  const fragment = document.createDocumentFragment();
  if (!selected.length) {
    const message = reminderFilter === 'pending' ? 'یادآوریِ انجام‌نشده‌ای نداری. برای ثبت مورد تازه، «یادآوری جدید» را بزن.' :
      (reminderFilter === 'done' ? 'هنوز هیچ یادآوری‌ای را انجام‌شده علامت نزده‌ای.' : 'هنوز یادآوری‌ای ثبت نشده است.');
    fragment.append(textNode('div', message, 'reminders-empty'));
  }
  selected.forEach((reminder) => {
    const status = getReminderState(reminder, now);
    const item = textNode('article', '', `reminder-card status-${status}`);
    const top = textNode('div', '', 'reminder-card-head');
    const titleInfo = textNode('div', '', 'reminder-info');
    const title = textNode('h3', reminder.title, 'reminder-title');
    const dateRow = textNode('div', '', 'reminder-date-row');
    const date = parseIsoDay(reminder.date);
    dateRow.append(textNode('span', `${persianFullDate.format(date)} · ساعت ${faDigits(reminder.time)}`, 'reminder-date'));
    titleInfo.append(title, dateRow);
    if (reminder.notifyEnabled !== false) {
      let caption = `🔔 ${REPEAT_NAMES[reminder.notifyRepeat || 'none']}`;
      if (reminder.notifyRepeat && reminder.notifyRepeat !== 'none' && !reminder.done) {
        const next = nextOccurrenceLocal({...reminder,repeat:reminder.notifyRepeat}, new Date());
        if (next) caption += ` · موعد بعد: ${persianFullDate.format(next)}`;
      }
      titleInfo.append(textNode('div', caption, 'reminder-date'));
    }
    const statusNames = { done: 'انجام‌شده', overdue: 'سررسید گذشته', today: 'امروز', upcoming: 'آینده' };
    top.append(titleInfo, textNode('span', statusNames[status], `status-pill status-pill-${status}`));
    item.append(top);
    if (reminder.notes) item.append(textNode('p', reminder.notes, 'reminder-notes'));
    const bottom = textNode('div', '', 'reminder-card-actions');
    const toggleLabel = document.createElement('label');
    toggleLabel.className = 'reminder-check-label';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'done-toggle';
    checkbox.dataset.reminderId = reminder.id;
    checkbox.checked = Boolean(reminder.done);
    checkbox.setAttribute('aria-label', `علامت انجام‌شدنِ ${reminder.title}`);
    toggleLabel.append(checkbox, textNode('span', 'انجام شد', ''));
    const actions = textNode('div', '', 'reminder-text-actions');
    const edit = textNode('button', 'ویرایش', 'text-btn');
    edit.type = 'button';
    edit.dataset.action = 'edit';
    edit.dataset.reminderId = reminder.id;
    const remove = textNode('button', 'حذف', 'text-btn danger');
    remove.type = 'button';
    remove.dataset.action = 'remove';
    remove.dataset.reminderId = reminder.id;
    actions.append(edit, remove);
    bottom.append(toggleLabel, actions);
    item.append(bottom);
    fragment.append(item);
  });
  byId('reminderList').replaceChildren(fragment);
}
async function onReminderClick(event) {
  const button = event.target.closest('button[data-action][data-reminder-id]');
  if (!button) return;
  const reminder = reminders.find((item) => item.id === button.dataset.reminderId);
  if (!reminder) return;
  if (button.dataset.action === 'edit') return openReminderDialog(reminder);
  if (button.dataset.action === 'remove' && confirm(`یادآوری «${reminder.title}» حذف شود؟`)) {
    try {
      await deleteReminder(reminder.id);
      await refresh();
      showToast('یادآوری حذف شد.');
    } catch (error) {
      console.error(error);
      showToast('حذف یادآوری انجام نشد.');
    }
  }
}
async function onReminderChange(event) {
  const checkbox = event.target.closest('input[data-reminder-id]');
  if (!checkbox) return;
  const reminder = reminders.find((item) => item.id === checkbox.dataset.reminderId);
  if (!reminder) return;
  checkbox.disabled = true;
  try {
    await putReminder({ ...reminder, done: checkbox.checked, updatedAt: new Date().toISOString() });
    await refresh();
    showToast(checkbox.checked ? 'یادآوری انجام‌شده ثبت شد.' : 'یادآوری به فهرست انتظار برگشت.');
  } catch (error) {
    console.error(error);
    checkbox.checked = !checkbox.checked;
    checkbox.disabled = false;
    showToast('ذخیرهٔ تغییرات انجام نشد.');
  }
}
// Stage 3: the offline Android application schedules alarms itself. The browser
// variant keeps editing and backing up data, but has no reliable offline alarm.
function getTaskNotifyLabel(offset) {
  if (!offset) return 'هنگام شروع';
  return `${faNumber(offset)} دقیقه پیش از شروع`;
}
function buildNotificationRules() {
  return [
    ...tasks.filter(t => t.notifyEnabled && !t.done).map(t => ({
      id: 'task:'+t.id, title: t.title, notes: t.notes || '', date: t.date, time: t.start,
      offsetMinutes: t.notifyOffset || 0, repeat: t.notifyRepeat || 'none', kind: 'task'
    })),
    ...reminders.filter(r => r.notifyEnabled !== false && !r.done).map(r => ({
      id: 'reminder:'+r.id, title: r.title, notes: r.notes || '', date: r.date, time: r.time,
      offsetMinutes: 0, repeat: r.notifyRepeat || 'none', kind: 'reminder'
    })),
    ...basketTasks.filter(b => b.notifyEnabled && !b.done && isValidDay(b.notifyDate) && isValidTime(b.notifyTime)).map(b => ({
      id: 'basket:'+b.id, title: b.title, notes: b.notes || '', date: b.notifyDate, time: b.notifyTime,
      offsetMinutes: 0, repeat: b.notifyRepeat || 'none', kind: 'basket'
    })),
    ...exerciseSessions.filter(e => e.notifyEnabled && isValidTime(e.notifyTime)).map(e => ({
      id:'exercise:'+e.id,title:'زمان ورزش: '+e.name,notes:e.notes || '',date:e.date,time:e.notifyTime,
      offsetMinutes:0,repeat:e.notifyRepeat || 'none',kind:'exercise'
    })),
    ...languageSessions.filter(l => l.notifyEnabled && isValidTime(l.notifyTime)).map(l => ({
      id:'language:'+l.id,title:'زمان مطالعهٔ زبان: '+l.name,notes:l.notes || '',date:l.date,time:l.notifyTime,
      offsetMinutes:0,repeat:l.notifyRepeat || 'none',kind:'language'
    }))
  ];
}
function syncToNative() {
  if (!nativeAvailable() || !localDataLoaded) return;
  const data = JSON.stringify(buildNotificationRules());
  if (data === nativeSyncLast) return;
  try {
    window.AndroidPlanner.syncRules(data);
    nativeSyncLast = data;
  } catch (error) { console.warn('Native notification sync failed', error); }
}
function getNativeStatus() {
  if (!nativeAvailable()) return null;
  try {return JSON.parse(window.AndroidPlanner.getStatus());} catch {return null;}
}
function requestNativePermissions() {
  if (!nativeAvailable()) { showToast('اعلان آفلاین فقط در نسخهٔ اندروید فعال است.'); return; }
  window.AndroidPlanner.requestPermissions();
}
function testNativeNotification() {
  if (!nativeAvailable()) { showToast('این آزمایش به برنامهٔ اندروید نیاز دارد.'); return; }
  window.AndroidPlanner.testNotification();
  setTimeout(renderNotificationCenter, 400);
}
function acknowledgeFromInbox(event) {
  const button = event.target.closest('button[data-occurrence]');
  if (!button || !nativeAvailable()) return;
  window.AndroidPlanner.acknowledge(button.dataset.id, button.dataset.occurrence);
  setTimeout(renderNotificationCenter, 150);
}
function renderNotificationCenter() {
  const status = getNativeStatus();
  byId('nativeStatus').textContent = !status ? 'نسخهٔ مرورگر: اعلان آفلاین در زمان بسته بودن برنامه فعال نیست.' :
    (!status.notifications ? 'اجازهٔ نمایش اعلان داده نشده است.' :
    (!status.exact ? 'اجازهٔ هشدار دقیق داده نشده؛ هشدارها ممکن است با تأخیر برسند.' : 'اعلان آفلاین و هشدار دقیق فعال‌اند.'));
  byId('permissionBtn').hidden = !status || (status.notifications && status.exact);
  byId('testNotificationBtn').disabled = !status || !status.notifications;
  const node = byId('notificationInbox');
  node.replaceChildren();
  if (!status) {
    node.append(textNode('p', 'برای دریافت اعلان‌های واقعیِ آفلاین، APK اندروید را نصب کن. در نسخهٔ وب می‌توانی زمان و تکرار یادآوری‌ها را ثبت و ویرایش کنی.', 'reminders-empty'));
    byId('inboxCount').textContent = '—';
    return;
  }
  let inbox = [];
  try { inbox = JSON.parse(window.AndroidPlanner.getInbox()); } catch (e) { console.warn(e); }
  byId('inboxCount').textContent = faNumber(inbox.length);
  if (!inbox.length) node.append(textNode('p', 'هنوز اعلان مشاهده‌نشده‌ای نداری.', 'reminders-empty'));
  inbox.slice().sort((a,b) => b.occurrence-a.occurrence).forEach(item => {
    const card = textNode('div', '', 'inbox-card');
    card.append(textNode('strong', item.title, ''));
    card.append(textNode('span', `${persianFullDate.format(new Date(item.occurrence))} · ${faDigits(new Date(item.occurrence).toLocaleTimeString('en-GB', {hour:'2-digit',minute:'2-digit'}))}`, 'reminder-date'));
    const btn = textNode('button', '✓ مشاهده شد', 'outline-btn');
    btn.dataset.id = item.id;
    btn.dataset.occurrence = String(item.occurrence);
    btn.type = 'button';
    card.append(btn);
    node.append(card);
  });
}
window.onNativeStatusChanged = function() {
  nativeSyncLast = null;
  syncToNative();
  renderNotificationCenter();
};

// ---------------------------------------------------------------------------
// Stage 4: undated work / study / personal task baskets. Items without a scheduled
// notification do not need a date or time. Optional alarms use Android.
// ---------------------------------------------------------------------------
function validateBasketItem(item) {
  if (!item || typeof item.title !== 'string' || !item.title.trim() || item.title.length > 100 ||
      !BASKET_CATEGORIES.some(c => c.id === item.category) ||
      !Object.prototype.hasOwnProperty.call(BASKET_PRIORITIES, item.priority) ||
      (item.notes != null && (typeof item.notes !== 'string' || item.notes.length > 2000)) ||
      (item.notifyEnabled === true && (!isValidDay(item.notifyDate) || !isValidTime(item.notifyTime) ||
        !REPEAT_TYPES.has(item.notifyRepeat || 'none')))) {
    throw new Error('اطلاعات یکی از کارهای سبد معتبر نیست.');
  }
  return {
    id: typeof item.id === 'string' && item.id.length <= 120 && item.id ? item.id : makeId(),
    title: item.title.trim(), category: item.category,
    notes: item.notes || '', priority: item.priority,
    done: item.done === true,
    notifyEnabled: item.notifyEnabled === true,
    notifyDate: item.notifyEnabled === true ? item.notifyDate : '',
    notifyTime: item.notifyEnabled === true ? item.notifyTime : '',
    notifyRepeat: item.notifyEnabled === true ? (item.notifyRepeat || 'none') : 'none',
    createdAt: typeof item.createdAt === 'string' && !Number.isNaN(Date.parse(item.createdAt))
      ? item.createdAt.slice(0, 40) : new Date().toISOString(),
    updatedAt: typeof item.updatedAt === 'string' && !Number.isNaN(Date.parse(item.updatedAt))
      ? item.updatedAt.slice(0, 40) : new Date().toISOString()
  };
}
function validateBasketBackup(items) {
  if (!Array.isArray(items) || items.length > 10000) throw new Error('تعداد کارهای سبد در پشتیبان معتبر نیست.');
  const ids = new Set();
  return items.map(item => {
    const valid = validateBasketItem(item);
    if (ids.has(valid.id)) valid.id = makeId();
    ids.add(valid.id);
    return valid;
  });
}
function fillBasketNotificationDate() {
  const months = byId('basketNotifyMonth');
  PERSIAN_MONTHS.forEach((month, i) => {
    const opt = document.createElement('option');
    opt.value = String(i+1); opt.textContent = month; months.append(opt);
  });
  const days = byId('basketNotifyDay');
  for (let n=1;n<=31;n++) {
    const opt = document.createElement('option');
    opt.value=String(n); opt.textContent=faNumber(n); days.append(opt);
  }
}
function setBasketNotifyDate(date) {
  const {year,month,day} = getPersianYmd(date);
  byId('basketNotifyYear').value=faNumber(year);
  byId('basketNotifyMonth').value=String(month);
  byId('basketNotifyDay').value=String(day);
  previewBasketNotifyDate();
}
function selectedBasketNotifyDate() {
  const year=Number(normalizeDigits(byId('basketNotifyYear').value.trim()));
  const month=Number(byId('basketNotifyMonth').value);
  const day=Number(byId('basketNotifyDay').value);
  return persianDateToGregorian(year,month,day);
}
function previewBasketNotifyDate() {
  const date=selectedBasketNotifyDate();
  const caption=byId('basketNotifyPreview');
  caption.textContent=date?persianFullDate.format(date):'تاریخ شمسی نامعتبر است';
  caption.classList.toggle('invalid', !date);
}
function toggleBasketNotify() {
  byId('basketNotifyFields').hidden = !byId('basketNotify').checked;
}
function fillBasketCategories() {
  const options = byId('basketCategory');
  options.replaceChildren();
  BASKET_CATEGORIES.forEach(cat => {
    const option = document.createElement('option');
    option.value = cat.id;
    option.textContent = cat.name;
    options.append(option);
  });
}
function openBasketDialog(item = null, category = 'work') {
  basketForm.reset();
  byId('basketError').hidden = true;
  byId('basketError').textContent = '';
  byId('basketId').value = item?.id || '';
  byId('basketDialogTitle').textContent = item ? 'ویرایش کارِ سبد' : 'کار جدید در سبد';
  byId('basketSave').textContent = item ? 'ذخیرهٔ تغییرات' : 'ثبت کار';
  byId('basketCategory').value = item?.category || category;
  byId('basketTitle').value = item?.title || '';
  byId('basketNotes').value = item?.notes || '';
  byId('basketPriority').value = item?.priority || 'normal';
  byId('basketNotify').checked = item?.notifyEnabled === true;
  setBasketNotifyDate(item?.notifyEnabled && isValidDay(item.notifyDate) ? parseIsoDay(item.notifyDate) : new Date());
  byId('basketNotifyTime').value = item?.notifyTime || '09:00';
  byId('basketNotifyRepeat').value = item?.notifyRepeat || 'none';
  toggleBasketNotify();
  basketDialog.showModal();
  requestAnimationFrame(() => byId('basketTitle').focus());
}
function basketError(message) {
  const box = byId('basketError');
  box.textContent = message;
  box.hidden = !message;
}
async function saveBasketItem(event) {
  event.preventDefault();
  if (!db) return;
  const previous = basketTasks.find(x => x.id === byId('basketId').value);
  const notifyEnabled = byId('basketNotify').checked;
  const notifyDate = notifyEnabled ? selectedBasketNotifyDate() : null;
  if (notifyEnabled && !notifyDate) return basketError('تاریخ شمسیِ اعلان معتبر نیست.');
  const item = {
    id: previous?.id || makeId(),
    title: byId('basketTitle').value.trim(),
    category: byId('basketCategory').value,
    priority: byId('basketPriority').value,
    notes: byId('basketNotes').value.trim(),
    notifyEnabled,
    notifyDate: notifyEnabled ? isoDay(notifyDate) : '',
    notifyTime: notifyEnabled ? byId('basketNotifyTime').value : '',
    notifyRepeat: notifyEnabled ? byId('basketNotifyRepeat').value : 'none',
    done: previous?.done || false,
    createdAt: previous?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  try { validateBasketItem(item); }
  catch (error) { basketError(error.message); return; }
  const save = byId('basketSave');
  save.disabled = true;
  try {
    await putBasketTask(item);
    await refresh();
    basketDialog.close();
    showToast(previous ? 'کار ویرایش شد.' : 'کار به سبد اضافه شد.');
  } catch (error) {
    console.error(error);
    basketError('ثبت کار انجام نشد. فضای ذخیره‌سازی را بررسی کن.');
  } finally {save.disabled = false;}
}
function basketSort(a, b) {
  if (a.done !== b.done) return Number(a.done) - Number(b.done);
  const score = {high: 0, normal: 1, low: 2};
  if (score[a.priority] !== score[b.priority]) return score[a.priority] - score[b.priority];
  return (b.createdAt || '').localeCompare(a.createdAt || '');
}
function renderBaskets() {
  const total = basketTasks.length;
  const finished = basketTasks.filter(item => item.done).length;
  byId('basketPendingCount').textContent = faNumber(total - finished);
  byId('basketDoneCount').textContent = faNumber(finished);
  byId('basketTotalCount').textContent = faNumber(total);
  document.querySelectorAll('[data-basket-filter]').forEach(button => {
    const selected = button.dataset.basketFilter === basketFilter;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  const grid = byId('basketGrid');
  const frag = document.createDocumentFragment();
  const query = basketSearch.trim().toLocaleLowerCase('fa-IR');
  BASKET_CATEGORIES.forEach(category => {
    const inCategory = basketTasks.filter(item => item.category === category.id);
    const pending = inCategory.filter(item => !item.done).length;
    const filtered = inCategory.filter(item => (basketFilter === 'all' || (basketFilter === 'done' ? item.done : !item.done)) &&
      (!query || `${item.title} ${item.notes}`.toLocaleLowerCase('fa-IR').includes(query))).sort(basketSort);
    const column = textNode('section', '', 'basket-column');
    column.dataset.basket = category.id;
    const heading = textNode('div', '', 'basket-heading');
    const hgroup = textNode('div', '', 'basket-hgroup');
    hgroup.append(textNode('span', category.symbol, 'basket-symbol'));
    const titles = textNode('div', '', 'basket-titles');
    titles.append(textNode('h3', category.name, ''), textNode('p', category.hint, ''));
    hgroup.append(titles);
    const count = textNode('span', `${faNumber(pending)} باقی‌مانده`, 'basket-count');
    heading.append(hgroup, count);
    column.append(heading);
    const itemsNode = textNode('div', '', 'basket-items');
    if (!filtered.length) itemsNode.append(textNode('p', query ? 'موردی مطابق جست‌وجو نیست.' :
      (basketFilter === 'done' ? 'هنوز کاری در این سبد انجام نشده است.' : 'این سبد در این فیلتر خالی است.'), 'basket-empty'));
    filtered.forEach(item => {
      const card = textNode('article', '', 'basket-item' + (item.done ? ' basket-done' : ''));
      const top = textNode('div', '', 'basket-item-top');
      const label = textNode('label', '', 'basket-check');
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.dataset.basketId = item.id;
      check.checked = item.done;
      check.setAttribute('aria-label', `علامت انجام‌شدن ${item.title}`);
      label.append(check, textNode('span', item.title, 'basket-item-title'));
      const badge = textNode('span', BASKET_PRIORITIES[item.priority], `priority-pill priority-${item.priority}`);
      top.append(label, badge);
      card.append(top);
      if (item.notes) card.append(textNode('p', item.notes, 'basket-notes'));
      if (item.notifyEnabled) {
        const dateCaption = `${persianFullDate.format(parseIsoDay(item.notifyDate))} · ${faDigits(item.notifyTime)}`;
        card.append(textNode('div', `🔔 اعلان: ${dateCaption} · ${REPEAT_NAMES[item.notifyRepeat]}`, 'basket-alert-caption'));
      }
      const actions = textNode('div', '', 'basket-actions');
      const edit = textNode('button', 'ویرایش', 'text-btn');
      edit.type = 'button';
      edit.dataset.basketAction = 'edit';
      edit.dataset.basketId = item.id;
      const remove = textNode('button', 'حذف', 'text-btn danger');
      remove.type = 'button';
      remove.dataset.basketAction = 'remove';
      remove.dataset.basketId = item.id;
      actions.append(edit, remove);
      card.append(actions);
      itemsNode.append(card);
    });
    column.append(itemsNode);
    const addButton = textNode('button', '＋ افزودن کار بدون تاریخ', 'basket-add');
    addButton.type = 'button';
    addButton.dataset.basketAction = 'add';
    addButton.dataset.category = category.id;
    column.append(addButton);
    frag.append(column);
  });
  grid.replaceChildren(frag);
}
async function onBasketClick(event) {
  const button = event.target.closest('button[data-basket-action]');
  if (!button) return;
  const action = button.dataset.basketAction;
  if (action === 'add') return openBasketDialog(null, button.dataset.category);
  const item = basketTasks.find(x => x.id === button.dataset.basketId);
  if (!item) return;
  if (action === 'edit') return openBasketDialog(item);
  if (action === 'remove' && confirm(`کار «${item.title}» حذف شود؟`)) {
    button.disabled = true;
    try {
      await deleteBasketTask(item.id);
      await refresh();
      showToast('کار از سبد حذف شد.');
    } catch (error) {
      console.error(error);
      button.disabled = false;
      showToast('حذف کار انجام نشد.');
    }
  }
}
async function onBasketChange(event) {
  const checkbox = event.target.closest('input[data-basket-id]');
  if (!checkbox) return;
  const item = basketTasks.find(x => x.id === checkbox.dataset.basketId);
  if (!item) return;
  checkbox.disabled = true;
  try {
    await putBasketTask({...item, done: checkbox.checked, updatedAt: new Date().toISOString()});
    await refresh();
    showToast(checkbox.checked ? 'کار انجام شد؛ آفرین!' : 'کار به فهرست انجام‌نشده‌ها برگشت.');
  } catch (error) {
    console.error(error);
    checkbox.checked = !checkbox.checked;
    checkbox.disabled = false;
    showToast('تغییر وضعیت ذخیره نشد.');
  }
}

// ---------------------------------------------------------------------------
// دفتر دل‌نوشته‌ها: هر روز شمسی، چند نوشته، ذخیرهٔ مستقل از اعلان‌ها.
// ---------------------------------------------------------------------------
function fillDiaryDates() {
  for (const prefix of ['diary', 'diaryFilter']) {
    const month = byId(prefix + 'Month');
    const day = prefix === 'diary' ? byId('diaryDay') : null;
    PERSIAN_MONTHS.forEach((name, index) => {
      const option = document.createElement('option');
      option.value = String(index + 1);
      option.textContent = name;
      month.append(option);
    });
    if (day) for (let number = 1; number <= 31; number++) {
      const option = document.createElement('option');
      option.value = String(number);
      option.textContent = faNumber(number);
      day.append(option);
    }
  }
  const {year, month} = getPersianYmd(new Date());
  byId('diaryFilterYear').value = faNumber(year);
  byId('diaryFilterMonth').value = String(month);
}
function diaryInputDate() {
  const y = Number(normalizeDigits(byId('diaryYear').value.trim()));
  const m = Number(byId('diaryMonth').value);
  const d = Number(byId('diaryDay').value);
  return persianDateToGregorian(y, m, d);
}
function setDiaryDate(date) {
  const {year,month,day} = getPersianYmd(date);
  byId('diaryYear').value = faNumber(year);
  byId('diaryMonth').value = String(month);
  byId('diaryDay').value = String(day);
  previewDiaryDate();
}
function previewDiaryDate() {
  const date = diaryInputDate();
  const preview = byId('diaryDatePreview');
  preview.textContent = date ? persianFullDate.format(date) : 'تاریخ انتخاب‌شده معتبر نیست';
  preview.classList.toggle('invalid', !date);
}
function setDiaryError(message) {
  byId('diaryError').textContent = message;
  byId('diaryError').hidden = !message;
}
function openDiaryDialog(entry = null) {
  diaryForm.reset();
  setDiaryError('');
  byId('diaryId').value = entry?.id || '';
  byId('diaryDialogTitle').textContent = entry ? 'ویرایش دل‌نوشته' : 'دل‌نوشتهٔ تازه';
  byId('diarySave').textContent = entry ? 'ذخیرهٔ تغییرات' : 'ذخیرهٔ خاطره';
  byId('diaryTitle').value = entry?.title || '';
  byId('diaryBody').value = entry?.body || '';
  byId('diaryMood').value = entry?.mood || 'none';
  setDiaryDate(entry ? parseIsoDay(entry.date) : new Date());
  diaryDialog.showModal();
  requestAnimationFrame(() => byId('diaryBody').focus());
}
async function saveDiaryEntry(event) {
  event.preventDefault();
  if (!db) return;
  setDiaryError('');
  const date = diaryInputDate();
  if (!date) return setDiaryError('تاریخ شمسی درست وارد نشده است.');
  const old = diaryEntries.find(item => item.id === byId('diaryId').value);
  let entry;
  try {
    entry = validateDiaryEntry({
      id:old?.id || makeId(), date:isoDay(date),
      title:byId('diaryTitle').value, body:byId('diaryBody').value,
      mood:byId('diaryMood').value,
      createdAt:old?.createdAt || new Date().toISOString(),
      updatedAt:new Date().toISOString()
    });
  } catch (error) { return setDiaryError(error.message); }
  const button = byId('diarySave');
  button.disabled = true;
  try {
    await putDiaryEntry(entry);
    diaryDialog.close();
    await refresh();
    showToast(old ? 'دل‌نوشته ویرایش شد.' : 'دل‌نوشته با موفقیت ذخیره شد.');
  } catch (error) {
    console.error(error);
    setDiaryError('در ذخیره‌سازی خاطره مشکلی رخ داد. دوباره تلاش کن.');
  } finally {button.disabled = false;}
}
function diarySort(a, b) {
  return b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);
}
function renderDiary() {
  byId('diaryTotalCount').textContent = faNumber(diaryEntries.length);
  byId('diaryDayCount').textContent = faNumber(new Set(diaryEntries.map(x => x.date)).size);
  const today = isoDay(new Date());
  byId('diaryTodayCount').textContent = faNumber(diaryEntries.filter(x => x.date === today).length);
  const query = normalizeDigits(diarySearch.trim()).toLocaleLowerCase('fa-IR');
  let items = diaryEntries.filter(item => {
    if (diaryFilteredMonth) {
      const {year,month} = getPersianYmd(parseIsoDay(item.date));
      if (year !== diaryFilteredMonth.year || month !== diaryFilteredMonth.month) return false;
    }
    return !query || normalizeDigits(`${item.title} ${item.body}`).toLocaleLowerCase('fa-IR').includes(query);
  }).sort(diarySort);
  byId('diaryListCaption').textContent = `نمایش ${faNumber(items.length)} از ${faNumber(diaryEntries.length)} نوشته`;
  byId('diaryActiveFilter').hidden = !diaryFilteredMonth;
  if (diaryFilteredMonth) {
    byId('diaryActiveFilter').textContent = `بایگانی ${PERSIAN_MONTHS[diaryFilteredMonth.month - 1]} ${faNumber(diaryFilteredMonth.year)}`;
  }
  const fragment = document.createDocumentFragment();
  let lastDate = '';
  items.forEach(item => {
    if (item.date !== lastDate) {
      lastDate = item.date;
      const heading = textNode('h3', `${WEEKDAYS[(parseIsoDay(item.date).getDay()+1)%7]}، ${persianFullDate.format(parseIsoDay(item.date))}`, 'diary-date-heading');
      fragment.append(heading);
    }
    const card = textNode('article', '', 'diary-card');
    const heading = textNode('div', '', 'diary-card-head');
    const name = textNode('h4', item.title || 'دل‌نوشتهٔ بدون عنوان', 'diary-card-title');
    heading.append(name);
    if (item.mood !== 'none') heading.append(textNode('span', DIARY_MOODS[item.mood], 'diary-mood'));
    const body = textNode('p', item.body, 'diary-card-text');
    const footer = textNode('div', '', 'diary-card-footer');
    footer.append(textNode('span', `ثبت: ${faDigits(new Date(item.createdAt).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}))}`, 'diary-timestamp'));
    const actions = textNode('div', '', 'diary-card-actions');
    const edit = textNode('button', 'ویرایش', 'text-btn');
    edit.type = 'button'; edit.dataset.diaryAction = 'edit'; edit.dataset.diaryId = item.id;
    const remove = textNode('button', 'حذف', 'text-btn danger');
    remove.type = 'button'; remove.dataset.diaryAction = 'remove'; remove.dataset.diaryId = item.id;
    actions.append(edit, remove);
    footer.append(actions);
    card.append(heading,body,footer);
    fragment.append(card);
  });
  if (!items.length) fragment.append(textNode('p',
    diaryEntries.length ? 'نوشته‌ای با این جست‌وجو یا تاریخ پیدا نشد.' : 'هنوز خاطره‌ای ننوشته‌ای؛ با یک جمله دربارهٔ امروز شروع کن.',
    'diary-empty'));
  byId('diaryList').replaceChildren(fragment);
}
function filterDiaryMonth(event) {
  event.preventDefault();
  const year = Number(normalizeDigits(byId('diaryFilterYear').value.trim()));
  const month = Number(byId('diaryFilterMonth').value);
  if (!persianDateToGregorian(year,month,1)) return showToast('سال یا ماه شمسی نامعتبر است.');
  diaryFilteredMonth = {year, month};
  renderDiary();
}
async function onDiaryClick(event) {
  const button = event.target.closest('button[data-diary-action]');
  if (!button) return;
  const entry = diaryEntries.find(item => item.id === button.dataset.diaryId);
  if (!entry) return;
  if (button.dataset.diaryAction === 'edit') return openDiaryDialog(entry);
  if (button.dataset.diaryAction === 'remove' && confirm('این دل‌نوشته برای همیشه حذف شود؟')) {
    button.disabled = true;
    try {
      await deleteDiaryEntry(entry.id);
      await refresh();
      showToast('دل‌نوشته حذف شد.');
    } catch(error) {
      console.error(error);
      button.disabled = false;
      showToast('حذف انجام نشد.');
    }
  }
}

// ---------------------------------------------------------------------------
// مراحل ۶ و ۷: ثبت ورزش و زبان، تحلیل روند روزانه/ماهانه/سالانه بر اساس شمسی.
// ---------------------------------------------------------------------------
function activityEntries(kind) { return kind === 'exercise' ? exerciseSessions : languageSessions; }
function sessionDateInput() {
  return persianDateToGregorian(Number(normalizeDigits(byId('activityYear').value.trim())),
    Number(byId('activityMonth').value),Number(byId('activityDay').value));
}
function setSessionDate(date) {
  const p=getPersianYmd(date);
  byId('activityYear').value=faNumber(p.year);
  byId('activityMonth').value=String(p.month);
  byId('activityDay').value=String(p.day);
  previewSessionDate();
}
function previewSessionDate() {
  const date=sessionDateInput();
  byId('activityDatePreview').textContent=date ? persianFullDate.format(date) : 'تاریخ شمسی معتبر نیست';
  byId('activityDatePreview').classList.toggle('invalid',!date);
}
function fillActivityDates() {
  const month=byId('activityMonth'),day=byId('activityDay');
  PERSIAN_MONTHS.forEach((name,index)=>{const option=document.createElement('option');option.value=String(index+1);option.textContent=name;month.append(option)});
  for (let n=1;n<=31;n++){const option=document.createElement('option');option.value=String(n);option.textContent=faNumber(n);day.append(option)}
}
function toggleActivityNotify() { byId('activityNotifyFields').hidden=!byId('activityNotify').checked; }
function openActivityDialog(kind,entry=null) {
  activityStore(kind);
  activeActivityKind=kind;
  activityForm.reset();
  byId('activityError').hidden=true;
  byId('activityError').textContent='';
  byId('activityId').value=entry?.id || '';
  byId('activityDialogTitle').textContent=entry ? `ویرایش ${ACTIVITY_KINDS[kind].label}` : `ثبت ${ACTIVITY_KINDS[kind].label}`;
  byId('activityNameLabel').textContent=ACTIVITY_KINDS[kind].name;
  byId('activityName').placeholder=kind==='exercise'?'مثلاً پیاده‌روی، دوچرخه یا بدنسازی':'مثلاً انگلیسی، آلمانی یا فرانسه';
  byId('activityName').value=entry?.name || '';
  byId('activityMinutes').value=entry?.minutes || '30';
  byId('activityNotes').value=entry?.notes || '';
  byId('activityNotify').checked=entry?.notifyEnabled || false;
  byId('activityNotifyTime').value=entry?.notifyTime || '09:00';
  byId('activityNotifyRepeat').value=entry?.notifyRepeat || 'none';
  byId('activitySave').textContent=entry ? 'ذخیرهٔ تغییرات' : 'ثبت فعالیت';
  toggleActivityNotify();
  setSessionDate(entry ? parseIsoDay(entry.date) : new Date());
  activityDialog.showModal();
  requestAnimationFrame(()=>byId('activityName').focus());
}
async function saveActivity(event) {
  event.preventDefault();
  if (!db || !activeActivityKind) return;
  const date=sessionDateInput();
  const error=byId('activityError');
  error.hidden=true;
  if (!date) {error.hidden=false;error.textContent='تاریخ شمسی معتبر نیست.';return;}
  const rawMinutes=Number(normalizeDigits(byId('activityMinutes').value.trim()));
  const old=activityEntries(activeActivityKind).find(x=>x.id===byId('activityId').value);
  let entry;
  try {
    entry=validateActivitySession({
      id:old?.id || makeId(),date:isoDay(date),name:byId('activityName').value,minutes:rawMinutes,
      notes:byId('activityNotes').value,notifyEnabled:byId('activityNotify').checked,
      notifyTime:byId('activityNotifyTime').value,notifyRepeat:byId('activityNotifyRepeat').value,
      createdAt:old?.createdAt || new Date().toISOString(),updatedAt:new Date().toISOString()
    },activeActivityKind);
  }catch(e){error.hidden=false;error.textContent=e.message;return;}
  const button=byId('activitySave');button.disabled=true;
  try {
    await putActivitySession(activeActivityKind,entry);
    activityDialog.close();
    await refresh();
    showToast(old?'ثبت فعالیت به‌روزرسانی شد.':'فعالیت با موفقیت ثبت شد.');
  }catch(e){console.error(e);error.hidden=false;error.textContent='ذخیره انجام نشد. دوباره امتحان کن.';}
  finally{button.disabled=false;}
}
function activityPeriod(kind) {
  const state=ACTIVITY_PERIODS[kind], anchor=state.anchor, p=getPersianYmd(anchor);
  if (state.mode==='week'){
    const start=startOfWeek(anchor),end=addDays(start,7);
    const days=Array.from({length:7},(_,i)=>addDays(start,i));
    return {start:isoDay(start),end:isoDay(end),title:`${persianFullDate.format(start)} تا ${persianFullDate.format(addDays(end,-1))}`,
      buckets:days.map((d,i)=>({key:isoDay(d),label:WEEKDAYS[i],short:faNumber(getPersianYmd(d).day)}))};
  }
  if(state.mode==='month'){
    const start=persianDateToGregorian(p.year,p.month,1);
    const next=p.month===12 ? persianDateToGregorian(p.year+1,1,1) : persianDateToGregorian(p.year,p.month+1,1);
    const days=[];
    for(let date=start; date<next;date=addDays(date,1)){
      days.push({key:isoDay(date),label:faNumber(getPersianYmd(date).day),short:faNumber(getPersianYmd(date).day)});
    }
    return {start:isoDay(start),end:isoDay(next),title:`${PERSIAN_MONTHS[p.month-1]} ${faNumber(p.year)}`,buckets:days};
  }
  const start=persianDateToGregorian(p.year,1,1),next=persianDateToGregorian(p.year+1,1,1);
  return {start:isoDay(start),end:isoDay(next),title:`سال ${faNumber(p.year)}`,
    buckets:PERSIAN_MONTHS.map((label,i)=>({key:`${p.year}-${i+1}`,label,short:label.slice(0,3)}))};
}
function activityBucketKey(item,mode) {
  if(mode!=='year')return item.date;
  const p=getPersianYmd(parseIsoDay(item.date));
  return `${p.year}-${p.month}`;
}
function activityPeriodTotals(entries,period) {
  const selected=entries.filter(e=>e.date>=period.start && e.date<period.end);
  const total=selected.reduce((n,e)=>n+e.minutes,0);
  const dayCount=new Set(selected.map(e=>e.date)).size;
  return {selected,total,dayCount};
}
function shiftActivityPeriod(kind,amount) {
  const state=ACTIVITY_PERIODS[kind],p=getPersianYmd(state.anchor);
  if(state.mode==='week')state.anchor=addDays(state.anchor,amount*7);
  else if(state.mode==='month'){
    const index=p.year*12+p.month-1+amount;
    const year=Math.floor(index/12),month=(index%12+12)%12+1;
    if(year>=1 && year<=2999)state.anchor=persianDateToGregorian(year,month,1);
  }else {
    const year=p.year+amount;
    if(year>=1 && year<=2999)state.anchor=persianDateToGregorian(year,1,1);
  }
  renderActivityPanel(kind);
}
function renderActivityPanel(kind) {
  const entries=activityEntries(kind),state=ACTIVITY_PERIODS[kind],period=activityPeriod(kind);
  const {selected,total,dayCount}=activityPeriodTotals(entries,period);
  byId(kind+'PeriodLabel').textContent=period.title;
  byId(kind+'Total').textContent=faNumber(total)+' دقیقه';
  byId(kind+'Days').textContent=faNumber(dayCount)+' روز';
  byId(kind+'Count').textContent=faNumber(selected.length)+' بار';
  byId(kind+'AllTime').textContent=`از آغاز: ${faNumber(entries.reduce((n,e)=>n+e.minutes,0))} دقیقه در ${faNumber(entries.length)} نوبت`;
  const sums=new Map(period.buckets.map(b=>[b.key,0]));
  for(const item of selected){const key=activityBucketKey(item,state.mode);sums.set(key,(sums.get(key)||0)+item.minutes);}
  const max=Math.max(...sums.values(),1);
  const chart=byId(kind+'Chart');chart.replaceChildren();
  chart.setAttribute('aria-label',`نمودار ${ACTIVITY_KINDS[kind].label} در ${period.title}، مجموع ${faNumber(total)} دقیقه`);
  const bars=document.createDocumentFragment();
  for (const b of period.buckets){
    const n=sums.get(b.key)||0;
    const col=textNode('div','','activity-bar-col');
    col.setAttribute('title',`${b.label}: ${faNumber(n)} دقیقه`);
    const value=textNode('span',n?faNumber(n):'','activity-bar-value');
    const stem=textNode('div','','activity-bar-stem');
    stem.style.height=(n?Math.max(6,Math.round(n/max*130)):3)+'px';
    stem.classList.toggle('zero',!n);
    const caption=textNode('span',b.short,'activity-bar-label');
    col.append(value,stem,caption);
    bars.append(col);
  }
  chart.append(bars);
  const list=byId(kind+'Entries');list.replaceChildren();
  if(!selected.length){list.append(textNode('p','هنوز برای این بازه چیزی ثبت نکرده‌ای.','activity-empty'));return;}
  selected.slice().sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt))
    .slice(0,100).forEach(item=>{
      const card=textNode('article','','activity-entry');
      const info=textNode('div','','activity-entry-info');
      info.append(textNode('strong',item.name));
      info.append(textNode('span',`${persianFullDate.format(parseIsoDay(item.date))} · ${faNumber(item.minutes)} دقیقه`,'activity-entry-meta'));
      if(item.notes)info.append(textNode('p',item.notes,'activity-entry-notes'));
      if(item.notifyEnabled)info.append(textNode('span',`🔔 ${faDigits(item.notifyTime)} · ${REPEAT_NAMES[item.notifyRepeat]}`,'activity-entry-meta'));
      const actions=textNode('div','','activity-entry-actions');
      for(const [action,label] of [['edit','ویرایش'],['remove','حذف']]){
        const button=textNode('button',label,action==='remove'?'text-btn danger':'text-btn');
        button.type='button';button.dataset.activityKind=kind;button.dataset.activityId=item.id;button.dataset.activityAction=action;
        actions.append(button);
      }
      card.append(info,actions);list.append(card);
    });
}
async function onActivityClick(event) {
  const button=event.target.closest('button[data-activity-action]');
  if(!button)return;
  const kind=button.dataset.activityKind;
  const item=activityEntries(kind).find(x=>x.id===button.dataset.activityId);
  if(!item)return;
  if(button.dataset.activityAction==='edit')return openActivityDialog(kind,item);
  if(button.dataset.activityAction==='remove' && confirm('این سابقه حذف شود؟')){
    button.disabled=true;
    try{await deleteActivitySession(kind,item.id);await refresh();showToast('سابقه حذف شد.');}
    catch(e){console.error(e);button.disabled=false;showToast('حذف انجام نشد.');}
  }
}
function bindActivityEvents() {
  fillActivityDates();
  byId('newExerciseBtn').addEventListener('click',()=>openActivityDialog('exercise'));
  byId('newLanguageBtn').addEventListener('click',()=>openActivityDialog('language'));
  byId('activityClose').addEventListener('click',()=>activityDialog.close());
  byId('activityCancel').addEventListener('click',()=>activityDialog.close());
  activityDialog.addEventListener('click',e=>{if(e.target===activityDialog)activityDialog.close()});
  byId('activityNotify').addEventListener('change',toggleActivityNotify);
  byId('activityUseToday').addEventListener('click',()=>setSessionDate(new Date()));
  ['activityYear','activityMonth','activityDay'].forEach(id=>{
    byId(id).addEventListener('input',previewSessionDate);byId(id).addEventListener('change',previewSessionDate);
  });
  activityForm.addEventListener('submit',saveActivity);
  for(const kind of ['exercise','language']){
    byId(kind+'Mode').addEventListener('change',e=>{
      const mode=e.target.value;if(!['week','month','year'].includes(mode))return;
      ACTIVITY_PERIODS[kind].mode=mode;renderActivityPanel(kind);
    });
    byId(kind+'Prev').addEventListener('click',()=>shiftActivityPeriod(kind,-1));
    byId(kind+'Next').addEventListener('click',()=>shiftActivityPeriod(kind,1));
    byId(kind+'Today').addEventListener('click',()=>{ACTIVITY_PERIODS[kind].anchor=new Date();renderActivityPanel(kind)});
    byId(kind+'Entries').addEventListener('click',onActivityClick);
  }
}

function bindEvents() {
  bindActivityEvents();
  fillDiaryDates();
  byId('newDiaryBtn').addEventListener('click', () => openDiaryDialog());
  byId('diaryTodayBtn').addEventListener('click', () => openDiaryDialog());
  byId('closeDiary').addEventListener('click', () => diaryDialog.close());
  byId('cancelDiary').addEventListener('click', () => diaryDialog.close());
  diaryDialog.addEventListener('click', e => {if (e.target === diaryDialog) diaryDialog.close();});
  diaryForm.addEventListener('submit', saveDiaryEntry);
  ['diaryYear','diaryMonth','diaryDay'].forEach(id => {
    byId(id).addEventListener('input', previewDiaryDate);
    byId(id).addEventListener('change', previewDiaryDate);
  });
  byId('diaryUseToday').addEventListener('click', () => setDiaryDate(new Date()));
  byId('diarySearch').addEventListener('input', e => { diarySearch = e.target.value; renderDiary(); });
  byId('diaryFilterForm').addEventListener('submit', filterDiaryMonth);
  byId('diaryClearFilter').addEventListener('click', () => { diaryFilteredMonth = null; byId('diarySearch').value = ''; diarySearch = ''; renderDiary(); });
  byId('diaryList').addEventListener('click', onDiaryClick);
  setupJumpControls();
  fillBasketCategories();
  fillBasketNotificationDate();
  byId('basketNotify').addEventListener('change',toggleBasketNotify);
  byId('basketNotifyToday').addEventListener('click', () => setBasketNotifyDate(new Date()));
  ['basketNotifyYear','basketNotifyMonth','basketNotifyDay'].forEach(id => {
    byId(id).addEventListener('input',previewBasketNotifyDate);
    byId(id).addEventListener('change',previewBasketNotifyDate);
  });
  byId('newBasketBtn').addEventListener('click', () => openBasketDialog());
  byId('closeBasketDialog').addEventListener('click', () => basketDialog.close());
  byId('cancelBasket').addEventListener('click', () => basketDialog.close());
  basketDialog.addEventListener('click', e => { if (e.target === basketDialog) basketDialog.close(); });
  basketForm.addEventListener('submit', saveBasketItem);
  byId('basketGrid').addEventListener('click', onBasketClick);
  byId('basketGrid').addEventListener('change', onBasketChange);
  byId('basketSearch').addEventListener('input', e => { basketSearch = e.target.value; renderBaskets(); });
  document.querySelectorAll('[data-basket-filter]').forEach(button => {
    button.addEventListener('click', () => { basketFilter = button.dataset.basketFilter; renderBaskets(); });
  });
  fillReminderDateDropdowns();
  byId('newReminderBtn').addEventListener('click', () => openReminderDialog());
  byId('closeReminderDialog').addEventListener('click', () => reminderDialog.close());
  byId('cancelReminder').addEventListener('click', () => reminderDialog.close());
  reminderDialog.addEventListener('click', (event) => { if (event.target === reminderDialog) reminderDialog.close(); });
  reminderForm.addEventListener('submit', submitReminder);
  byId('reminderToday').addEventListener('click', () => setReminderPersianDate(new Date()));
  ['reminderYear', 'reminderMonth', 'reminderDay'].forEach((id) => {
    byId(id).addEventListener('change', previewReminderDate);
    byId(id).addEventListener('input', previewReminderDate);
  });
  byId('reminderList').addEventListener('click', onReminderClick);
  byId('reminderList').addEventListener('change', onReminderChange);
  document.querySelectorAll('.reminders-toolbar .filter-btn').forEach((button) => {
    button.addEventListener('click', () => { reminderFilter = button.dataset.filter; renderReminders(); });
  });
  // Recheck due/overdue state while the app remains open.
  setInterval(() => { if (!document.hidden && db) renderReminders(); }, 60000);
  byId('jumpForm').addEventListener('submit', jumpToWeek);
  byId('prevWeek').addEventListener('click', () => { weekStart = addDays(weekStart, -7); renderWeek(); });
  byId('nextWeek').addEventListener('click', () => { weekStart = addDays(weekStart, 7); renderWeek(); });
  byId('todayBtn').addEventListener('click', () => { weekStart = startOfWeek(new Date()); renderWeek(); });
  byId('newTaskHero').addEventListener('click', () => openTaskDialog());
  byId('closeDialog').addEventListener('click', () => dialog.close());
  byId('cancelTask').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  form.addEventListener('submit', submitTask);
  weekGrid.addEventListener('click', onWeekGridClick);
  weekGrid.addEventListener('change', onWeekGridChange);
  byId('exportBtn').addEventListener('click', exportBackup);
  byId('importBtn').addEventListener('click', () => byId('importFile').click());
  byId('importFile').addEventListener('change', importBackup);
  byId('permissionBtn').addEventListener('click', requestNativePermissions);
  byId('refreshInboxBtn').addEventListener('click', renderNotificationCenter);
  byId('testNotificationBtn').addEventListener('click', testNativeNotification);
  byId('notificationInbox').addEventListener('click', acknowledgeFromInbox);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && db) refresh().catch(console.error);
  });
}
async function main() {
  bindEvents();
  try {
    db = await openDatabase();
    await refresh();
  } catch (error) {
    console.error(error);
    document.querySelector('.local-tag').textContent = 'ذخیره‌سازی در دسترس نیست';
    weekGrid.replaceChildren(textNode('div', 'دسترسی به حافظهٔ محلی ممکن نشد. برنامه را از یک نشانی HTTPS در Chrome باز کن و تنظیمات ذخیره‌سازی مرورگر را بررسی کن.', 'empty-day'));
    byId('newTaskHero').disabled = true;
    byId('exportBtn').disabled = true;
    byId('importBtn').disabled = true;
    byId('newReminderBtn').disabled = true;
    byId('newBasketBtn').disabled = true;
    byId('newDiaryBtn').disabled = true;
    byId('newExerciseBtn').disabled = true;
    byId('newLanguageBtn').disabled = true;
    byId('diaryTodayBtn').disabled = true;
    byId('diaryList').replaceChildren(textNode('p', 'دسترسی به دفتر روزانه ممکن نیست.', 'diary-empty'));
    byId('exerciseEntries').replaceChildren(textNode('p', 'حافظهٔ محلی در دسترس نیست.', 'activity-empty'));
    byId('languageEntries').replaceChildren(textNode('p', 'حافظهٔ محلی در دسترس نیست.', 'activity-empty'));
    byId('basketGrid').replaceChildren(textNode('div', 'دسترسی به حافظهٔ سبدها ممکن نشد.', 'reminders-empty'));
    byId('reminderList').replaceChildren(textNode('div', 'دسترسی به ذخیره‌سازی یادآوری‌ها ممکن نشد.', 'reminders-empty'));
    showToast('اتصال به پایگاه دادهٔ محلی برقرار نشد.');
  }
  if ('serviceWorker' in navigator && !nativeAvailable() && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch((error) => console.warn('Offline setup:', error));
    });
  }
}
main();
