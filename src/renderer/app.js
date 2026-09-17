'use strict';

/* ================= 工具 ================= */

const $ = (sel) => document.querySelector(sel);

function pad(n) { return String(n).padStart(2, '0'); }

function dateKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseKey(key) {
  const [y, m, day] = key.split('-').map(Number);
  return new Date(y, m - 1, day);
}

function todayKey() { return dateKey(new Date()); }

function diffDays(key) {
  const a = parseKey(todayKey()).getTime();
  const b = parseKey(key).getTime();
  return Math.round((b - a) / 86400000);
}

const WEEK_NAMES = ['一', '二', '三', '四', '五', '六', '日'];

function weekdayLabel(d) {
  // getDay: 0=周日 … 6=周六，转换为周一开头
  return '周' + WEEK_NAMES[(d.getDay() + 6) % 7];
}

function relativeLabel(key) {
  const diff = diffDays(key);
  if (diff === 0) return '今天';
  if (diff === 1) return '明天';
  if (diff === 2) return '后天';
  if (diff === -1) return '昨天';
  if (diff > 2) return `${diff} 天后`;
  return `${-diff} 天前`;
}

function minutesOf(time) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/* ================= 状态 ================= */

const state = {
  plans: [],
  settings: { autoStart: true, notifications: true, minimizeToTray: true },
  meta: { lastSummaryDate: null },
  selected: todayKey(),
  cursor: new Date() // 当前查看的月份
};

/* ================= 初始化 ================= */

async function init() {
  [state.plans, state.settings, state.meta] = await Promise.all([
    api.listPlans(),
    api.getSettings(),
    api.getMeta()
  ]);

  renderWeekdays();
  renderCalendar();
  renderPlans();
  renderSettings();
  bindEvents();
  api.refreshTray();

  // 开机/打开即检查提醒
  runReminderCheck();
  setInterval(runReminderCheck, 20000);
}

function renderWeekdays() {
  $('#calWeekdays').innerHTML = WEEK_NAMES.map((w) => `<span>${w}</span>`).join('');
}

/* ================= 日历 ================= */

function renderCalendar() {
  const cur = state.cursor;
  $('#calTitle').textContent = `${cur.getFullYear()} 年 ${cur.getMonth() + 1} 月`;

  const year = cur.getFullYear();
  const month = cur.getMonth();
  const firstDay = new Date(year, month, 1);
  // 周一开头：周日(0) 要回退 6 天
  const offset = (firstDay.getDay() + 6) % 7;
  const gridStart = new Date(year, month, 1 - offset);

  const tKey = todayKey();
  const grid = $('#calGrid');
  grid.innerHTML = '';

  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
    const key = dateKey(d);
    const dayPlans = state.plans.filter((p) => p.date === key);
    const pending = dayPlans.filter((p) => !p.done);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'day';
    if (d.getMonth() !== month) btn.classList.add('other-month');
    if (key === tKey) btn.classList.add('today');
    if (key === state.selected) btn.classList.add('selected');
    const dow = d.getDay();
    if (dow === 0 || dow === 6) btn.classList.add('weekend');

    const num = document.createElement('span');
    num.className = 'day-num';
    num.textContent = d.getDate();
    btn.appendChild(num);

    if (dayPlans.length) {
      const dots = document.createElement('span');
      dots.className = 'dots';
      // 最多 3 个点：逾期红 → 待办蓝 → 完成绿
      const overdueCount = pending.filter((p) => key < tKey).length;
      const doneCount = dayPlans.length - pending.length;
      const seq = [
        ...Array(Math.min(overdueCount, 3)).fill('overdue'),
        ...Array(Math.min(pending.length - overdueCount, 3)).fill(''),
        ...Array(Math.min(doneCount, 3)).fill('done')
      ].slice(0, 3);
      // 若当天事项超过 3 个且全是同类，保证至少能看出数量：保留 3 个同类点
      for (const cls of seq) {
        const dot = document.createElement('span');
        dot.className = 'dot' + (cls ? ' ' + cls : '');
        dots.appendChild(dot);
      }
      btn.appendChild(dots);
    }

    btn.addEventListener('click', () => {
      state.selected = key;
      if (d.getMonth() !== month) state.cursor = new Date(d.getFullYear(), d.getMonth(), 1);
      renderCalendar();
      renderPlans();
    });

    grid.appendChild(btn);
  }
}

