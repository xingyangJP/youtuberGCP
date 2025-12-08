// API Base URL（フロントエンドサーバー経由でバックエンドにプロキシ）
const API_BASE_URL = '';

console.log('✅ app.js loaded');

// ------- グローバルヘルパー（早期に定義して参照エラーを防ぐ） -------
function getCheckedValues(selector) {
  return Array.from(document.querySelectorAll(selector)).filter(el => el.checked).map(el => el.value);
}
function pickRandom(arr) {
  if (!arr || arr.length === 0) return null;
  const idx = Math.floor(Math.random() * arr.length);
  return arr[idx];
}
// setConfigLoaded / isConfigLoaded をグローバルに固定
if (!window.__randomState) {
  window.__randomState = { configLoaded: false };
}
function setConfigLoaded(v) {
  window.__randomState.configLoaded = !!v;
  window.__configLoaded = window.__randomState.configLoaded;
}
function isConfigLoaded() {
  return !!(window.__randomState && window.__randomState.configLoaded);
}
window.setConfigLoaded = setConfigLoaded;
window.isConfigLoaded = isConfigLoaded;

function setDebugText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}
window.setDebugText = setDebugText;

function setManualInputsEnabled(enabled) {
  const ids = ['action', 'instrument', 'theme', 'duration'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.disabled = !enabled;
      el.classList.toggle('opacity-50', !enabled);
    }
  });
  const aspects = document.querySelectorAll('input[name="aspect"]');
  aspects.forEach(r => {
    r.disabled = !enabled;
    r.classList.toggle('opacity-50', !enabled);
  });
}

// UTC文字列(YYYY-MM-DD HH:MM:SS)をJST表示に変換
function formatJst(dateStr) {
  if (!dateStr) return '-';
  const iso = dateStr.replace(' ', 'T') + 'Z';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return dateStr;
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(d);
}

// デバッグ: 直近ジョブ5件を表示
async function loadDebugJobs() {
  const container = document.getElementById('debugJobsList');
  if (!container) return;
  container.innerHTML = '<p class="text-xs text-gray-500">Loading...</p>';
  try {
    const res = await fetch(`${API_BASE_URL}/api/debug/jobs`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'failed');
    const jobs = json.jobs || [];
    if (jobs.length === 0) {
      container.innerHTML = '<p class="text-xs text-gray-500">No jobs yet.</p>';
      return;
    }
    container.innerHTML = jobs.map(j => {
      const yt = j.youtube_video_id ? `YouTube: ${j.youtube_video_id}` : (j.youtube_uploaded ? 'YouTube: uploading...' : 'YouTube: pending');
      const statusLabel = j.status === 'completed' ? '✅' : (j.status === 'failed' ? '⚠️' : '⏳');
      const when = formatJst(j.created_at);
      return `
        <div class="border border-gray-200 rounded p-2 text-xs mb-2 bg-white">
          <div class="flex justify-between">
            <span class="font-semibold">${statusLabel} ${j.status}</span>
            <span class="text-gray-500">${when}</span>
          </div>
          <div class="text-gray-700 truncate">job: ${j.job_id}</div>
          <div class="text-gray-700 truncate">${yt}</div>
        </div>
      `;
    }).join('');
  } catch (err) {
    container.innerHTML = `<p class="text-xs text-red-600">Load error: ${err.message}</p>`;
  }
}
function refreshSchedulerUI() {
  const schedulerContent = document.getElementById('schedulerContent');
  const schedulerDisabled = document.getElementById('schedulerDisabled');
  const enableScheduler = document.getElementById('enableScheduler');
  if (!schedulerContent || !schedulerDisabled) {
    return;
  }
  const enabled = enableScheduler ? enableScheduler.checked : true;
  schedulerContent.style.display = enabled ? 'block' : 'none';
  schedulerDisabled.style.display = enabled ? 'none' : 'block';
}

// 先にスケジュール・設定取得のユーティリティを宣言（順序依存のバグを避ける）
function getScheduleConfig() {
  const toggle = document.getElementById('enableScheduler');
  const enabled = toggle ? toggle.checked : true;

  const timeInput = document.getElementById('dailyPostTime');
  const timeInput2 = document.getElementById('dailyPostTime2');
  const slot2Toggle = document.getElementById('enableSlot2');
  const slot1Toggle = document.getElementById('enableSlot1');
  return {
    enabled,
    slot1Enabled: slot1Toggle?.checked !== false,
    time: timeInput?.value || '09:00',
    time2: timeInput2?.value || '18:00',
    slot2Enabled: slot2Toggle?.checked || false,
    privacy: document.getElementById('privacy')?.value || 'public'
  };
}

