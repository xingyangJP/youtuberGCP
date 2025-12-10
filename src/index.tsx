import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { renderer } from './renderer'
import OpenAI from 'openai'
import { Buffer } from 'node:buffer'
import { Firestore } from '@google-cloud/firestore'

type Bindings = {
  OPENAI_API_KEY: string
  YOUTUBE_CLIENT_ID?: string
  YOUTUBE_CLIENT_SECRET?: string
  YOUTUBE_REFRESH_TOKEN?: string
  GOOGLE_CLOUD_PROJECT?: string
  FIRESTORE_PROJECT_ID?: string
}

// Firestore クライアント（ADC 前提）
const resolveProjectId = () =>
  process.env.FIRESTORE_PROJECT_ID ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.PROJECT_ID

// 明示設定がなくてもプロジェクトIDをデフォルトにフォールバック
const firestoreProjectId = resolveProjectId() || 'youtuber-480602'
console.log('Firestore init projectId:', firestoreProjectId || '(not set)')

const firestore = new Firestore({
  projectId: firestoreProjectId,
  preferRest: true
})
const colJobs = firestore.collection('jobs')
const colSchedules = firestore.collection('schedules')
const colSettings = firestore.collection('settings')
const colRuns = firestore.collection('schedule_runs')
const DEFAULT_SCHEDULE_ID = 'default'
const DEFAULT_SETTINGS_ID = 'default'

type JobDoc = {
  job_id: string
  status: string
  prompt: string
  config: any
  video_url?: string | null
  error_message?: string | null
  created_at: number
  started_at?: number | null
  completed_at?: number | null
}

const nowMs = () => Date.now()

const getScheduleDefault = () => ({
  enabled: false,
  slot1_enabled: true,
  slot1_time: '09:00',
  slot2_enabled: false,
  slot2_time: '18:00',
  privacy: 'public',
  updated_at: new Date().toISOString()
})

const getScheduleDoc = async () => {
  const doc = await colSchedules.doc(DEFAULT_SCHEDULE_ID).get()
  if (!doc.exists) return getScheduleDefault()
  return doc.data() || getScheduleDefault()
}

const saveScheduleDoc = async (data: any) => {
  const payload = {
    ...getScheduleDefault(),
    ...data,
    updated_at: new Date().toISOString()
  }
  await colSchedules.doc(DEFAULT_SCHEDULE_ID).set(payload, { merge: true })
  return payload
}

const getSettingsDoc = async () => {
  const doc = await colSettings.doc(DEFAULT_SETTINGS_ID).get()
  if (!doc.exists) return null
  return doc.data()?.data ? JSON.parse(doc.data()!.data as string) : doc.data()
}

const saveSettingsDoc = async (body: any) => {
  await colSettings.doc(DEFAULT_SETTINGS_ID).set({
    data: JSON.stringify(body),
    updated_at: new Date().toISOString()
  })
}

const getJobById = async (jobId: string) => {
  const doc = await colJobs.doc(jobId).get()
  if (!doc.exists) return null
  return doc.data() as JobDoc
}

const app = new Hono<{ Bindings: Bindings }>()

// CORS設定
app.use('/api/*', cors())

app.use(renderer)

const logError = (label: string, error: any) => {
  try {
    console.error(label, {
      name: error?.name,
      message: error?.message,
      code: error?.code,
      details: error?.details,
      stack: error?.stack
    })
  } catch {
    console.error(label, error)
  }
}

// YouTube設定自動生成エンドポイント
app.post('/api/generate-youtube-settings', async (c) => {
  try {
    const { character, video, music } = await c.req.json()
    
    const actionLabel: Record<string, string> = {
      singing: 'singing',
      dancing: 'dancing',
      talking: 'talking',
      playing: 'playing music',
      'behind-the-scenes': 'behind-the-scenes on set',
      art: 'art creation',
      sport: 'sports trick',
      cooking: 'cooking'
    }

    const safeAction = video.action || 'video'
    const rawTheme = video.theme || 'vibe'
    const rawGenre = music.genre || 'pop'
    const sanitizeAscii = (s: string) => /[^\x00-\x7F]/.test(s) ? 'vibe' : s
    const shortenTheme = (s: string) => {
      const parts = s.split(/[\n,\/]/).map(p => p.trim()).filter(Boolean)
      return (parts[0] || 'vibe').slice(0, 30)
    }
    const safeTheme = sanitizeAscii(shortenTheme(rawTheme))
    const safeGenre = sanitizeAscii(rawGenre)
    const instrumentText = (safeAction === 'playing' || safeAction === 'singing') && video.instrument
      ? ` with ${video.instrument}`
      : ''
    const lengthText = `${video.duration || 8}s`
    const formatText = video.aspectRatio === '9:16' ? 'YouTube Shorts (9:16)' : 'YouTube (16:9)'

    const title = `[AI] ${safeGenre} ${actionLabel[safeAction] || 'video'} | ${safeTheme}`

    const openers = [
      'Dive into this AI-crafted short.',
      'Experience a fresh AI-generated clip.',
      'Here is a brand-new AI-powered short.'
    ]
    const closers = [
      'Enjoy the vibes and leave a comment!',
      'Hope you like it—subscribe for more AI shorts.',
      'Turn on captions and enjoy the ride.'
    ]
    const intro = openers[Math.floor(Math.random() * openers.length)]
    const outro = closers[Math.floor(Math.random() * closers.length)]

    const description = `${intro}\n\nTheme: ${safeTheme}\nGenre: ${safeGenre}${instrumentText ? `\nInstrument: ${instrumentText.trim()}` : ''}\nLength: ${lengthText}\nFormat: ${formatText}\n\n${outro}\n\n#AI #${safeGenre} #${safeTheme} #music #shorts #AIGenerated`;

    const tags = [
      'AI generated',
      'AI music',
      safeGenre,
      safeTheme,
      instrumentText ? instrumentText.replace('with ','') : null,
      video.aspectRatio === '9:16' ? 'Shorts' : 'YouTube',
      music.language === 'japanese' ? 'Japanese' : 'English'
    ].filter(Boolean).map(t => /[^\x00-\x7F]/.test(t as string) ? 'AI' : t)

    return c.json({
      success: true,
      youtube: {
        title,
        description,
        tags: tags.join(', ')
      }
    })
    
  } catch (error: any) {
    console.error('❌ YouTube settings error:', error)
    return c.json({
      success: false,
      error: error.message
    }, 500)
  }
})