/* ================= 计划列表 ================= */

function plansOfDay(key) {
  return state.plans
    .filter((p) => p.date === key)
    .sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      const ta = a.time || '99:99';
      const tb = b.time || '99:99';
      if (ta !== tb) return ta < tb ? -1 : 1;
      return a.createdAt < b.createdAt ? -1 : 1;
    });
}

function renderPlans() {
  const key = state.selected;
  const d = parseKey(key);
  const diff = diffDays(key);
  const tKey = todayKey();

  $('#plansDate').textContent = `${d.getMonth() + 1} 月 ${d.getDate()} 日 ${weekdayLabel(d)}`;

  const list = plansOfDay(key);
  const pending = list.filter((p) => !p.done);
  const doneCount = list.length - pending.length;
  const subParts = [`<span>${relativeLabel(key)}</span>`];
  if (list.length) {
    subParts[0] = `<span>${relativeLabel(key)} · 共 ${list.length} 项</span>`;
    if (pending.length) {
      const isOverdueDay = key < tKey;
      subParts.push(
        `<span class="tag ${isOverdueDay ? 'tag-danger' : 'tag-accent'}">${isOverdueDay ? '逾期未完成 ' : '待完成 '}${pending.length}</span>`
      );
    }
    if (doneCount) subParts.push(`<span class="tag tag-success">已完成 ${doneCount}</span>`);
  }
  $('#plansSub').innerHTML = subParts.join(' ');

  const container = $('#planList');
  container.innerHTML = '';

  if (list.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.innerHTML = `
      <div class="empty-icon">${diff === 0 ? '☀️' : '🗓️'}</div>
      <div class="empty-title">${diff === 0 ? '今天还没有计划' : '这一天还没有计划'}</div>
      <div class="empty-desc">点击右上角“添加计划”开始安排</div>`;
    container.appendChild(empty);
    return;
  }

  for (const plan of list) {
    container.appendChild(buildPlanItem(plan, key, tKey));
  }
}

const CHECK_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';
const TRASH_SVG =
  '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>';
const CLOCK_SVG =
  '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';

function buildPlanItem(plan, dayKey, tKey) {
  const item = document.createElement('div');
  item.className = 'plan-item';
  if (plan.done) item.classList.add('done');
  if (dayKey === tKey && !plan.done) item.classList.add('today');
  if (dayKey < tKey && !plan.done) item.classList.add('overdue');
  item.dataset.id = plan.id;

  // 勾选框
  const check = document.createElement('button');
  check.type = 'button';
  check.className = 'check';
  check.title = plan.done ? '标记为未完成' : '标记为已完成';
  check.innerHTML = CHECK_SVG;
  check.addEventListener('click', () => toggleDone(plan, item));
  item.appendChild(check);

  // 主体
  const body = document.createElement('div');
  body.className = 'plan-body';

  const title = document.createElement('div');
  title.className = 'plan-title';
  title.textContent = plan.title;
  title.title = '双击修改内容';
  title.addEventListener('dblclick', () => startInlineEdit(title, plan));
  body.appendChild(title);

  const meta = document.createElement('div');
  meta.className = 'plan-meta';
  if (plan.time) {
    const timePill = document.createElement('span');
    const overdueNow = dayKey <= tKey && !plan.done && dayKey === tKey && isTimePassed(plan.time);
    timePill.className = 'plan-time' + (overdueNow ? ' overdue-time' : '');
    timePill.innerHTML = CLOCK_SVG + `<span>${plan.time}</span>`;
    meta.appendChild(timePill);
  }
  if (dayKey < tKey && !plan.done) {
    const tag = document.createElement('span');
    tag.className = 'tag tag-danger';
    tag.textContent = '已逾期';
    meta.appendChild(tag);
  }
  body.appendChild(meta);

  if (plan.note) {
    const note = document.createElement('div');
    note.className = 'plan-note';
    note.textContent = plan.note;
    body.appendChild(note);
  }
  item.appendChild(body);

  // 删除
  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'plan-del';
  del.title = '删除计划';
  del.innerHTML = TRASH_SVG;
  del.addEventListener('click', () => removePlan(plan, item));
  item.appendChild(del);

  return item;
}