// 設定を収集
function getConfig() {
  return {
    character: {
      mode: 'prompt',
      imageUrl: '',
      prompt: document.getElementById('characterPrompt').value
    },
    video: {
      action: document.getElementById('action').value,
      instrument: document.getElementById('instrument').value,
      theme: document.getElementById('theme').value,
      themePool: document.getElementById('themePool')?.value || '',
      aspectRatio: document.querySelector('input[name="aspect"]:checked').value,
      duration: parseInt(document.getElementById('duration').value)
    },
    music: {
      genre: document.getElementById('genre').value,
      language: document.querySelector('input[name="language"]:checked').value,
      lyrics: document.getElementById('lyrics').value
    },
    schedule: getScheduleConfig()
  };
}

// ヘルパー（先に宣言してスコープ不在エラーを防ぐ）
function getCheckedValues(selector) {
  return Array.from(document.querySelectorAll(selector)).filter(el => el.checked).map(el => el.value);
}
function pickRandom(arr) {
  if (!arr || arr.length === 0) return null;
  const idx = Math.floor(Math.random() * arr.length);
  return arr[idx];
}

// YouTube設定を表示
function displayYouTubeSettings(youtube) {
  const previewSection = document.getElementById('youtubeSettingsPreview');
  
  previewSection.innerHTML = `
    <div class="space-y-3">
      <div>
        <label class="text-xs font-semibold text-gray-500 uppercase">タイトル</label>
        <p class="text-sm font-medium text-gray-900 mt-1">${youtube.title}</p>
      </div>
      <div>
        <label class="text-xs font-semibold text-gray-500 uppercase">説明文</label>
        <p class="text-xs text-gray-700 mt-1 whitespace-pre-line">${youtube.description.substring(0, 150)}...</p>
      </div>
      <div>
        <label class="text-xs font-semibold text-gray-500 uppercase">タグ</label>
        <div class="flex flex-wrap gap-1 mt-1">
          ${youtube.tags.split(',').map(tag => 
            `<span class="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">${tag.trim()}</span>`
          ).join('')}
        </div>
      </div>
      <div class="bg-green-50 border border-green-200 rounded-lg p-3 mt-3">
        <div class="flex items-center">
          <i class="fas fa-check-circle text-green-600 mr-2"></i>
          <span class="text-xs font-semibold text-green-800">AI自動生成完了</span>
        </div>
      </div>
    </div>
  `;
}

function buildLocalYoutube(config) {
  const actionText = config.video.action || 'video';
  const instrumentText = (config.video.action === 'playing' || config.video.action === 'singing') && config.video.instrument ? `with ${config.video.instrument}` : '';
  const rawTheme = config.video.theme || 'vibe';
  const rawGenre = config.music.genre || 'pop';
  const sanitizeAscii = (s) => /[^\x00-\x7F]/.test(s) ? 'vibe' : s;
  const shortenTheme = (s) => {
    const parts = s.split(/[\n,\/]/).map(p => p.trim()).filter(Boolean);
    return (parts[0] || 'vibe').slice(0, 30);
  };
  const theme = sanitizeAscii(shortenTheme(rawTheme));
  const genre = sanitizeAscii(rawGenre);
  const lengthText = `${config.video.duration || 8}s`;
  const formatText = config.video.aspectRatio === '9:16' ? 'YouTube Shorts (9:16)' : 'YouTube (16:9)';
  const sanitize = (s, max) => s.length > max ? s.substring(0, max) : s;
  const title = sanitize(`[AI] ${genre} ${actionText} | ${theme}`, 60);
  const description = sanitize(`AI-generated short.\n\nTheme: ${theme}\nGenre: ${genre}\n${instrumentText ? `Instrument: ${instrumentText}\n` : ''}Length: ${lengthText}\nFormat: ${formatText}\n\n#AI #${genre} #${theme} #music #shorts #AIGenerated`, 4000);
  const tags = [
    'AI generated',
    'AI music',
    genre,
    theme,
    instrumentText ? instrumentText.replace('with ','') : null,
    config.video.aspectRatio === '9:16' ? 'Shorts' : 'YouTube',
    config.music.language === 'japanese' ? 'Japanese' : 'English'
  ].filter(Boolean).map(t => /[^\x00-\x7F]/.test(t) ? 'AI' : t).map(t => sanitize(t, 30)).slice(0, 8).join(', ');
  return { title, description, tags };
}

// YouTube設定を自動生成して表示（グローバルで使う）
async function updateYouTubeSettings() {
  const config = getConfig();
  const privacyLabel = document.getElementById('debugPrivacy');
  if (privacyLabel) {
    privacyLabel.textContent = config.schedule?.privacy || 'public';
  }
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/generate-youtube-settings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(config)
    });
    
    if (!response.ok) {
      throw new Error('YouTube設定の生成に失敗しました');
    }
    
    const result = await response.json();
    
    if (result.success && result.youtube) {
      displayYouTubeSettings(result.youtube);
      const status = document.getElementById('debugYoutubeStatus');
      if (status) status.textContent = 'generated';
      // 保存
      saveLocalConfig();
    } else {
      displayYouTubeSettings(buildLocalYoutube(config));
      const status = document.getElementById('debugYoutubeStatus');
      if (status) status.textContent = 'fallback (local)';
    }
  } catch (error) {
    console.error('Error updating YouTube settings:', error);
    displayYouTubeSettings(buildLocalYoutube(getConfig()));
    const status = document.getElementById('debugYoutubeStatus');
    if (status) status.textContent = `error: ${error.message}`;
  }
}
window.updateYouTubeSettings = updateYouTubeSettings;

