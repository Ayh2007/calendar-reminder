'use strict';

const {
  app,
  BrowserWindow,
  ipcMain,
  Notification,
  Tray,
  Menu,
  screen,
  nativeImage,
  shell
} = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const store = require('./storage');

const SMOKE = !!process.env.SMOKE_TEST;
const isAutostart = process.argv.includes('--autostart');

let mainWindow = null;
let tray = null;
let isQuitting = false;

// 冒烟测试使用独立的用户数据目录，避免污染真实数据
if (SMOKE) {
  app.setPath('userData', path.join(os.tmpdir(), 'calendar-reminder-smoke'));
}

// 单实例锁：第二次启动时直接唤起已有窗口
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.whenReady().then(start);

  app.on('second-instance', () => {
    showWindow();
  });

  app.on('window-all-closed', () => {
    // Windows 上保留托盘进程；真正退出只能通过托盘菜单
    if (process.platform !== 'darwin' && !store.getSettings().minimizeToTray) {
      app.quit();
    }
  });
}

function start() {
  app.setAppUserModelId('com.trae.calendarreminder');
  store.init();
  if (SMOKE) store.seedDemo();

  createWindow();
  createTray();

  if (!SMOKE) {
    syncLoginItem(store.getSettings().autoStart);
  }

  registerIpc();
}

/**
 * 创建主窗口 —— 严格限制在屏幕的一半以内：
 * 默认尺寸 = 工作区宽高的 50%，maxWidth/maxHeight 同样锁死为 50%，
 * 无论怎么拖拽缩放都不可能超过半屏。
 */
function createWindow() {
  const display = screen.getPrimaryDisplay();
  const wa = display.workArea;

  const width = Math.max(380, Math.floor(wa.width * 0.5));
  const height = Math.max(420, Math.floor(wa.height * 0.5));

  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth: 380,
    minHeight: 420,
    maxWidth: width,
    maxHeight: Math.floor(wa.height * 0.5),
    x: wa.x + wa.width - width - 20,
    y: wa.y + 20,
    title: '行程日历提醒',
    backgroundColor: '#eef1f8',
    autoHideMenuBar: true,
    show: false,
    icon: path.join(__dirname, '..', '..', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  // 关闭按钮 → 最小化到托盘；托盘“退出”才真正退出
  mainWindow.on('close', (event) => {
    if (!isQuitting && store.getSettings().minimizeToTray) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  if (SMOKE) setupSmokeHooks(mainWindow);
}

function setupSmokeHooks(win) {
  let failed = false;
  win.webContents.on('did-fail-load', (_e, code, desc) => {
    failed = true;
    console.error(`[SMOKE] 页面加载失败 code=${code} desc=${desc}`);
  });
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2) console.error('[SMOKE][renderer]', message);
  });
  win.webContents.once('did-finish-load', () => {
    setTimeout(async () => {
      try {
        const out1 = path.join(os.tmpdir(), 'calendar-reminder-smoke.png');
        fs.writeFileSync(out1, (await win.webContents.capturePage()).toPNG());
        console.log('[SMOKE] 截图1已保存: ' + out1);

        // 展开添加表单与设置面板，验证这两个界面
        await win.webContents.executeJavaScript(
          "document.querySelector('#addForm').classList.add('open');" +
          "document.querySelector('#settingsPanel').classList.remove('hidden');"
        );
        await new Promise((r) => setTimeout(r, 500));
        const out2 = path.join(os.tmpdir(), 'calendar-reminder-smoke2.png');
        fs.writeFileSync(out2, (await win.webContents.capturePage()).toPNG());
        console.log('[SMOKE] 截图2已保存: ' + out2);
      } catch (err) {
        failed = true;
        console.error('[SMOKE] 截图失败:', err);
      }
      // 验证即将到来区域与倒计时标签
      try {
        const check = await win.webContents.executeJavaScript(
          "(() => {" +
          "  const d = document.querySelector('.upcoming-divider');" +
          "  const items = document.querySelectorAll('.upcoming-item');" +
          "  const badges = document.querySelectorAll('.countdown-badge');" +
          "  return JSON.stringify({ divider: !!d, items: items.length, badges: badges.length, texts: Array.from(badges).map(b => b.textContent) });" +
          "})()"
        );
        console.log('[SMOKE] 即将到来: ' + check);
        const parsed = JSON.parse(check);
        if (!parsed.divider || parsed.items === 0 || parsed.badges === 0) {
          failed = true;
          console.error('[SMOKE] 即将到来区域缺失');
        }
      } catch (err) {
        failed = true;
        console.error('[SMOKE] DOM 验证失败:', err);
      }
      console.log(failed ? '[SMOKE] FAILED' : '[SMOKE] OK');
      app.exit(failed ? 1 : 0);
    }, 2800);
  });
}

function showWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  mainWindow.webContents.send('app:show-today');
}

function hideWindow() {
  if (mainWindow) mainWindow.hide();
}

/* ---------------- 开机自启 ---------------- */

function syncLoginItem(enabled) {
  try {
    app.setLoginItemSettings({
      openAtLogin: !!enabled,
      path: process.execPath,
      args: ['--autostart']
    });
  } catch (err) {
    console.error('设置开机自启失败：', err);
  }
}

/* ---------------- 系统托盘 ---------------- */

function createTray() {
  const iconPath = path.join(__dirname, '..', '..', 'assets', 'tray-icon.png');
  const image = nativeImage.createFromPath(iconPath);
  tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image);
  refreshTray();

  tray.on('click', () => {
    if (mainWindow && mainWindow.isVisible()) hideWindow();
    else showWindow();
  });
}

function localDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function refreshTray() {
  if (!tray) return;
  const today = localDateKey(new Date());
  const todayPending = store.getPlans().filter((p) => !p.done && p.date === today).length;
  const overdue = store.getPlans().filter((p) => !p.done && p.date < today).length;

  tray.setToolTip(`行程日历提醒：今日待办 ${todayPending} 项${overdue ? `，逾期 ${overdue} 项` : ''}`);

  const menu = Menu.buildFromTemplate([
    { label: `今日待办：${todayPending} 项`, enabled: false },
    { label: `逾期未完成：${overdue} 项`, enabled: false },
    { type: 'separator' },
    { label: '显示主面板', click: () => showWindow() },
    {
      label: '退出',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);
  tray.setContextMenu(menu);
}

/* ---------------- IPC ---------------- */

function registerIpc() {
  ipcMain.handle('plans:list', () => store.getPlans());
  ipcMain.handle('plans:create', (_e, input) => {
    const plan = store.createPlan(input || {});
    refreshTray();
    return plan;
  });
  ipcMain.handle('plans:update', (_e, payload) => {
    const plan = store.updatePlan(payload.id, payload.patch || {});
    refreshTray();
    return plan;
  });
  ipcMain.handle('plans:remove', (_e, id) => {
    const ok = store.removePlan(id);
    refreshTray();
    return ok;
  });

  ipcMain.handle('settings:get', () => store.getSettings());
  ipcMain.handle('settings:update', (_e, patch) => {
    const next = store.updateSettings(patch || {});
    if (Object.prototype.hasOwnProperty.call(patch || {}, 'autoStart') && !SMOKE) {
      syncLoginItem(next.autoStart);
    }
    return next;
  });

  ipcMain.handle('meta:get', () => store.getMeta());
  ipcMain.handle('meta:update', (_e, patch) => store.updateMeta(patch || {}));

  ipcMain.handle('app:open-data', () => {
    shell.openPath(path.dirname(store.getDataPath()));
    return true;
  });

  ipcMain.handle('tray:refresh', () => {
    refreshTray();
    return true;
  });

  ipcMain.handle('notify:show', (_e, payload) => {
    const { title, body } = payload || {};
    if (SMOKE) {
      console.log(`[SMOKE][notify] ${title} :: ${body}`);
      return true;
    }
    if (!Notification.isSystemSupported()) return false;
    const notification = new Notification({
      title: title || '行程日历提醒',
      body: body || '',
      icon: path.join(__dirname, '..', '..', 'assets', 'icon.png'),
      silent: false
    });
    notification.on('click', () => showWindow());
    notification.show();
    return true;
  });

  ipcMain.on('app:hide', () => hideWindow());
  ipcMain.on('app:quit', () => {
    isQuitting = true;
    app.quit();
  });
}