function isTimePassed(time) {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes() > minutesOf(time);
}

/* ================= 增 / 删 / 改 ================= */

function openForm() {
  $('#addForm').classList.add('open');
  $('#fTitle').focus();
}

function closeForm() {
  const form = $('#addForm');
  form.classList.remove('open');
  $('#fTitle').value = '';
  $('#fTime').value = '';
  $('#fNote').value = '';
}

async function submitPlan() {
  const title = $('#fTitle').value.trim();
  if (!title) {
    $('#fTitle').focus();
    toast('请填写计划内容', 'danger');
    return;
  }
  const plan = await api.createPlan({
    title,
    date: state.selected,
    time: $('#fTime').value || null,
    note: $('#fNote').value.trim()
  });
  if (plan) {
    state.plans.push(plan);
    closeForm();
    renderCalendar();
    renderPlans();
    api.refreshTray();
    runReminderCheck();
    toast('计划已添加', 'success');
  }
}

async function toggleDone(plan, itemEl) {
  const updated = await api.updatePlan(plan.id, { done: !plan.done });
  if (!updated) return;
  Object.assign(plan, updated);
  // 勾选即时反馈，随后重排顺序
  itemEl.style.animation = 'none';
  renderCalendar();
  renderPlans();
  api.refreshTray();
}

function removePlan(plan, itemEl) {
  if (itemEl.dataset.removing) return;
  itemEl.dataset.removing = '1';
  itemEl.classList.add('removing');
  setTimeout(async () => {
    const ok = await api.removePlan(plan.id);
    if (!ok) {
      itemEl.classList.remove('removing');
      delete itemEl.dataset.removing;
      return;
    }
    state.plans = state.plans.filter((p) => p.id !== plan.id);
    renderCalendar();
    renderPlans();
    api.refreshTray();
    toast('计划已删除', 'success');
  }, 210);
}

function startInlineEdit(titleEl, plan) {
  titleEl.contentEditable = 'true';
  titleEl.focus();
  const range = document.createRange();
  range.selectNodeContents(titleEl);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);

  const finish = async (commit) => {
    titleEl.removeEventListener('keydown', onKey);
    titleEl.contentEditable = 'false';
    const value = titleEl.textContent.trim();
    if (commit && value && value !== plan.title) {
      const updated = await api.updatePlan(plan.id, { title: value });
      if (updated) {
        Object.assign(plan, updated);
        toast('已保存修改', 'success');
      }
    }
    renderPlans();
  };

  const onKey = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  };
  titleEl.addEventListener('keydown', onKey);
  titleEl.addEventListener('blur', () => finish(true), { once: true });
}

/* ================= 设置 ================= */

function renderSettings() {
  $('#swAutoStart').checked = !!state.settings.autoStart;
  $('#swNotify').checked = !!state.settings.notifications;
  $('#swTray').checked = !!state.settings.minimizeToTray;
}

async function bindSettingChange(id, key, onHint) {
  $(id).addEventListener('change', async (e) => {
    const value = e.target.checked;
    state.settings = await api.updateSettings({ [key]: value });
    renderSettings();
    toast(onHint(value), 'success');
  });
}

/* ================= 提醒调度 ================= */

let currentDay = todayKey();