// DOM読み込み完了後に実行
document.addEventListener('DOMContentLoaded', async () => {
  console.log('✅ DOM Content Loaded');
  await loadSchedule();
  await loadServerSettings();
  await loadLocalConfig();
  updateYouTubeSettings();
  loadDebugJobs();
  
  // キャラクター入力モード切り替え
  document.querySelectorAll('input[name="charMode"]').forEach(radio => {
  radio.addEventListener('change', (e) => {
    const uploadMode = document.getElementById('uploadMode');
    const promptMode = document.getElementById('promptMode');
    
    console.log('Mode changed to:', e.target.value); // デバッグログ
    
    if (e.target.value === 'upload') {
      uploadMode.style.display = 'block';
      promptMode.style.display = 'none';
    } else {
      uploadMode.style.display = 'none';
      promptMode.style.display = 'block';
    }
  });
});

// スケジューラ UI
const enableScheduler = document.getElementById('enableScheduler'); // なくてもOK
const schedulerContent = document.getElementById('schedulerContent');
const schedulerDisabled = document.getElementById('schedulerDisabled');

enableScheduler?.addEventListener('change', (e) => {
  refreshSchedulerUI();
  saveLocalConfig();
});
// 初期状態でも反映しておく
refreshSchedulerUI();

// アクション変更時に楽器セクションの表示/非表示
const actionSelect = document.getElementById('action');
const instrumentSection = document.getElementById('instrumentSection');

actionSelect?.addEventListener('change', (e) => {
  if (e.target.value === 'playing' || e.target.value === 'singing') {
    instrumentSection.style.display = 'block';
  } else {
    instrumentSection.style.display = 'none';
  }
  
  // YouTube設定を自動生成
  updateYouTubeSettings();
});

// ランダム設定（初期定義を上に置き、TDZ/参照エラーを防ぐ）
// グローバルに保存しておき、スクリプト順序やキャッシュの揺れでも参照エラーにしない
function getRandomState() {
  return window.__randomState;
}
function syncRandomUI(checked) {
  const randomToggle = document.getElementById('randomToggle');
  const randomSettings = document.getElementById('randomSettings');
  if (!randomSettings) return;
  if (randomToggle) randomToggle.checked = !!checked;
  randomSettings.classList.toggle('hidden', !checked);
  setManualInputsEnabled(!checked);
}
window.syncRandomUI = syncRandomUI;

const randomToggle = document.getElementById('randomToggle');
const randomSettings = document.getElementById('randomSettings');
const saveContentBtn = document.getElementById('saveContentBtn');

function setDebugText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}
window.setDebugText = setDebugText;

// 保存処理をラップして失敗を確実に検知
const safeSaveLocalConfig = async () => {
  try {
    await saveLocalConfig();
  } catch (err) {
    console.error('saveLocalConfig failed', err);
    throw err;
  }
};

// デフォルトでランダムONにしてUIを揃える（初期表示で確実に反映）
// 常にランダムモードで運用するため、初期状態でONにする
syncRandomUI(true);

if (saveContentBtn) {
  console.log('✅ saveContentBtn wired');
  saveContentBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    console.log('📝 saveContentBtn clicked');
    saveContentBtn.disabled = true;
    const original = saveContentBtn.innerHTML;
    saveContentBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>保存中...';
    try {
      await safeSaveLocalConfig();
      saveContentBtn.innerHTML = '<i class="fas fa-check mr-2"></i>保存しました';
    } catch (err) {
      console.error('save content failed', err);
      setDebugText('debugSettingsSave', `error ${err.message}`);
      saveContentBtn.innerHTML = '<i class="fas fa-exclamation-triangle mr-2"></i>保存失敗';
    } finally {
      setTimeout(() => {
        saveContentBtn.disabled = false;
        saveContentBtn.innerHTML = original;
      }, 1200);
    }
  });
} else {
  console.warn('saveContentBtn not found in DOM');
}

// 設定変更時にYouTube設定を自動更新 & ローカル保存
['theme', 'instrument', 'genre', 'language', 'duration', 'action', 'lyrics'].forEach(id => {
  const element = document.getElementById(id);
  if (element) {
    element.addEventListener('change', () => { updateYouTubeSettings(); safeSaveLocalConfig().catch(() => {}); });
  }
});