// 動画生成APIエンドポイント
app.post('/api/generate', async (c) => {
  try {
    const config = await c.req.json()
    
    // プロンプト構築
    let prompt = ''
    if (config.character.mode === 'prompt' && config.character.prompt) {
      prompt += `character description: ${config.character.prompt}, `
    } else if (config.character.mode === 'upload' && config.character.imageUrl) {
      prompt += `character reference image: ${config.character.imageUrl}, `
    }

    const instrumentText = (config.video.action === 'playing' || config.video.action === 'singing') && config.video.instrument
      ? `with ${config.video.instrument} `
      : ''

    // テーマ/ムード候補から2-3個ランダムに選ぶ（重複排除）
    const poolText: string = config.video?.themePool || ''
    const pool = poolText.split(/[\n,、]/).map((t: string) => t.trim()).filter(Boolean)
    const baseTheme = (config.video.theme || 'vibe').trim()
    const uniq = Array.from(new Set([baseTheme, ...pool]))
    const shuffled = uniq.sort(() => Math.random() - 0.5)
    const moodCount = Math.min(3, Math.max(2, shuffled.length))
    const moodText = shuffled.slice(0, moodCount).join(', ')

    // アクションを明示的に指示（Sora が曖昧にしないよう強調）
    prompt += `action: ${config.video.action} ${instrumentText}, ${moodText} mood, ${config.music.genre} music style, ${config.music.language} language, `
    prompt += `length ${config.video.duration} seconds, aspect ratio ${config.video.aspectRatio}, `
    prompt += 'camera framing: medium shot (upper body), avoid extreme close-up, keep stable composition'
    // アクションに応じてリップシンク/演技指示を付与
    if (config.video.action === 'singing') {
      prompt += ', character is singing to camera, strict lip-sync to vocals, mouth shapes match audio, holds mic or instrument naturally'
    } else if (config.video.action === 'dancing') {
      prompt += ', character is dancing and singing with clear lip-sync to the vocals, choreography synced to music, expressive performance, mouth shapes must match the vocals'
    } else if (config.video.action === 'talking') {
      prompt += ', character is speaking to camera with clear lip-sync and expressive facial animation, mouth shapes synchronized to speech'
    } else if (config.video.action === 'playing') {
      prompt += ', focus on instrument performance and hand movement, optional light lip-sync if vocals present'
    } else {
      prompt += ', natural movement, no lip-sync required'
    }
    
    // ジョブIDを生成
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(7)}`
    
    console.log('📝 Creating job:', jobId, 'with prompt:', prompt)
    
    // Firestoreにジョブを保存
    await colJobs.doc(jobId).set({
      job_id: jobId,
      status: 'pending',
      prompt,
      config,
      created_at: nowMs()
    })
    
    console.log('✅ Job created:', jobId)
    
    // 即座にジョブIDを返す
    return c.json({
      success: true,
      jobId: jobId,
      message: 'Video generation started. Please poll /api/job/{jobId} for status.'
    })
    
  } catch (error: any) {
    console.error('❌ Job creation error:', error)
    return c.json({ success: false, error: error.message }, 500)
  }
})

// スケジュール保存 (Pages側でも保存できるように実装)
app.post('/api/save-schedule', async (c) => {
  try {
    const body = await c.req.json()
    const enabled = !!body.enabled
    const slot1Enabled = body.slot1Enabled === undefined ? true : !!body.slot1Enabled
    const time = body.time || '09:00'
    const time2 = body.time2 || '18:00'
    const slot2Enabled = !!body.slot2Enabled
    const privacy = body.privacy || 'public'

    await saveScheduleDoc({
      enabled,
      slot1_enabled: slot1Enabled,
      slot1_time: time,
      slot2_enabled: slot2Enabled,
      slot2_time: time2,
      slot3_enabled: false,
      slot3_time: null,
      slot4_enabled: false,
      slot4_time: null,
      privacy
    })

    return c.json({ success: true, message: 'スケジュールを保存しました', time, time2 })
  } catch (err: any) {
    console.error('❌ save-schedule error:', err)
    return c.json({ success: false, error: err.message }, 500)
  }
})

// スケジュール取得
app.get('/api/schedule', async (c) => {
  try {
    const row = await getScheduleDoc()
    return c.json({
      success: true,
      schedule: {
        enabled: !!row.enabled,
        slot1Enabled: !!row.slot1_enabled,
        slot2Enabled: !!row.slot2_enabled,
        time: row.slot1_time || '09:00',
        time2: row.slot2_time || '18:00',
        privacy: row.privacy || 'public'
      }
    })
  } catch (err: any) {
    console.error('❌ get-schedule error:', err)
    return c.json({ success: false, error: err.message }, 500)
  }
})

// ジョブステータス確認エンドポイント
app.get('/api/job/:jobId', async (c) => {
  try {
    const jobId = c.req.param('jobId')
    
    const result = await getJobById(jobId)
    if (!result) {
      return c.json({ success: false, error: 'Job not found' }, 404)
    }
    
    return c.json({
      success: true,
      job: {
        jobId: result.job_id,
        status: result.status,
        videoUrl: result.video_url,
        errorMessage: result.error_message,
        createdAt: result.created_at,
        completedAt: result.completed_at
      }
    })
    
  } catch (error: any) {
    console.error('❌ Job status check error:', error)
    return c.json({ success: false, error: error.message }, 500)
  }
})

const getCurrentTimeInTz = (tz?: string) => {
  const formatter = new Intl.DateTimeFormat('ja-JP', {
    timeZone: tz || 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
  const parts = formatter.formatToParts(new Date())
  const hour = parts.find(p => p.type === 'hour')?.value || '00'
  const minute = parts.find(p => p.type === 'minute')?.value || '00'
  return `${hour}:${minute}`
}

const getDateKeyInTz = (tz?: string) => {
  const formatter = new Intl.DateTimeFormat('ja-JP', {
    timeZone: tz || 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
  return formatter.format(new Date()).replace(/\//g, '-')
}

const timeToMinutes = (t: string | undefined | null) => {
  const [h, m] = (t || '00:00').split(':').map((v) => parseInt(v, 10))
  if (Number.isNaN(h) || Number.isNaN(m)) return 0
  return h * 60 + m
}

const pickRandom = <T,>(arr: T[] | undefined | null, fallback: T): T => {
  if (arr && arr.length > 0) {
    const idx = Math.floor(Math.random() * arr.length)
    return arr[idx] ?? fallback
  }
  return fallback
}

const buildConfigFromSettings = (settings: any, schedule: any, activeSlot: 'slot1' | 'slot2') => {
  const safe = settings || {}
  const baseSchedule = {
    enabled: !!schedule?.enabled,
    slot1Enabled: schedule?.slot1_enabled !== 0,
    slot2Enabled: !!schedule?.slot2_enabled,
    time: schedule?.slot1_time || '09:00',
    time2: schedule?.slot2_time || '18:00',
    privacy: schedule?.privacy || 'public',
    triggeredSlot: activeSlot
  }

  if (activeSlot === 'slot2' && schedule?.slot2_time) {
    baseSchedule.time = schedule.slot2_time
  }

  // 候補リストからのランダム選択（random が false の場合は固定値を使用）
  const useRandom = safe.random !== false
  const actionCandidates: string[] = Array.isArray(safe.actionCandidates) ? safe.actionCandidates.filter(Boolean) : []
  const instrumentCandidates: string[] = Array.isArray(safe.instrumentCandidates) ? safe.instrumentCandidates.filter(Boolean) : []
  const lengthCandidates: string[] = Array.isArray(safe.lengthCandidates) ? safe.lengthCandidates.filter(Boolean) : []
  const themeLines = (safe.themePool || '')
    .split(/[\n,、]/)
    .map((t: string) => t.trim())
    .filter(Boolean)

  const chosenAction = useRandom ? pickRandom(actionCandidates, safe.action || 'singing') : (safe.action || 'singing')
  const chosenInstrument =
    (chosenAction === 'playing' || chosenAction === 'singing')
      ? (useRandom ? pickRandom(instrumentCandidates, safe.instrument || '') : (safe.instrument || ''))
      : ''
  const chosenTheme = useRandom ? pickRandom(themeLines, safe.theme || 'vibe') : (safe.theme || 'vibe')
  const chosenLength = useRandom ? pickRandom(lengthCandidates, safe.duration || '8') : (safe.duration || '8')

  return {
    character: {
      mode: 'prompt',
      imageUrl: '',
      prompt: safe.characterPrompt || ''
    },
    video: {
      action: chosenAction,
      instrument: chosenInstrument,
      theme: chosenTheme,
      aspectRatio: safe.aspect || '9:16',
      duration: parseInt(String(chosenLength), 10) || 8,
      themePool: safe.themePool || ''
    },
    music: {
      genre: safe.genre || 'pop',
      language: safe.language || 'english',
      lyrics: safe.lyrics || ''
    },
    schedule: baseSchedule
  }
}

const buildLocalYoutubeMeta = (config: any) => {
  const actionText = config.video?.action || 'video'
  const instrumentText = (config.video?.action === 'playing' || config.video?.action === 'singing') && config.video?.instrument
    ? `with ${config.video.instrument}`
    : ''
  const rawTheme = config.video?.theme || 'vibe'
  const rawGenre = config.music?.genre || 'pop'
  const sanitizeAscii = (s: string) => /[^\x00-\x7F]/.test(s) ? 'vibe' : s
  const shortenTheme = (s: string) => {
    const parts = s.split(/[\n,\/]/).map(p => p.trim()).filter(Boolean)
    return (parts[0] || 'vibe').slice(0, 30)
  }
  const theme = sanitizeAscii(shortenTheme(rawTheme))
  const genre = sanitizeAscii(rawGenre)
  const lengthText = `${config.video?.duration || 8}s`
  const formatText = config.video?.aspectRatio === '9:16' ? 'YouTube Shorts (9:16)' : 'YouTube (16:9)'
  const title = `[AI] ${genre} ${actionText} | ${theme}`
  const description = `AI-generated short.\n\nTheme: ${theme}\nGenre: ${genre}\n${instrumentText ? `Instrument: ${instrumentText}\n` : ''}Length: ${lengthText}\nFormat: ${formatText}\n\n#AI #${genre} #${theme} #music #shorts #AIGenerated`
  const tags = [
    'AI generated',
    'AI music',
    genre,
    theme,
    instrumentText ? instrumentText.replace('with ', '') : null,
    config.video?.aspectRatio === '9:16' ? 'Shorts' : 'YouTube',
    config.music?.language === 'japanese' ? 'Japanese' : 'English'
  ].filter(Boolean).map((t: string) => /[^\x00-\x7F]/.test(t) ? 'AI' : t).join(', ')
  return { title, description, tags }
}

// 外部Cron等から呼び出すスケジュール実行エンドポイント
app.get('/api/cron/run-schedule', async (c) => {
  try {
    // Firestore 接続テスト（軽い読み取り）
    try {
      const ping = await colSettings.limit(1).get()
      console.log('✅ Firestore ping ok. settings docs:', ping.size)
    } catch (fireErr: any) {
      logError('❌ Firestore ping failed', fireErr)
      return c.json({ success: false, error: fireErr.message || 'Firestore ping failed' }, 500)
    }

    const timezone = c.env.TIMEZONE || 'Asia/Tokyo'

    const scheduleRow = await getScheduleDoc()

    if (!scheduleRow || !scheduleRow.enabled) {
      return c.json({ success: true, message: 'Scheduler disabled' })
    }

    const currentTime = getCurrentTimeInTz(timezone)
    const dateKey = getDateKeyInTz(timezone)
    const currentMinutes = timeToMinutes(currentTime)
    const dueSlots: Array<'slot1' | 'slot2'> = []

    if (scheduleRow.slot1_enabled && currentMinutes >= timeToMinutes(scheduleRow.slot1_time)) {
      dueSlots.push('slot1')
    }
    if (scheduleRow.slot2_enabled && currentMinutes >= timeToMinutes(scheduleRow.slot2_time)) {
      dueSlots.push('slot2')
    }

    if (dueSlots.length === 0) {
      return c.json({
        success: true,
        message: `No slots due at ${currentTime}`,
        debug: {
          currentTime,
          currentMinutes,
          slot1: { enabled: !!scheduleRow.slot1_enabled, time: scheduleRow.slot1_time, minutes: timeToMinutes(scheduleRow.slot1_time) },
          slot2: { enabled: !!scheduleRow.slot2_enabled, time: scheduleRow.slot2_time, minutes: timeToMinutes(scheduleRow.slot2_time) },
          dateKey
        }
      })
    }

    const savedSettings = (await getSettingsDoc()) || {}

    // Cloud Scheduler 経由で http にフォールバックしないよう常に https + Host を使用する
    const host = c.req.header('host')
    const baseUrl = host ? `https://${host}` : ''
    // CF Access ヘッダーを引き継いで内部fetchで302を防ぐ
    const accessHeaders: Record<string, string> = {}
    const cfId = c.req.header('cf-access-client-id')
    const cfSecret = c.req.header('cf-access-client-secret')
    if (cfId && cfSecret) {
      accessHeaders['CF-Access-Client-Id'] = cfId
      accessHeaders['CF-Access-Client-Secret'] = cfSecret
    }

    const results: any[] = []
    const toMs = (s: string | undefined | null) => {
      if (!s) return 0
      const t = Date.parse(s)
      if (!Number.isNaN(t)) return t
      const iso = s.includes('T') ? s : s.replace(' ', 'T')
      const withZ = iso.endsWith('Z') ? iso : `${iso}Z`
      const parsed = Date.parse(withZ)
      return Number.isNaN(parsed) ? 0 : parsed
    }
    const scheduleUpdatedAt = toMs(scheduleRow.updated_at)
    for (const slot of dueSlots) {
      // 重複実行防止
      const runDocId = `${slot}_${dateKey}`
      const existing = await colRuns.doc(runDocId).get()
      if (existing.exists) {
        const executedAt = toMs(existing.data()?.created_at as string)
        // スケジュール更新後なら再実行を許可し、古い記録を削除してから進む
        if (scheduleUpdatedAt <= executedAt) {
          results.push({ slot, skipped: true, reason: 'already executed' })
          continue
        } else {
          await colRuns.doc(runDocId).delete()
        }
      }

      const config = buildConfigFromSettings(savedSettings, scheduleRow, slot)

      // YouTube設定を生成（失敗時はローカル生成にフォールバック）
      let youtubeMeta = buildLocalYoutubeMeta(config)
      try {
        const ytRes = await fetch(`${baseUrl}/api/generate-youtube-settings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...accessHeaders },
          body: JSON.stringify(config)
        })
        if (ytRes.ok) {
          const ytJson = await ytRes.json()
          if (ytJson.success && ytJson.youtube) {
            youtubeMeta = ytJson.youtube
          }
        }
      } catch (err) {
        console.warn('generate-youtube-settings fallback:', (err as any)?.message || err)
      }
      config.youtube = youtubeMeta

      // 動画生成をトリガー（既存の /api/generate を呼び出す）
      try {
        const genRes = await fetch(`${baseUrl}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...accessHeaders },
          body: JSON.stringify(config)
        })
        const genJson = await genRes.json()
        if (!genRes.ok || !genJson.success) {
          throw new Error(genJson.error || 'generate failed')
        }
        // 実行記録
        await colRuns.doc(runDocId).set({
          slot,
          run_date: dateKey,
          created_at: new Date().toISOString()
        })
        results.push({ slot, jobId: genJson.jobId })
      } catch (err: any) {
        results.push({ slot, error: err.message })
      }
    }

    return c.json({ success: true, now: currentTime, date: dateKey, results })
  } catch (error: any) {
    logError('❌ run-schedule error', error)
    return c.json({ success: false, error: error.message }, 500)
  }
})

