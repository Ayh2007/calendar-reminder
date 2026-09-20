'use strict';

/**
 * 轻量 JSON 文件存储：所有计划与设置保存在用户目录下的 calendar-reminder.json
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');

let dataPath = '';
let data = null;

function defaultData() {
  return {
    version: 1,
    plans: [],
    settings: {
      autoStart: true,        // 开机自动启动
      notifications: true,    // 系统通知提醒
      minimizeToTray: true    // 关闭窗口时最小化到托盘
    },
    meta: {
      lastSummaryDate: null   // 最近一次弹出“今日待办汇总”的日期
    }
  };
}

function init() {
  const dir = app.getPath('userData');
  dataPath = path.join(dir, 'calendar-reminder.json');

  try {
    if (fs.existsSync(dataPath)) {
      const raw = fs.readFileSync(dataPath, 'utf-8');
      const parsed = JSON.parse(raw);
      data = Object.assign(defaultData(), parsed);
      data.settings = Object.assign(defaultData().settings, parsed.settings || {});
      data.meta = Object.assign(defaultData().meta, parsed.meta || {});
      if (!Array.isArray(data.plans)) data.plans = [];
    } else {
      data = defaultData();
      save();
    }
  } catch (err) {
    // 文件损坏时不吞掉用户数据：备份后重建
    try {
      if (fs.existsSync(dataPath)) {
        fs.copyFileSync(dataPath, dataPath + '.broken-' + Date.now());
      }
    } catch (_) {}
    console.error('存储文件读取失败，已重建：', err);
    data = defaultData();
    save();
  }
}

function save() {
  if (!data) return;
  try {
    const tmp = dataPath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmp, dataPath);
  } catch (err) {
    console.error('存储文件写入失败：', err);
  }
}

function getDataPath() {
  return dataPath;
}

function getPlans() {
  return data.plans;
}

function createPlan(input) {
  const now = new Date();
  const plan = {
    id: crypto.randomUUID(),
    title: String(input.title || '').trim().slice(0, 200),
    date: String(input.date || ''),
    time: input.time ? String(input.time) : null,
    note: String(input.note || '').trim().slice(0, 1000),
    done: false,
    notified: false,
    createdAt: now.toISOString()
  };
  if (!plan.title || !plan.date) return null;
  data.plans.push(plan);
  save();
  return plan;
}

function updatePlan(id, patch) {
  const plan = data.plans.find((p) => p.id === id);
  if (!plan) return null;
  const allowed = ['title', 'date', 'time', 'note', 'done', 'notified'];
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      plan[key] = patch[key];
    }
  }
  if (typeof plan.title === 'string') plan.title = plan.title.trim().slice(0, 200);
  if (typeof plan.note === 'string') plan.note = plan.note.trim().slice(0, 1000);
  save();
  return plan;
}

function removePlan(id) {
  const before = data.plans.length;
  data.plans = data.plans.filter((p) => p.id !== id);
  save();
  return data.plans.length !== before;
}

function getSettings() {
  return data.settings;
}

function updateSettings(patch) {
  Object.assign(data.settings, patch || {});
  save();
  return data.settings;
}

function getMeta() {
  return data.meta;
}

function updateMeta(patch) {
  Object.assign(data.meta, patch || {});
  save();
  return data.meta;
}

/** 仅供冒烟测试使用：填充演示数据 */
function seedDemo() {
  const key = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const today = new Date();
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const inFiveDays = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 5);
  const inTenDays = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 10);
  data.plans = [
    { id: crypto.randomUUID(), title: '团队站会，同步本周进度', date: key(today), time: '09:30', note: '准备好项目周报', done: false, notified: true, createdAt: new Date().toISOString() },
    { id: crypto.randomUUID(), title: '提交季度总结报告', date: key(today), time: '14:00', note: '', done: false, notified: false, createdAt: new Date().toISOString() },
    { id: crypto.randomUUID(), title: '健身房锻炼 1 小时', date: key(today), time: '19:00', note: '有氧 + 上肢', done: false, notified: false, createdAt: new Date().toISOString() },
    { id: crypto.randomUUID(), title: '阅读《深度工作》第 4 章', date: key(today), time: null, note: '', done: true, notified: false, createdAt: new Date().toISOString() },
    { id: crypto.randomUUID(), title: '牙医复诊', date: key(tomorrow), time: '10:00', note: '带上医保卡', done: false, notified: false, createdAt: new Date().toISOString() },
    { id: crypto.randomUUID(), title: '去取快递', date: key(inFiveDays), time: null, note: '小区菜鸟驿站', done: false, notified: false, createdAt: new Date().toISOString() },
    { id: crypto.randomUUID(), title: '项目验收汇报', date: key(inTenDays), time: '15:00', note: '准备演示文稿', done: false, notified: false, createdAt: new Date().toISOString() },
    { id: crypto.randomUUID(), title: '回复客户邮件', date: key(yesterday), time: null, note: '已过期', done: false, notified: true, createdAt: new Date().toISOString() }
  ];
  save();
}

module.exports = {
  init,
  save,
  getDataPath,
  getPlans,
  createPlan,
  updatePlan,
  removePlan,
  getSettings,
  updateSettings,
  getMeta,
  updateMeta,
  seedDemo
};