document.getElementById('characterPrompt')?.addEventListener('input', () => safeSaveLocalConfig().catch(() => {}));
document.querySelectorAll('input[name="aspect"]').forEach(radio => {
  radio.addEventListener('change', () => { updateYouTubeSettings(); safeSaveLocalConfig().catch(() => {}); });
});
document.querySelectorAll('input[name="language"]').forEach(radio => {
  radio.addEventListener('change', () => { updateYouTubeSettings(); safeSaveLocalConfig().catch(() => {}); });
});
document.getElementById('themePool')?.addEventListener('input', () => safeSaveLocalConfig().catch(() => {}));
document.getElementById('themePool')?.addEventListener('input', updateYouTubeSettings);
document.getElementById('themePool')?.addEventListener('change', () => safeSaveLocalConfig().catch(() => {}));
// 候補チェックの変更も保存
document.querySelectorAll('.action-candidate').forEach(el => {
  el.addEventListener('change', () => safeSaveLocalConfig().catch(() => {}));
});
document.querySelectorAll('.instrument-candidate').forEach(el => {
  el.addEventListener('change', () => safeSaveLocalConfig().catch(() => {}));
});
document.querySelectorAll('.length-candidate').forEach(el => {
  el.addEventListener('change', () => safeSaveLocalConfig().catch(() => {}));
});

document.querySelectorAll('input[name="aspect"]').forEach(radio => {
  radio.addEventListener('change', updateYouTubeSettings);
});

// YouTube設定を自動生成して表示
async function updateYouTubeSettings() {
  const config = getConfig();
  const privacyLabel = document.getElementById('debugPrivacy');
  if (privacyLabel) {
    privacyLabel.textContent = config.schedule?.privacy || 'public';
  }
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/generate-youtube-settings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(config)
    });
    
    if (!response.ok) {
      throw new Error('YouTube設定の生成に失敗しました');
    }
    
    const result = await response.json();
    
    if (result.success && result.youtube) {
      displayYouTubeSettings(result.youtube);
      const status = document.getElementById('debugYoutubeStatus');
      if (status) status.textContent = 'generated';
    } else {
      // 応答が無い場合でも現在の入力から暫定表示
      displayYouTubeSettings(buildLocalYoutube(config));
      const status = document.getElementById('debugYoutubeStatus');
      if (status) status.textContent = 'fallback (local)';
    }
  } catch (error) {
    console.error('Error updating YouTube settings:', error);
    // エラー時も暫定表示
    displayYouTubeSettings(buildLocalYoutube(getConfig()));
    const status = document.getElementById('debugYoutubeStatus');
    if (status) status.textContent = `error: ${error.message}`;
  }
}

function buildLocalYoutube(config) {
  const actionText = config.video.action || 'video';
  const instrumentText = (config.video.action === 'playing' || config.video.action === 'singing') && config.video.instrument ? `with ${config.video.instrument}` : '';
  const rawTheme = config.video.theme || 'vibe';
  const rawGenre = config.music.genre || 'pop';
  const theme = /[^\x00-\x7F]/.test(rawTheme) ? 'vibe' : rawTheme;
  const genre = /[^\x00-\x7F]/.test(rawGenre) ? 'pop' : rawGenre;
  const lengthText = `${config.video.duration || 8}s`;
  const formatText = config.video.aspectRatio === '9:16' ? 'YouTube Shorts (9:16)' : 'YouTube (16:9)';
  const title = `[AI] ${genre} ${actionText} | ${theme}`;
  const description = `AI-generated short.\n\nTheme: ${theme}\nGenre: ${genre}\n${instrumentText ? `Instrument: ${instrumentText}\n` : ''}Length: ${lengthText}\nFormat: ${formatText}\n\n#AI #${genre} #${theme} #music #shorts #AIGenerated`;
  const tags = [
    'AI generated',
    'AI music',
    genre,
    theme,
    instrumentText ? instrumentText.replace('with ','') : null,
    config.video.aspectRatio === '9:16' ? 'Shorts' : 'YouTube',
    config.music.language === 'japanese' ? 'Japanese' : 'English'
  ].filter(Boolean).map(t => /[^\x00-\x7F]/.test(t) ? 'AI' : t).join(', ');
  return { title, description, tags };
}

// YouTube設定を表示
function displayYouTubeSettings(youtube) {
  const previewSection = document.getElementById('youtubeSettingsPreview');
  
  previewSection.innerHTML = `
    <div class="space-y-3">
      <div>
        <label class="text-xs font-semibold text-gray-500 uppercase">タイトル</label>
        <p class="text-sm font-medium text-gray-900 mt-1">${youtube.title}</p>
      </div>
      <div>
        <label class="text-xs font-semibold text-gray-500 uppercase">説明文</label>
        <p class="text-xs text-gray-700 mt-1 whitespace-pre-line">${youtube.description.substring(0, 150)}...</p>
      </div>
      <div>
        <label class="text-xs font-semibold text-gray-500 uppercase">タグ</label>
        <div class="flex flex-wrap gap-1 mt-1">
          ${youtube.tags.split(',').map(tag => 
            `<span class="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">${tag.trim()}</span>`
          ).join('')}
        </div>
      </div>
      <div class="bg-green-50 border border-green-200 rounded-lg p-3 mt-3">
        <div class="flex items-center">
          <i class="fas fa-check-circle text-green-600 mr-2"></i>
          <span class="text-xs font-semibold text-green-800">AI自動生成完了</span>
        </div>
      </div>
    </div>
  `;
}