// スケジュール実行履歴と最新ジョブを確認するデバッグ用エンドポイント
app.get('/api/debug/schedule-runs', async (c) => {
  try {
    const runsSnap = await colRuns.orderBy('created_at', 'desc').limit(20).get()
    const runs = runsSnap.docs.map((d) => d.data())
    const latestSchedule = await getScheduleDoc()
    const jobsSnap = await colJobs.orderBy('created_at', 'desc').limit(20).get()
    const jobs = jobsSnap.docs.map((d) => d.data())

    return c.json({
      success: true,
      schedule: latestSchedule || null,
      runs: runs || [],
      jobs: jobs || []
    })
  } catch (err: any) {
    console.error('❌ debug schedule runs error:', err)
    return c.json({ success: false, error: err.message }, 500)
  }
})

const getSoraSize = (aspect: string | undefined) => {
  if (aspect === '16:9') return '1280x720'
  return '720x1280' // default 9:16
}

const getSoraSeconds = (duration: any) => {
  const allowed = ['4', '8', '12']
  const candidate = String(duration || '').trim()
  if (allowed.includes(candidate)) return candidate
  // 旧UIの値(5/10秒)を近い値に丸める
  if (candidate === '5') return '4'
  if (candidate === '10') return '12'
  return '4'
}