async function runReminderCheck() {
  if (!state.settings) return;
  const now = new Date();
  const tKey = dateKey(now);

  // 跨过零点：刷新界面与托盘
  if (tKey !== currentDay) {
    currentDay = tKey;
    renderCalendar();
    renderPlans();
    api.refreshTray();
  }

  if (!state.settings.notifications) return;

  let changed = false;

  // 1) 每日汇总：每天第一次检查时（开机 / 跨过零点）弹一条通知
  if (state.meta.lastSummaryDate !== tKey) {
    const pendingToday = state.plans.filter((p) => !p.done && p.date === tKey);
    const overdue = state.plans.filter((p) => !p.done && p.date < tKey);
    if (pendingToday.length || overdue.length) {
      const lines = [];
      if (pendingToday.length) lines.push(`今天有 ${pendingToday.length} 项计划待完成`);
      if (overdue.length) lines.push(`${overdue.length} 项已逾期`);
      const nowMin = now.getHours() * 60 + now.getMinutes();
      const next = pendingToday
        .filter((p) => p.time && minutesOf(p.time) >= nowMin)
        .sort((a, b) => (a.time < b.time ? -1 : 1))[0];
      if (next) lines.push(`下一项 ${next.time}：${next.title}`);
      api.notify('行程日历提醒', lines.join('；'));
    }
    state.meta = await api.updateMeta({ lastSummaryDate: tKey });
    api.refreshTray();
  }

  // 2) 定点提醒：时间一到弹出通知（每个计划只弹一次）
  const nowMin = now.getHours() * 60 + now.getMinutes();
  for (const p of state.plans) {
    if (p.done || p.notified || !p.time || p.date !== tKey) continue;
    const gap = nowMin - minutesOf(p.time);
    if (gap >= 0 && gap <= 1) {
      api.notify('计划到点啦', `${p.time} ${p.title}`);
      p.notified = true;
      await api.updatePlan(p.id, { notified: true });
      changed = true;
    } else if (gap > 1) {
      // 启动时已过时间：由每日汇总覆盖，这里只做标记避免重复触发
      p.notified = true;
      await api.updatePlan(p.id, { notified: true });
      changed = true;
    }
  }

  if (changed) {
    renderCalendar();
    renderPlans();
    api.refreshTray();
  }
}

/* ================= Toast ================= */

let toastTimer = null;
function toast(message, type) {
  const wrap = $('#toastWrap');
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' ' + type : '');
  el.textContent = message;
  wrap.appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 260);
  }, 1900);
}

/* ================= 事件绑定 ================= */

function bindEvents() {
  $('#prevMonth').addEventListener('click', () => {
    const c = state.cursor;
    state.cursor = new Date(c.getFullYear(), c.getMonth() - 1, 1);
    renderCalendar();
  });
  $('#nextMonth').addEventListener('click', () => {
    const c = state.cursor;
    state.cursor = new Date(c.getFullYear(), c.getMonth() + 1, 1);
    renderCalendar();
  });
  $('#todayBtn').addEventListener('click', () => {
    state.selected = todayKey();
    const now = new Date();
    state.cursor = new Date(now.getFullYear(), now.getMonth(), 1);
    renderCalendar();
    renderPlans();
  });

  $('#addBtn').addEventListener('click', () => {
    const form = $('#addForm');
    if (form.classList.contains('open')) $('#fTitle').focus();
    else openForm();
  });
  $('#fCancel').addEventListener('click', closeForm);
  $('#addForm').addEventListener('submit', (e) => {
    e.preventDefault();
    submitPlan();
  });

  // 设置面板
  const panel = $('#settingsPanel');
  $('#settingsBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    panel.classList.toggle('hidden');
  });
  document.addEventListener('click', (e) => {
    if (!panel.classList.contains('hidden') && !panel.contains(e.target)) {
      panel.classList.add('hidden');
    }
  });

  bindSettingChange('#swAutoStart', 'autoStart', (v) =>
    v ? '已开启开机自动启动' : '已关闭开机自动启动'
  );
  bindSettingChange('#swNotify', 'notifications', (v) =>
    v ? '已开启系统通知' : '已关闭系统通知'
  );
  bindSettingChange('#swTray', 'minimizeToTray', (v) =>
    v ? '关闭窗口将最小化到托盘' : '关闭窗口将直接退出'
  );

  $('#openDataBtn').addEventListener('click', () => {
    api.openDataFolder();
    toast('已打开数据所在文件夹');
  });

  // 点击通知 / 第二实例唤起时回到今天
  api.onShowToday(() => {
    $('#todayBtn').click();
  });
}

init();