function applyRandomConfig() {
  const actionPool = getCheckedValues('.action-candidate');
  const instrumentPool = getCheckedValues('.instrument-candidate');
  const lengthPool = getCheckedValues('.length-candidate');
  const themeLines = document.getElementById('themePool')?.value.split(/[\n,、]/).map(t => t.trim()).filter(Boolean) || [];

  const action = pickRandom(actionPool) || 'singing';
  document.getElementById('action').value = action;

  // 楽器は歌う/演奏のときだけ選択
  if (action === 'playing' || action === 'singing') {
    const inst = pickRandom(instrumentPool) || 'acoustic-guitar';
    document.getElementById('instrument').value = inst;
    instrumentSection.style.display = 'block';
  } else {
    document.getElementById('instrument').value = '';
    instrumentSection.style.display = 'none';
  }

  const theme = pickRandom(themeLines) || '元気';
  document.getElementById('theme').value = theme;

  const length = pickRandom(lengthPool) || '8';
  const durationSelect = document.getElementById('duration');
  if (durationSelect) durationSelect.value = length;
}

// スケジュール保存ボタン
const saveScheduleBtn = document.getElementById('saveScheduleBtn');
saveScheduleBtn?.addEventListener('click', async () => {
  const scheduleConfig = getScheduleConfig();
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/save-schedule`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(scheduleConfig)
    });
    
    const result = await response.json();
    
    if (result.success) {
      // 成功メッセージを表示
      const originalText = saveScheduleBtn.innerHTML;
      saveScheduleBtn.innerHTML = '<i class="fas fa-check mr-2"></i>保存しました';
      saveScheduleBtn.classList.add('bg-green-600');
      saveScheduleBtn.classList.remove('bg-orange-600');
      // ランダム設定等も保存
      safeSaveLocalConfig().catch(() => {});
      
      setTimeout(() => {
        saveScheduleBtn.innerHTML = originalText;
        saveScheduleBtn.classList.remove('bg-green-600');
        saveScheduleBtn.classList.add('bg-orange-600');
      }, 2000);
    }
  } catch (error) {
    console.error('Error saving schedule:', error);
    alert('スケジュールの保存に失敗しました');
  }
});

// 動画生成ボタン
const generateBtn = document.getElementById('generateBtn');
const generationStatus = document.getElementById('generationStatus');
const progressBar = document.getElementById('progressBar');
const videoPreview = document.getElementById('videoPreview');

generateBtn?.addEventListener('click', async () => {
  applyRandomConfig(); // 常にランダム候補から反映

  const config = getConfig();

  // バリデーション
  if (!config.character.prompt) {
    alert('キャラクタープロンプトを入力してください');
    return;
  }

  // YouTube設定を取得
  const youtubeResponse = await fetch(`${API_BASE_URL}/api/generate-youtube-settings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(config)
  });
  
  const youtubeResult = await youtubeResponse.json();
  if (youtubeResult.success && youtubeResult.youtube) {
    config.youtube = youtubeResult.youtube;
  } else {
    config.youtube = buildLocalYoutube(config);
  }

  // 生成開始
  generateBtn.disabled = true;
  generateBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>生成中...';
  generationStatus.classList.remove('hidden');

  try {
    // ジョブを作成（即座にレスポンスが返る）
    const response = await fetch(`${API_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(config)
    });

    if (!response.ok) {
      throw new Error('生成リクエストに失敗しました');
    }

    const result = await response.json();

    if (!result.success || !result.jobId) {
      throw new Error(result.error || 'ジョブの作成に失敗しました');
    }

    console.log('✅ Job created:', result.jobId);
    
    // ポーリング開始
    generationStatus.innerHTML = `
      <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div class="flex items-center">
          <i class="fas fa-spinner fa-spin text-blue-600 mr-2"></i>
          <span class="text-sm font-semibold text-blue-800">動画生成中... (Sora 2 / 通常1-3分)</span>
        </div>
        <p class="text-xs text-blue-600 mt-1">ジョブID: ${result.jobId}</p>
      </div>
    `;
    
    // バックグラウンド処理をトリガー
    fetch(`${API_BASE_URL}/api/cron/process-jobs`).catch(err => console.log('Cron trigger error:', err));
    
    // 10秒ごとにポーリング（Sora 2は数分程度）
    let pollCount = 0;
    const maxPolls = 180; // 最大30分
    
    const pollInterval = setInterval(async () => {
      // 90秒経過後から30秒ごとにバックグラウンド完了確認をトリガー
      if (pollCount >= 9 && pollCount % 3 === 0) { // 90秒後から30秒ごと
        fetch(`${API_BASE_URL}/api/cron/check-jobs`).catch(err => console.log('Cron check error:', err));
      }
      
      try {
        pollCount++;
        const elapsedSeconds = pollCount * 10;
        console.log(`🔍 Polling ${pollCount}/${maxPolls}... (${elapsedSeconds}秒経過)`);
        
        const jobResponse = await fetch(`${API_BASE_URL}/api/job/${result.jobId}`);
        const jobResult = await jobResponse.json();
        
        if (!jobResult.success) {
          throw new Error('ジョブステータスの取得に失敗しました');
        }
        
        const job = jobResult.job;
        console.log('Job status:', job.status);
        
          if (job.status === 'completed') {
          clearInterval(pollInterval);
          
          // 進行状況を100%に設定
          progressBar.style.width = '100%';
          
          // 生成完了メッセージ
          let statusMessage = '✅ 動画生成完了！';
          if (config.schedule.enabled && config.schedule.time) {
            statusMessage = `✅ 生成完了！スケジュールは ${config.schedule.time}/${config.schedule.time2 || 'なし'} で自動生成・投稿されます`;
          }
          
          generationStatus.innerHTML = `
            <div class="bg-green-50 border border-green-200 rounded-lg p-4">
              <div class="flex items-center">
                <i class="fas fa-check-circle text-green-600 mr-2"></i>
                <span class="text-sm font-semibold text-green-800">${statusMessage}</span>
              </div>
              ${job.videoUrl ? `
                <a href="${job.videoUrl}" target="_blank" class="text-sm text-blue-600 hover:underline mt-2 block">
                  📹 動画を確認
                </a>
              ` : ''}
            </div>
          `;

          // プレビューに動画を表示
          if (job.videoUrl) {
            videoPreview.innerHTML = `
              <video controls class="w-full h-full rounded-lg">
                <source src="${job.videoUrl}" type="video/mp4">
              </video>
            `;
            const dbg = document.getElementById('debugVideoUrl');
            if (dbg) dbg.textContent = job.videoUrl;
          }

          // YouTube自動投稿
          if (job.videoUrl && config.youtube) {
            uploadToYouTube(job.videoUrl, config.youtube, config.schedule?.privacy || 'unlisted')
              .then(res => {
                if (res.success) {
                  const dbg = document.getElementById('debugYoutubeStatus');
                  if (dbg) dbg.textContent = `uploaded: https://youtu.be/${res.videoId}`;
                  generationStatus.innerHTML += `
                    <div class="mt-2 text-sm text-green-700">
                      <i class="fab fa-youtube text-red-500 mr-1"></i> YouTube upload success: https://youtu.be/${res.videoId}
                    </div>`;
                } else {
                  const dbg = document.getElementById('debugYoutubeStatus');
                  if (dbg) dbg.textContent = `upload failed: ${res.error || 'unknown'}`;
                  generationStatus.innerHTML += `
                    <div class="mt-2 text-sm text-red-700">
                      <i class="fab fa-youtube text-red-500 mr-1"></i> YouTube upload failed: ${res.error || 'unknown error'}
                    </div>`;
                }
              })
              .catch(err => {
                const dbg = document.getElementById('debugYoutubeStatus');
                if (dbg) dbg.textContent = `upload failed: ${err.message}`;
                generationStatus.innerHTML += `
                  <div class="mt-2 text-sm text-red-700">
                    <i class="fab fa-youtube text-red-500 mr-1"></i> YouTube upload failed: ${err.message}
                  </div>`;
              })
          }

          // 履歴に追加
          addToHistory({ videoUrl: job.videoUrl }, config);

          // ボタンをリセット
          generateBtn.disabled = false;
          generateBtn.innerHTML = '<i class="fas fa-magic mr-2"></i><span id="generateBtnText">今すぐ動画を生成</span>';
          
        } else if (job.status === 'failed') {
          clearInterval(pollInterval);
          throw new Error(job.errorMessage || '動画生成に失敗しました');
          
        } else if (pollCount >= maxPolls) {
          clearInterval(pollInterval);
          throw new Error('タイムアウト: 動画生成に30分以上かかっています');
        } else if (job.status === 'processing' && pollCount % 6 === 0) {
          // 60秒ごとにステータスメッセージを更新
          const minutes = Math.floor(pollCount * 10 / 60);
          generationStatus.innerHTML = `
            <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div class="flex items-center">
                <i class="fas fa-spinner fa-spin text-blue-600 mr-2"></i>
                <span class="text-sm font-semibold text-blue-800">動画生成中... (${minutes}分経過、通常1-3分)</span>
              </div>
              <p class="text-xs text-blue-600 mt-1">Sora 2で高品質動画を生成しています...</p>
            </div>
          `;
        }
        
      } catch (pollError) {
        clearInterval(pollInterval);
        console.error('Polling error:', pollError);
        generationStatus.innerHTML = `
          <div class="bg-red-50 border border-red-200 rounded-lg p-4">
            <div class="flex items-center">
              <i class="fas fa-exclamation-circle text-red-600 mr-2"></i>
              <span class="text-sm font-semibold text-red-800">エラーが発生しました</span>
            </div>
            <p class="text-xs text-red-600 mt-1">${pollError.message}</p>
          </div>
        `;
        generateBtn.disabled = false;
        generateBtn.innerHTML = '<i class="fas fa-magic mr-2"></i><span id="generateBtnText">今すぐ動画を生成</span>';
      }
    }, 10000); // 10秒ごと

  } catch (error) {
    console.error('Error:', error);
    generationStatus.innerHTML = `
      <div class="bg-red-50 border border-red-200 rounded-lg p-4">
        <div class="flex items-center">
          <i class="fas fa-exclamation-circle text-red-600 mr-2"></i>
          <span class="text-sm font-semibold text-red-800">エラーが発生しました</span>
        </div>
        <p class="text-xs text-red-600 mt-1">${error.message}</p>
      </div>
    `;
    generateBtn.disabled = false;
    generateBtn.innerHTML = '<i class="fas fa-magic mr-2"></i><span id="generateBtnText">今すぐ動画を生成</span>';
  }
});