// Cron Trigger: 1分ごとにpendingジョブを処理
app.get('/api/cron/process-jobs', async (c) => {
  try {
    const { OPENAI_API_KEY } = c.env
    
    if (!OPENAI_API_KEY) {
      return c.json({ success: false, error: 'OPENAI_API_KEY not configured' }, 500)
    }
    
    // pendingジョブを取得（最大5件）
    const pendingSnap = await colJobs.where('status', '==', 'pending').orderBy('created_at').limit(5).get()
    const jobs = pendingSnap.docs.map((d) => d.data() as JobDoc)
    
    if (!jobs || jobs.length === 0) {
      return c.json({ success: true, message: 'No pending jobs' })
    }
    
    console.log(`🔄 Processing ${jobs.length} pending jobs`)
    
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY })
    
    for (const job of jobs) {
      try {
        // ステータスを processing に更新
        await colJobs.doc(job.job_id).update({
          status: 'processing',
          started_at: nowMs()
        })
        
        console.log(`🎬 Starting video generation for job: ${job.job_id}`)
        
        const config = job.config || {}
        const size = getSoraSize(config.video?.aspectRatio)
        const seconds = getSoraSeconds(config.video?.duration)
        // 動画生成開始 (Sora 2)
        const video = await openai.videos.create({
          model: 'sora-2',
          prompt: job.prompt,
          size,
          seconds
        })
        
        // video.idを保存（次回のCronで完了確認）
        await colJobs.doc(job.job_id).update({
          config: { ...config, videoId: video.id, size }
        })
        
        console.log(`✅ Video generation started for job: ${job.job_id}, video: ${video.id}`)
        
      } catch (error: any) {
        console.error(`❌ Failed to start job ${job.job_id}:`, error.message)
        await colJobs.doc(job.job_id).update({
          status: 'failed',
          error_message: error.message,
          completed_at: nowMs()
        })
      }
    }
    
    return c.json({ success: true, processed: jobs.length })
    
  } catch (error: any) {
    console.error('❌ Cron processing error:', error)
    return c.json({ success: false, error: error.message }, 500)
  }
})