// 履歴に追加
function addToHistory(result, config) {
  // 履歴機能を無効化
  return;
}

async function uploadToYouTube(videoUrl, youtube, privacy) {
  try {
    const yt = youtube && youtube.title ? youtube : buildLocalYoutube(getConfig());
    const res = await fetch(`${API_BASE_URL}/api/youtube-upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        videoUrl,
        youtube: yt,
        privacy
      })
    })
    const json = await res.json()
    return json
  } catch (err) {
    return { success: false, error: err.message }
  }
}

  // ページロード時の初期化
  console.log('YouTube AI Video Generator - Ready');
  
  // 初期状態で楽器セクションを表示
  const action = document.getElementById('action').value;
  if (action !== 'playing' && action !== 'singing') {
    instrumentSection.style.display = 'none';
  }
  
  // スケジューラ表示を初期化
  refreshSchedulerUI();
});

// ローカル保存/復元
async function saveLocalConfig() {
  const data = {
    characterPrompt: document.getElementById('characterPrompt')?.value || '',
    action: document.getElementById('action')?.value || '',
    instrument: document.getElementById('instrument')?.value || '',
    theme: document.getElementById('theme')?.value || '',
    aspect: document.querySelector('input[name="aspect"]:checked')?.value || '',
    duration: document.getElementById('duration')?.value || '',
    genre: document.getElementById('genre')?.value || '',
    language: document.querySelector('input[name="language"]:checked')?.value || '',
    lyrics: document.getElementById('lyrics')?.value || '',
    random: true,
    themePool: document.getElementById('themePool')?.value || '',
    actionCandidates: getCheckedValues('.action-candidate'),
    instrumentCandidates: getCheckedValues('.instrument-candidate'),
    lengthCandidates: getCheckedValues('.length-candidate')
  }
  try {
    localStorage.setItem('formConfig', JSON.stringify(data))
  } catch (e) {
    console.warn('saveLocalConfig failed (localStorage)', e)
  }
  // localStorage が使えなくてもサーバ保存は走らせる
  await saveServerSettings(data)
  if (typeof setDebugText === 'function') {
    setDebugText('debugSettingsSave', `ok ${new Date().toLocaleTimeString('ja-JP')}`)
  }
}

function loadLocalConfig() {
  try {
    const raw = localStorage.getItem('formConfig')
    if (!raw) return
    const data = JSON.parse(raw)
    if (typeof setConfigLoaded === 'function') setConfigLoaded(true)
    // サーバ側スケジュールを優先するため、ローカル保存のスケジュールは適用しない
    if (data.schedule) delete data.schedule
    applyConfig(data)
    updateYouTubeSettings()
  } catch (e) {
    console.warn('loadLocalConfig failed', e)
  }
}

function applyConfig(data) {
  if (!data) return
  if (typeof setConfigLoaded === 'function') setConfigLoaded(true)
  if (data.characterPrompt !== undefined) document.getElementById('characterPrompt').value = data.characterPrompt
  if (data.action) document.getElementById('action').value = data.action
  if (data.instrument !== undefined) document.getElementById('instrument').value = data.instrument
  if (data.theme !== undefined) document.getElementById('theme').value = data.theme
  if (data.aspect) {
    const r = document.querySelector(`input[name="aspect"][value="${data.aspect}"]`)
    if (r) r.checked = true
  }
  if (data.duration) document.getElementById('duration').value = data.duration
  if (data.genre) document.getElementById('genre').value = data.genre
  if (data.language) {
    const r = document.querySelector(`input[name="language"][value="${data.language}"]`)
    if (r) r.checked = true
  }
  if (data.lyrics !== undefined) document.getElementById('lyrics').value = data.lyrics
  const rt = document.getElementById('randomToggle')
  if (rt || document.getElementById('randomSettings')) {
    const randomEnabled = data.random !== undefined ? !!data.random : true
    syncRandomUI(randomEnabled)
    if (randomEnabled && data.random === undefined) {
      applyRandomConfig()
    }
    refreshSchedulerUI();
  }
  if (data.themePool !== undefined) {
    const tp = document.getElementById('themePool')
    if (tp) tp.value = data.themePool
  }
  if (data.actionCandidates) {
    document.querySelectorAll('.action-candidate').forEach(el => {
      el.checked = data.actionCandidates.includes(el.value)
    })
  }
  if (data.instrumentCandidates) {
    document.querySelectorAll('.instrument-candidate').forEach(el => {
      el.checked = data.instrumentCandidates.includes(el.value)
    })
  }
  if (data.lengthCandidates) {
    document.querySelectorAll('.length-candidate').forEach(el => {
      el.checked = data.lengthCandidates.includes(el.value)
    })
  }
  if (data.schedule) {
    const enable = document.getElementById('enableScheduler')
    const timeInput = document.getElementById('dailyPostTime')
    const timeInput2 = document.getElementById('dailyPostTime2')
    const slot2Toggle = document.getElementById('enableSlot2')
    const slot1Toggle = document.getElementById('enableSlot1')
    const privacy = document.getElementById('privacy')
    const schedulerContent = document.getElementById('schedulerContent')
    const schedulerDisabled = document.getElementById('schedulerDisabled')
    if (enable) enable.checked = !!data.schedule.enabled
    if (slot1Toggle) slot1Toggle.checked = data.schedule.slot1Enabled !== false
    if (timeInput && data.schedule.time) timeInput.value = data.schedule.time
    if (timeInput2 && data.schedule.time2) timeInput2.value = data.schedule.time2
    if (slot2Toggle) slot2Toggle.checked = !!data.schedule.slot2Enabled
    if (privacy && data.schedule.privacy) privacy.value = data.schedule.privacy
    refreshSchedulerUI()
    const dbgPrivacy = document.getElementById('debugPrivacy')
    if (dbgPrivacy) dbgPrivacy.textContent = data.schedule.privacy || 'public'
  }
}

async function saveServerSettings(data) {
  // サーバ保存はスケジュールを含めない（スケジュールは /api/schedule が唯一の正）
  const { schedule, ...rest } = data || {}
  const res = await fetch(`${API_BASE_URL}/api/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(rest)
  })
  if (!res.ok) {
    if (typeof setDebugText === 'function') setDebugText('debugSettingsSave', `http ${res.status}`)
    throw new Error(`saveServerSettings failed: ${res.status}`)
  }
  const json = await res.json().catch(() => ({}))
  if (!json.success) {
    if (typeof setDebugText === 'function') setDebugText('debugSettingsSave', `error ${json.error || 'unknown'}`)
    throw new Error(json.error || 'saveServerSettings returned error')
  }
  if (typeof setDebugText === 'function') setDebugText('debugSettingsSave', `ok ${new Date().toLocaleTimeString('ja-JP')}`)
}