// Cron Trigger: processingジョブの完了確認 + YouTubeアップロードのリトライ
app.get('/api/cron/check-jobs', async (c) => {
  try {
    const { OPENAI_API_KEY } = c.env
    
    if (!OPENAI_API_KEY) {
      return c.json({ success: false, error: 'OPENAI_API_KEY not configured' }, 500)
    }
    
    const procSnap = await colJobs.where('status', '==', 'processing').orderBy('started_at').limit(10).get()
    const processingJobs = procSnap.docs.map((d) => d.data() as JobDoc)
    if (processingJobs.length === 0) {
      console.log('🔍 No processing jobs; running upload retries only')
    } else {
      console.log(`🔍 Checking ${processingJobs.length} processing jobs`)
    }
    
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY })
    const accessHeadersRetry: Record<string, string> = {}
    const cfIdRetry = c.req.header('cf-access-client-id')
    const cfSecretRetry = c.req.header('cf-access-client-secret')
    if (cfIdRetry && cfSecretRetry) {
      accessHeadersRetry['CF-Access-Client-Id'] = cfIdRetry
      accessHeadersRetry['CF-Access-Client-Secret'] = cfSecretRetry
    }
    
    for (const job of processingJobs) {
      try {
        const config = job.config || {}
        
        if (!config.videoId) {
          console.log(`⚠️ No video id for job: ${job.job_id}`)
          continue
        }
        
        const pollingVideo = await openai.videos.retrieve(config.videoId)
        
        if (pollingVideo.status === 'completed') {
          console.log(`✅ Job ${job.job_id} completed`)
          
          const host = c.req.header('host')
          const videoUrl = host ? `https://${host}/api/video/${config.videoId}/content` : `/api/video/${config.videoId}/content`
          
          await colJobs.doc(job.job_id).update({
            status: 'completed',
            video_url: videoUrl,
            completed_at: nowMs()
          })
          
          console.log(`🎥 Video URL saved for job: ${job.job_id}`)

          if (!config.youtube) {
            try {
              config.youtube = buildLocalYoutubeMeta(config)
            } catch (_) {
              // fallback silently
            }
          }
          const shouldUpload = config.schedule?.enabled && config.youtube && !config.youtubeUploaded
          if (shouldUpload) {
            try {
              const accessHeaders: Record<string, string> = {}
              const cfId = c.req.header('cf-access-client-id')
              const cfSecret = c.req.header('cf-access-client-secret')
              if (cfId && cfSecret) {
                accessHeaders['CF-Access-Client-Id'] = cfId
                accessHeaders['CF-Access-Client-Secret'] = cfSecret
              }
              const baseUrl = host ? `https://${host}` : ''
              const ytRes = await fetch(`${baseUrl}/api/youtube-upload`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...accessHeaders },
                body: JSON.stringify({
                  videoUrl,
                  youtube: config.youtube,
                  privacy: config.schedule?.privacy || 'public'
                })
              })
              const ytJson = await ytRes.json()
              if (ytJson.success) {
                console.log(`📺 YouTube upload success for job ${job.job_id}: ${ytJson.videoId}`)
                await colJobs.doc(job.job_id).update({
                  config: { ...config, youtubeUploaded: true, youtubeVideoId: ytJson.videoId }
                })
              } else {
                console.warn(`⚠️ YouTube upload failed for job ${job.job_id}: ${ytJson.error || 'unknown'}`)
              }
            } catch (uploadErr: any) {
              console.error(`❌ YouTube upload exception for job ${job.job_id}:`, uploadErr.message)
            }
          }
        } else if (pollingVideo.status === 'failed') {
          throw new Error(pollingVideo.error?.message || 'Video generation failed')
        } else {
          console.log(`⏳ Job ${job.job_id} still processing...`)
        }
        
      } catch (error: any) {
        console.error(`❌ Failed to check job ${job.job_id}:`, error.message)
        await colJobs.doc(job.job_id).update({
          status: 'failed',
          error_message: error.message,
          completed_at: nowMs()
        })
      }
    }

    const retrySnap = await colJobs.where('status', '==', 'completed').orderBy('completed_at', 'desc').limit(20).get()
    const retryUploads = retrySnap.docs
      .map((d) => d.data() as JobDoc)
      .filter((job) => {
        const cfg = job.config || {}
        return cfg?.schedule?.enabled && cfg?.youtube && !cfg?.youtubeUploaded
      })
      .slice(0, 5)

    const accessHeaders: Record<string, string> = {}
    const cfId = c.req.header('cf-access-client-id')
    const cfSecret = c.req.header('cf-access-client-secret')
    if (cfId && cfSecret) {
      accessHeaders['CF-Access-Client-Id'] = cfId
      accessHeaders['CF-Access-Client-Secret'] = cfSecret
    }

    const host = c.req.header('host')
    const baseUrl = host ? `https://${host}` : ''
    for (const job of retryUploads || []) {
      try {
        const config = job.config || {}
        const videoUrl = job.video_url || (host ? `https://${host}/api/video/${config.videoId}/content` : '')
        if (!videoUrl) continue

        const ytRes = await fetch(`${baseUrl}/api/youtube-upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...accessHeadersRetry },
          body: JSON.stringify({
            videoUrl,
            youtube: config.youtube,
            privacy: config.schedule?.privacy || 'public'
          })
        })
        const ytJson = await ytRes.json()
        if (ytJson.success) {
          console.log(`📺 YouTube upload retry success for job ${job.job_id}: ${ytJson.videoId}`)
          await colJobs.doc(job.job_id).update({
            config: { ...config, youtubeUploaded: true, youtubeVideoId: ytJson.videoId }
          })
        } else {
          console.warn(`⚠️ YouTube upload retry failed for job ${job.job_id}: ${ytJson.error || 'unknown'}`)
          await colJobs.doc(job.job_id).update({
            config: { ...config, youtubeUploadError: ytJson.error || 'unknown' }
          })
        }
      } catch (uploadErr: any) {
        console.error(`❌ YouTube upload retry exception for job ${job.job_id}:`, uploadErr.message)
      }
    }
    
    return c.json({ success: true, checked: processingJobs.length, retried: retryUploads?.length || 0 })
    
  } catch (error: any) {
    console.error('❌ Cron checking error:', error)
    return c.json({ success: false, error: error.message }, 500)
  }
})

// YouTubeアップロード（Resumable）
app.post('/api/youtube-upload', async (c) => {
  try {
    const { videoUrl, youtube, privacy } = await c.req.json()
    const { YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN, OPENAI_API_KEY } = c.env

    if (!YOUTUBE_CLIENT_ID || !YOUTUBE_CLIENT_SECRET || !YOUTUBE_REFRESH_TOKEN) {
      return c.json({ success: false, error: 'YouTube credentials not configured' }, 500)
    }

    // アクセストークン取得
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: YOUTUBE_CLIENT_ID,
        client_secret: YOUTUBE_CLIENT_SECRET,
        refresh_token: YOUTUBE_REFRESH_TOKEN,
        grant_type: 'refresh_token'
      })
    })
    if (!tokenRes.ok) {
      throw new Error(`Failed to refresh token: ${tokenRes.status}`)
    }
    const tokenJson = await tokenRes.json()
    const accessToken = tokenJson.access_token

    // 動画データ取得（相対パスならホストを付与）
    const host = c.req.header('host')
    const absoluteVideoUrl = videoUrl?.startsWith('http') ? videoUrl : `https://${host}${videoUrl}`
    // If videoUrl is our proxy (/api/video/{id}/content), fetch directly from OpenAI to avoid Access gate
    let videoArrayBuffer: ArrayBuffer
    let ct = 'video/mp4'
    const proxyMatch = absoluteVideoUrl.match(/\/api\/video\/(.+?)\/content/)
    if (proxyMatch) {
      if (!OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY not set for direct video fetch')
      }
      const vid = proxyMatch[1]
      const openAiUrl = `https://api.openai.com/v1/videos/${vid}/content`
      const videoResp = await fetch(openAiUrl, {
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}` }
      })
      if (!videoResp.ok) throw new Error(`Failed to fetch video from OpenAI: ${videoResp.status}`)
      ct = videoResp.headers.get('content-type') || 'video/mp4'
      videoArrayBuffer = await videoResp.arrayBuffer()
    } else {
      const videoResp = await fetch(absoluteVideoUrl)
      if (!videoResp.ok) {
        throw new Error(`Failed to fetch video: ${videoResp.status}`)
      }
      ct = videoResp.headers.get('content-type') || ''
      if (!ct.includes('video')) {
        const snippet = await videoResp.text()
        throw new Error(`Unexpected content-type: ${ct}. Status: ${videoResp.status}. Snippet: ${snippet.substring(0,200)}`)
      }
      videoArrayBuffer = await videoResp.arrayBuffer()
      ct = ct || 'video/mp4'
    }

    const fallbackYoutube = {
      title: 'Test Upload from API',
      description: 'AI generated short video.',
      tags: ''
    }
    const incoming = youtube || {}
    // YouTubeメタデータのセーフガード（空文字を防ぐ）
    const safeTitle = (incoming.title || '').trim() || fallbackYoutube.title
    const safeDescription = (incoming.description || '').trim() || fallbackYoutube.description
    const safeTags = incoming.tags
      ? incoming.tags.split(',').map((t: string) => t.trim()).filter(Boolean)
      : []
    const cleanTags = safeTags.filter(Boolean)
    // YouTube制限: タイトル最大100文字程度、タグ合計も500文字程度なので強制短縮
    const sanitizeStr = (s: string, max: number) => s.length > max ? s.substring(0, max) : s
    const sanitizedTitle = sanitizeStr(safeTitle, 60)
    const sanitizedDescription = sanitizeStr(safeDescription, 4000)
    const sanitizedTags = cleanTags.slice(0, 8).map((t: string) => sanitizeStr(t, 30))

    // Resumable upload開始
    const metadataBody: Record<string, any> = {
      snippet: {
        title: sanitizedTitle,
        description: sanitizedDescription,
        categoryId: '24' // Entertainment
      },
      status: {
        privacyStatus: privacy || 'unlisted'
      }
    }
    if (sanitizedTags.length > 0) {
      metadataBody.snippet.tags = sanitizedTags
    }

    console.log('📤 YouTube metadata payload', JSON.stringify(metadataBody))

    const contentType = 'video/mp4'
    // Step 1: initiate resumable upload session
    const startRes = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': contentType,
        'X-Upload-Content-Length': String(videoArrayBuffer.byteLength)
      },
      body: JSON.stringify(metadataBody)
    })
    if (!startRes.ok) {
      const text = await startRes.text()
      throw new Error(`Failed to start upload: ${startRes.status} ${text.substring(0,200)}`)
    }
    const uploadUrl = startRes.headers.get('location')
    if (!uploadUrl) {
      throw new Error('Upload URL not provided')
    }

    // Step 2: upload media
    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': contentType,
        'Content-Length': String(videoArrayBuffer.byteLength)
      },
      body: Buffer.from(videoArrayBuffer)
    })
    if (!uploadRes.ok) {
      const errText = await uploadRes.text()
      throw new Error(`Upload failed: ${uploadRes.status} ${errText}`)
    }
    const uploadJson = await uploadRes.json()
    const videoId = uploadJson.id

    // プレイリスト追加・カテゴリ指定は一旦無効化（検証用）

    return c.json({ success: true, videoId })

  } catch (error: any) {
    console.error('❌ YouTube upload error:', error)
    return c.json({ success: false, error: error.message }, 500)
  }
})

// 設定保存/取得（FirestoreにJSONで保存）
app.post('/api/settings', async (c) => {
  try {
    const body = await c.req.json()

    await saveSettingsDoc(body)

    return c.json({ success: true })
  } catch (err: any) {
    console.error('❌ save settings error:', err)
    return c.json({ success: false, error: err.message }, 500)
  }
})

app.get('/api/settings', async (c) => {
  try {
    const settings = await getSettingsDoc()
    if (!settings) {
      return c.json({ success: true, settings: null })
    }
    return c.json({ success: true, settings })
  } catch (err: any) {
    console.error('❌ get settings error:', err)
    return c.json({ success: false, error: err.message }, 500)
  }
})

// Sora動画のプロキシ配信
app.get('/api/video/:videoId/content', async (c) => {
  const { OPENAI_API_KEY } = c.env
  const videoId = c.req.param('videoId')

  if (!OPENAI_API_KEY) {
    return c.json({ success: false, error: 'OPENAI_API_KEY not configured' }, 500)
  }

  try {
    const videoResp = await fetch(`https://api.openai.com/v1/videos/${videoId}/content`, {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`
      }
    })

    if (!videoResp.ok || !videoResp.body) {
      throw new Error(`Failed to fetch video content: ${videoResp.status} ${videoResp.statusText}`)
    }

    // ストリーミングで返す
    return new Response(videoResp.body, {
      status: 200,
      headers: {
        'Content-Type': videoResp.headers.get('content-type') || 'video/mp4'
      }
    })
  } catch (error: any) {
    console.error('❌ Video proxy error:', error)
    return c.json({ success: false, error: error.message }, 500)
  }
})

// OAuth2 callback to obtain YouTube refresh token (one-time use)
app.get('/oauth2callback', async (c) => {
  const code = c.req.query('code')
  const { YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET } = c.env

  if (!code) {
    return c.html('<p>Missing ?code in query.</p>')
  }
  if (!YOUTUBE_CLIENT_ID || !YOUTUBE_CLIENT_SECRET) {
    return c.html('<p>YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET not set.</p>')
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: YOUTUBE_CLIENT_ID,
        client_secret: YOUTUBE_CLIENT_SECRET,
        redirect_uri: `${c.req.url.split('?')[0]}`,
        grant_type: 'authorization_code'
      })
    })

    if (!tokenRes.ok) {
      const text = await tokenRes.text()
      throw new Error(`Token exchange failed: ${tokenRes.status} ${text}`)
    }

    const tokens = await tokenRes.json()
    const refreshToken = tokens.refresh_token
    const accessToken = tokens.access_token
    const expiresIn = tokens.expires_in

    return c.html(`
      <h2>YouTube OAuth Success</h2>
      <p><strong>Refresh Token (save to Cloudflare Pages Secret):</strong></p>
      <pre style="background:#f5f5f5;padding:8px;">${refreshToken || '(not returned)'}</pre>
      <p>Access Token (temporary):</p>
      <pre style="background:#f5f5f5;padding:8px;">${accessToken}</pre>
      <p>expires_in: ${expiresIn}</p>
      <p>Next: set <code>YOUTUBE_REFRESH_TOKEN</code> with wrangler pages secret put, then remove this callback if不要.</p>
    `)
  } catch (err: any) {
    return c.html(`<p>OAuth error: ${err.message}</p>`)
  }
})

// 簡易デバッグ: 直近のジョブ5件を返す（YouTube情報付き）
app.get('/api/debug/jobs', async (c) => {
  try {
    const snap = await colJobs.orderBy('created_at', 'desc').limit(5).get()
    const jobs = snap.docs.map((d) => {
      const data = d.data() as JobDoc
      const cfg = (data.config || {}) as any
      return {
        job_id: data.job_id,
        status: data.status,
        error_message: data.error_message,
        video_url: data.video_url,
        created_at: data.created_at,
        completed_at: data.completed_at,
        youtube_title: cfg?.youtube?.title,
        youtube_uploaded: cfg?.youtubeUploaded,
        youtube_video_id: cfg?.youtubeVideoId
      }
    })
    return c.json({ success: true, jobs })
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500)
  }
})