async function loadServerSettings() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/settings`, { cache: 'no-store' })
    if (!res.ok) {
      if (typeof setDebugText === 'function') setDebugText('debugSettingsLoad', `http ${res.status}`)
      throw new Error(`loadServerSettings http ${res.status}`)
    }
    const json = await res.json()
    if (json.success && json.settings) {
      const { schedule, ...rest } = json.settings // スケジュールはサーバ専用APIからのみ反映
      applyConfig(rest)
      updateYouTubeSettings()
      if (typeof setDebugText === 'function') setDebugText('debugSettingsLoad', `ok ${new Date().toLocaleTimeString('ja-JP')}`)
    }
  } catch (e) {
    console.warn('loadServerSettings failed', e)
    if (typeof setDebugText === 'function') setDebugText('debugSettingsLoad', `error ${e.message}`)
  }
}

async function loadSchedule() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/schedule`)
    const json = await res.json()
    if (!json.success) return
    const sch = json.schedule || {}

    const enable = document.getElementById('enableScheduler')
    const timeInput = document.getElementById('dailyPostTime')
    const timeInput2 = document.getElementById('dailyPostTime2')
    const slot2Toggle = document.getElementById('enableSlot2')
    const slot1Toggle = document.getElementById('enableSlot1')
    const privacy = document.getElementById('privacy')
    const schedulerContent = document.getElementById('schedulerContent')
    const schedulerDisabled = document.getElementById('schedulerDisabled')

    if (enable) enable.checked = !!sch.enabled
    if (slot1Toggle) slot1Toggle.checked = sch.slot1Enabled !== false
    if (timeInput && sch.time) timeInput.value = sch.time
    if (timeInput2 && sch.time2) timeInput2.value = sch.time2
    if (slot2Toggle) slot2Toggle.checked = !!sch.slot2Enabled
    if (privacy && sch.privacy) privacy.value = sch.privacy

    refreshSchedulerUI();

    const dbgPrivacy = document.getElementById('debugPrivacy')
    if (dbgPrivacy) dbgPrivacy.textContent = sch.privacy || 'public'
  } catch (e) {
    console.warn('loadSchedule failed', e)
  }
}

// 最終フォールバック: 設定が読み込まれなかった場合はランダムONで初期化
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    if (!isConfigLoaded() && randomToggle) {
      syncRandomUI(true)
      applyRandomConfig()
      safeSaveLocalConfig().catch(() => {})
      updateYouTubeSettings()
    }
  }, 100);
});

console.log('✅ All event listeners registered');