app.get('/', (c) => {
  return c.render(
    <div class="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50">
      {/* ヘッダー */}
      <header class="bg-white shadow-sm border-b border-gray-200">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-3">
              <i class="fas fa-video text-3xl text-purple-600"></i>
              <div>
                <h1 class="text-3xl font-bold text-gray-900">
                  AI動画自動投稿システム
                </h1>
                <p class="text-sm text-orange-600 font-semibold mt-1">
                  <i class="fas fa-flask mr-1"></i>
                  ver 1.1.12
                </p>
              </div>
            </div>
            <div class="flex items-center space-x-4">
              <a href="https://www.youtube.com/@4directionsApproachRecords" target="_blank" rel="noopener noreferrer" class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition">
                <i class="fab fa-youtube mr-2"></i>
                チャンネルを見る
              </a>
            </div>
          </div>
        </div>
      </header>

      {/* メインコンテンツ */}
      <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
          
          {/* 左カラム: 設定フォーム */}
          <div class="lg:col-span-2 space-y-6">
            
            {/* キャラクター設定カード */}
            <div class="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
              <div class="flex items-center mb-6">
                <i class="fas fa-user-circle text-2xl text-purple-600 mr-3"></i>
                <h2 class="text-2xl font-bold text-gray-900">キャラクター設定</h2>
              </div>
              <div class="space-y-4">
                <div class="bg-purple-50 border border-purple-200 rounded-lg p-3 text-sm text-purple-800">
                  Sora APIは画像リファレンス非対応のため、プロンプトのみで指定します。
                </div>
                <div>
                  <label class="block text-sm font-semibold text-gray-700 mb-2">
                    キャラクタープロンプト
                  </label>
                  <textarea 
                    id="characterPrompt"
                    rows="4"
                    placeholder="例: 白髪ボブの女性、シンプルな黒トップス、落ち着いた雰囲気"
                    class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  ></textarea>
                </div>
              </div>
            </div>

            {/* 動画内容設定カード */}
            <div class="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
              <div class="flex items-center mb-6">
                <i class="fas fa-film text-2xl text-blue-600 mr-3"></i>
                <h2 class="text-2xl font-bold text-gray-900">動画内容設定</h2>
              </div>

              {/* ランダム候補設定（常時表示） */}
              <div id="randomSettings" class="space-y-4 mb-6">
                <div>
                  <label class="block text-sm font-semibold text-gray-700 mb-2">アクション候補</label>
                  <div class="grid grid-cols-2 gap-2 text-sm" id="actionCandidates">
                    <label class="flex items-center space-x-2"><input type="checkbox" value="singing" checked class="action-candidate" /> <span>歌う（アップテンポ）</span></label>
                    <label class="flex items-center space-x-2"><input type="checkbox" value="dancing" checked class="action-candidate" /> <span>踊る（トレンドダンス）</span></label>
                    <label class="flex items-center space-x-2"><input type="checkbox" value="playing" checked class="action-candidate" /> <span>楽器演奏</span></label>
                    <label class="flex items-center space-x-2"><input type="checkbox" value="talking" checked class="action-candidate" /> <span>リアクション/トーク</span></label>
                    <label class="flex items-center space-x-2"><input type="checkbox" value="behind-the-scenes" class="action-candidate" /> <span>behind-the-scenes on set</span></label>
                    <label class="flex items-center space-x-2"><input type="checkbox" value="art" class="action-candidate" /> <span>アート制作</span></label>
                    <label class="flex items-center space-x-2"><input type="checkbox" value="sport" class="action-candidate" /> <span>スポーツトリック</span></label>
                    <label class="flex items-center space-x-2"><input type="checkbox" value="cooking" class="action-candidate" /> <span>料理ショート</span></label>
                  </div>
                </div>

                <div>
                  <label class="block text-sm font-semibold text-gray-700 mb-2">楽器候補（演奏/歌う時に使用）</label>
                  <div class="grid grid-cols-2 gap-2 text-sm" id="instrumentCandidates">
                    <label class="flex items-center space-x-2"><input type="checkbox" value="acoustic-guitar" checked class="instrument-candidate" /> <span>アコ/エレキギター</span></label>
                    <label class="flex items-center space-x-2"><input type="checkbox" value="piano" checked class="instrument-candidate" /> <span>ピアノ</span></label>
                    <label class="flex items-center space-x-2"><input type="checkbox" value="drum" class="instrument-candidate" /> <span>ドラム</span></label>
                    <label class="flex items-center space-x-2"><input type="checkbox" value="violin" class="instrument-candidate" /> <span>バイオリン</span></label>
                    <label class="flex items-center space-x-2"><input type="checkbox" value="flute" class="instrument-candidate" /> <span>フルート</span></label>
                    <label class="flex items-center space-x-2"><input type="checkbox" value="synth" class="instrument-candidate" /> <span>シンセ</span></label>
                    <label class="flex items-center space-x-2"><input type="checkbox" value="ukulele" class="instrument-candidate" /> <span>ウクレレ</span></label>
                  </div>
                </div>

                <div>
                  <label class="block text-sm font-semibold text-gray-700 mb-2">テーマ/ムード候補（改行区切り）</label>
                  <textarea id="themePool" rows="3" class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="元気\n夜景シネマ\n感動バラード\nトレンドダンス"></textarea>
                </div>

              <div>
                <label class="block text-sm font-semibold text-gray-700 mb-2">長さ候補</label>
                <div class="flex flex-wrap gap-3 text-sm" id="lengthCandidates">
                  <label class="flex items-center space-x-2"><input type="checkbox" value="4" class="length-candidate" /> <span>4秒</span></label>
                  <label class="flex items-center space-x-2"><input type="checkbox" value="8" class="length-candidate" checked /> <span>8秒</span></label>
                  <label class="flex items-center space-x-2"><input type="checkbox" value="12" class="length-candidate" /> <span>12秒</span></label>
                </div>
              </div>
            </div>

              {/* ランダム運用のため、個別入力UIは非表示にして内部だけ維持 */}
              <div class="hidden" id="manualVideoSettings" style="display:none !important" aria-hidden="true">
                {/* アクション選択（内部値保持用） */}
                <div>
                  <select id="action" class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                    <option value="singing" selected>歌っている</option>
                    <option value="dancing">踊っている</option>
                    <option value="talking">喋っている</option>
                    <option value="playing">楽器演奏</option>
                    <option value="behind-the-scenes">behind-the-scenes on set</option>
                    <option value="art">アート制作</option>
                    <option value="sport">スポーツトリック</option>
                    <option value="cooking">料理ショート</option>
                  </select>
                </div>

                {/* 楽器選択（内部値保持用） */}
                <div id="instrumentSection">
                  <select id="instrument" class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                    <option value="acoustic-guitar" selected>アコースティックギター</option>
                    <option value="piano">ピアノ</option>
                    <option value="drum">ドラム/ハンドドラム</option>
                    <option value="flute">フルート</option>
                    <option value="electric-guitar">エレキギター</option>
                    <option value="violin">バイオリン</option>
                    <option value="ukulele">ウクレレ</option>
                  </select>
                </div>

                {/* テーマ/ムード（内部値保持用） */}
                <div>
                  <input 
                    type="text" 
                    id="theme"
                    placeholder="例: 勇気、希望、愛、楽しい、元気..."
                    class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* アスペクト比（内部値保持用） */}
                <div>
                  <div class="flex space-x-4">
                    <label class="flex items-center">
                      <input type="radio" name="aspect" value="9:16" checked class="mr-2" />
                      <span class="text-sm">9:16 (ショート)</span>
                    </label>
                    <label class="flex items-center">
                      <input type="radio" name="aspect" value="16:9" class="mr-2" />
                      <span class="text-sm">16:9 (通常)</span>
                    </label>
                  </div>
                </div>

                {/* 動画の長さ（内部値保持用） */}
                <div>
                  <select id="duration" class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                    <option value="4">4秒</option>
                    <option value="8" selected>8秒</option>
                    <option value="12">12秒</option>
                  </select>
                </div>
              </div>

              {/* 動画内容設定の保存ボタン（候補保存用） */}
              <div class="flex justify-end pt-2">
                <button id="saveContentBtn" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm">
                  <i class="fas fa-save mr-2"></i>動画内容設定を保存
                </button>
              </div>
            </div>

            {/* 音楽設定カード */}
            <div class="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
              <div class="flex items-center mb-6">
                <i class="fas fa-music text-2xl text-green-600 mr-3"></i>
                <h2 class="text-2xl font-bold text-gray-900">音楽設定</h2>
              </div>

              <div class="space-y-4">
                {/* ジャンル */}
                <div>
                  <label class="block text-sm font-semibold text-gray-700 mb-2">
                    ジャンル
                  </label>
                  <select id="genre" class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent">
                    <option value="pop">ポップ</option>
                    <option value="ballad">バラード</option>
                    <option value="rock">ロック</option>
                    <option value="folk">フォーク</option>
                    <option value="jazz">ジャズ</option>
                    <option value="acoustic">アコースティック</option>
                  </select>
                </div>

                {/* 言語 */}
                <div>
                  <label class="block text-sm font-semibold text-gray-700 mb-2">
                    言語
                  </label>
                  <div class="flex space-x-4">
                    <label class="flex items-center">
                      <input type="radio" name="language" value="english" checked class="mr-2" />
                      <span class="text-sm">英語</span>
                    </label>
                    <label class="flex items-center">
                      <input type="radio" name="language" value="japanese" class="mr-2" />
                      <span class="text-sm">日本語</span>
                    </label>
                  </div>
                </div>

                {/* 歌詞入力（非表示：オプション機能を停止） */}
                <div style="display:none" aria-hidden="true">
                  <textarea id="lyrics"></textarea>
                </div>
              </div>
            </div>

            {/* 投稿スケジューラカード */}
            <div class="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
              <div class="flex items-center justify-between mb-6">
                <div class="flex items-center">
                  <i class="fas fa-calendar-alt text-2xl text-orange-600 mr-3"></i>
                  <h2 class="text-2xl font-bold text-gray-900">投稿スケジューラ</h2>
                </div>
                <span class="text-sm text-gray-500">(常時有効)</span>
              </div>

              <div id="schedulerContent" style="display:block;">
                <div class="space-y-4">
                  {/* 投稿頻度 */}
                  <div class="bg-orange-50 border border-orange-200 rounded-lg p-4">
                    <div class="flex items-center mb-2">
                      <i class="fas fa-repeat text-orange-600 mr-2"></i>
                      <span class="text-sm font-semibold text-orange-900">毎日最大2本自動投稿</span>
                    </div>
                    <p class="text-xs text-orange-800">時間を2つまで設定できます</p>
                  </div>

                  {/* 投稿時間1 */}
                  <div class="border border-gray-200 rounded-lg p-4">
                    <label class="block text-sm font-semibold text-gray-700 mb-2 flex items-center justify-between">
                      <span>投稿時間1</span>
                      <label class="flex items-center text-xs">
                        <input type="checkbox" id="enableSlot1" class="mr-2" checked />
                        有効化
                      </label>
                    </label>
                    <input 
                      type="time" 
                      id="dailyPostTime"
                      value="09:00"
                      class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    />
                  </div>

                  {/* 投稿時間2 */}
                  <div class="border border-gray-200 rounded-lg p-4">
                    <label class="block text-sm font-semibold text-gray-700 mb-2 flex items-center justify-between">
                      <span>投稿時間2</span>
                      <label class="flex items-center text-xs">
                        <input type="checkbox" id="enableSlot2" class="mr-2" />
                        有効化
                      </label>
                    </label>
                    <input 
                      type="time" 
                      id="dailyPostTime2"
                      value="18:00"
                      class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    />
                  </div>

                  {/* 公開設定 */}
                  <div>
                    <label class="block text-sm font-semibold text-gray-700 mb-2">
                      公開設定
                    </label>
                    <select id="privacy" class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent">
                      <option value="public">公開</option>
                      <option value="unlisted">限定公開</option>
                      <option value="private">非公開</option>
                    </select>
                  </div>

                  {/* スケジュール保存ボタン */}
                  <button 
                    id="saveScheduleBtn"
                    class="w-full bg-orange-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-orange-700 transition"
                  >
                    <i class="fas fa-calendar-check mr-2"></i>
                    スケジュールを保存
                  </button>
                </div>
              </div>

              {/* スケジューラ無効時のメッセージ */}
              <div id="schedulerDisabled" class="hidden"></div>

              {/* AI自動生成設定の説明 */}
              <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
                <div class="flex items-start">
                  <i class="fas fa-info-circle text-blue-600 mr-2 mt-1"></i>
                  <div class="text-sm text-blue-800">
                    <p class="font-semibold mb-1">YouTube投稿情報は自動生成されます</p>
                    <p class="text-xs">タイトル、説明文、タグは、キャラクター設定と動画内容に基づいてAIが最適化します。</p>
                  </div>
                </div>
              </div>
            </div>

            {/* 生成ボタン */}
            <div>
              <button 
                id="generateBtn"
                class="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white px-8 py-4 rounded-xl font-bold text-lg hover:from-purple-700 hover:to-blue-700 transition shadow-lg"
              >
                <i class="fas fa-magic mr-2"></i>
                <span id="generateBtnText">今すぐ動画を生成</span>
              </button>
              <p class="text-xs text-gray-500 text-center mt-2">
                スケジューラが有効な場合、設定された時間に自動投稿されます
              </p>
            </div>
          </div>

          {/* 中央カラム: プレビュー */}
          <div class="lg:col-span-1 space-y-6">
            
            {/* プレビューカード */}
            <div class="bg-white rounded-xl shadow-lg p-6 border border-gray-200 sticky top-8">
              <div class="flex items-center mb-4">
                <i class="fas fa-eye text-xl text-gray-600 mr-2"></i>
                <h3 class="text-lg font-bold text-gray-900">プレビュー</h3>
              </div>
              <div id="videoPreview" class="bg-gray-100 rounded-lg aspect-[9/16] flex items-center justify-center">
                <div class="text-center text-gray-400">
                  <i class="fas fa-video text-4xl mb-2"></i>
                  <p class="text-sm">動画生成後に表示</p>
                </div>
              </div>
              <div id="generationStatus" class="mt-4 hidden">
                <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div class="flex items-center">
                    <i class="fas fa-spinner fa-spin text-blue-600 mr-2"></i>
                    <span class="text-sm font-semibold text-blue-800">生成中...</span>
                  </div>
                  <div class="mt-2 bg-blue-200 rounded-full h-2">
                    <div class="bg-blue-600 h-2 rounded-full" style="width: 0%" id="progressBar"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* 右カラム: YouTube設定・履歴 */}
          <div class="lg:col-span-1 space-y-6">
            
            {/* AI生成YouTube設定プレビューカード */}
            <div class="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
              <div class="flex items-center mb-4">
                <i class="fab fa-youtube text-xl text-red-600 mr-2"></i>
                <h3 class="text-lg font-bold text-gray-900">YouTube設定</h3>
              </div>
              
              <div id="youtubeSettingsPreview" class="space-y-3">
                <div class="text-center text-gray-400 py-6">
                  <i class="fas fa-robot text-3xl mb-2"></i>
                  <p class="text-sm">AI自動生成</p>
                  <p class="text-xs mt-1">設定入力後に自動生成されます</p>
                </div>
              </div>

              <div class="mt-4 bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-700">
                <p class="font-semibold mb-1">Debug Info</p>
                <div class="space-y-1">
                  <div>Video URL: <span id="debugVideoUrl">-</span></div>
                  <div>Category: -</div>
                  <div>Playlist: - (disabled)</div>
                  <div>Privacy: <span id="debugPrivacy">-</span></div>
                  <div>YouTube Upload: <span id="debugYoutubeStatus">-</span></div>
                  <div>Settings Save: <span id="debugSettingsSave">-</span></div>
                  <div>Settings Load: <span id="debugSettingsLoad">-</span></div>
                  <div>Job Status: <span id="debugJobStatus">-</span></div>
                  <div>Job Error: <span id="debugJobError">-</span></div>
                  <div>Cron Process: <span id="debugCronProcess">-</span></div>
                  <div>Cron Check: <span id="debugCronCheck">-</span></div>
                </div>
                <div class="mt-3">
                  <p class="font-semibold mb-1">Recent Jobs (5)</p>
                  <div id="debugJobsList" class="space-y-1"></div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </main>

      {/* フッター */}
      <footer class="bg-white border-t border-gray-200 mt-12">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <p class="text-center text-gray-500 text-sm">
            © 2024 YouTube AI Video Auto-Upload System
          </p>
        </div>
      </footer>

      {/* JavaScript */}
      <script src="/static/app.js?v=1.1.12"></script>
    </div>
  )
})

// Note: All /api/* routes are proxied to backend server (port 3001)
// See proxy configuration at the top of this file

app.onError((err, c) => {
  logError('❌ unhandled error', err)
  return c.json({ success: false, error: 'internal_error' }, 500)
})

app.notFound((c) => c.text('Not Found', 404))

export default app
