import { jsxs, jsx } from "hono/jsx/jsx-runtime";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { jsxRenderer } from "hono/jsx-renderer";
import OpenAI from "openai";
import { Buffer } from "node:buffer";
import { Firestore } from "@google-cloud/firestore";
const renderer = jsxRenderer(({ children }) => {
  return /* @__PURE__ */ jsxs("html", { lang: "ja", children: [
    /* @__PURE__ */ jsxs("head", { children: [
      /* @__PURE__ */ jsx("meta", { charset: "UTF-8" }),
      /* @__PURE__ */ jsx("meta", { name: "viewport", content: "width=device-width, initial-scale=1.0" }),
      /* @__PURE__ */ jsx("title", { children: "YouTube AI動画自動投稿システム" }),
      /* @__PURE__ */ jsx("script", { src: "https://cdn.tailwindcss.com" }),
      /* @__PURE__ */ jsx("link", { href: "https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css", rel: "stylesheet" }),
      /* @__PURE__ */ jsx("link", { href: "/static/style.css?v=1.1.8", rel: "stylesheet" })
    ] }),
    /* @__PURE__ */ jsx("body", { class: "bg-gray-50", children })
  ] });
});
const resolveProjectId = () => process.env.FIRESTORE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || process.env.PROJECT_ID;
const firestoreProjectId = resolveProjectId() || "youtuber-480602";
console.log("Firestore init projectId:", firestoreProjectId);
const firestore = new Firestore({
  projectId: firestoreProjectId,
  preferRest: true
});
const colJobs = firestore.collection("jobs");
const colSchedules = firestore.collection("schedules");
const colSettings = firestore.collection("settings");
const colRuns = firestore.collection("schedule_runs");
const DEFAULT_SCHEDULE_ID = "default";
const DEFAULT_SETTINGS_ID = "default";
const nowMs = () => Date.now();
const getScheduleDefault = () => ({
  enabled: false,
  slot1_enabled: true,
  slot1_time: "09:00",
  slot2_enabled: false,
  slot2_time: "18:00",
  privacy: "public",
  updated_at: (/* @__PURE__ */ new Date()).toISOString()
});
const getScheduleDoc = async () => {
  const doc = await colSchedules.doc(DEFAULT_SCHEDULE_ID).get();
  if (!doc.exists) return getScheduleDefault();
  return doc.data() || getScheduleDefault();
};
const saveScheduleDoc = async (data) => {
  const payload = {
    ...getScheduleDefault(),
    ...data,
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  await colSchedules.doc(DEFAULT_SCHEDULE_ID).set(payload, { merge: true });
  return payload;
};
const getSettingsDoc = async () => {
  var _a;
  const doc = await colSettings.doc(DEFAULT_SETTINGS_ID).get();
  if (!doc.exists) return null;
  return ((_a = doc.data()) == null ? void 0 : _a.data) ? JSON.parse(doc.data().data) : doc.data();
};
const saveSettingsDoc = async (body) => {
  await colSettings.doc(DEFAULT_SETTINGS_ID).set({
    data: JSON.stringify(body),
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  });
};
const getJobById = async (jobId) => {
  const doc = await colJobs.doc(jobId).get();
  if (!doc.exists) return null;
  return doc.data();
};
const app = new Hono();
app.use("/api/*", cors());
app.use(renderer);
const logError = (label, error) => {
  try {
    console.error(label, {
      name: error == null ? void 0 : error.name,
      message: error == null ? void 0 : error.message,
      code: error == null ? void 0 : error.code,
      details: error == null ? void 0 : error.details,
      stack: error == null ? void 0 : error.stack
    });
  } catch {
    console.error(label, error);
  }
};
app.post("/api/generate-youtube-settings", async (c) => {
  try {
    const { character, video, music } = await c.req.json();
    const actionLabel = {
      singing: "singing",
      dancing: "dancing",
      talking: "talking",
      playing: "playing music",
      "behind-the-scenes": "behind-the-scenes on set",
      art: "art creation",
      sport: "sports trick",
      cooking: "cooking"
    };
    const safeAction = video.action || "video";
    const rawTheme = video.theme || "vibe";
    const rawGenre = music.genre || "pop";
    const sanitizeAscii = (s) => /[^\x00-\x7F]/.test(s) ? "vibe" : s;
    const shortenTheme = (s) => {
      const parts = s.split(/[\n,\/]/).map((p) => p.trim()).filter(Boolean);
      return (parts[0] || "vibe").slice(0, 30);
    };
    const safeTheme = sanitizeAscii(shortenTheme(rawTheme));
    const safeGenre = sanitizeAscii(rawGenre);
    const instrumentText = (safeAction === "playing" || safeAction === "singing") && video.instrument ? ` with ${video.instrument}` : "";
    const lengthText = `${video.duration || 8}s`;
    const formatText = video.aspectRatio === "9:16" ? "YouTube Shorts (9:16)" : "YouTube (16:9)";
    const title = `[AI] ${safeGenre} ${actionLabel[safeAction] || "video"} | ${safeTheme}`;
    const openers = [
      "Dive into this AI-crafted short.",
      "Experience a fresh AI-generated clip.",
      "Here is a brand-new AI-powered short."
    ];
    const closers = [
      "Enjoy the vibes and leave a comment!",
      "Hope you like it—subscribe for more AI shorts.",
      "Turn on captions and enjoy the ride."
    ];
    const intro = openers[Math.floor(Math.random() * openers.length)];
    const outro = closers[Math.floor(Math.random() * closers.length)];
    const description = `${intro}

Theme: ${safeTheme}
Genre: ${safeGenre}${instrumentText ? `
Instrument: ${instrumentText.trim()}` : ""}
Length: ${lengthText}
Format: ${formatText}

${outro}

#AI #${safeGenre} #${safeTheme} #music #shorts #AIGenerated`;
    const tags = [
      "AI generated",
      "AI music",
      safeGenre,
      safeTheme,
      instrumentText ? instrumentText.replace("with ", "") : null,
      video.aspectRatio === "9:16" ? "Shorts" : "YouTube",
      music.language === "japanese" ? "Japanese" : "English"
    ].filter(Boolean).map((t) => /[^\x00-\x7F]/.test(t) ? "AI" : t);
    return c.json({
      success: true,
      youtube: {
        title,
        description,
        tags: tags.join(", ")
      }
    });
  } catch (error) {
    console.error("❌ YouTube settings error:", error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});
app.post("/api/generate", async (c) => {
  var _a;
  try {
    const config = await c.req.json();
    let prompt = "";
    if (config.character.mode === "prompt" && config.character.prompt) {
      prompt += `character description: ${config.character.prompt}, `;
    } else if (config.character.mode === "upload" && config.character.imageUrl) {
      prompt += `character reference image: ${config.character.imageUrl}, `;
    }
    const instrumentText = (config.video.action === "playing" || config.video.action === "singing") && config.video.instrument ? `with ${config.video.instrument} ` : "";
    const poolText = ((_a = config.video) == null ? void 0 : _a.themePool) || "";
    const pool = poolText.split(/[\n,、]/).map((t) => t.trim()).filter(Boolean);
    const baseTheme = (config.video.theme || "vibe").trim();
    const uniq = Array.from(/* @__PURE__ */ new Set([baseTheme, ...pool]));
    const shuffled = uniq.sort(() => Math.random() - 0.5);
    const moodCount = Math.min(3, Math.max(2, shuffled.length));
    const moodText = shuffled.slice(0, moodCount).join(", ");
    prompt += `action: ${config.video.action} ${instrumentText}, ${moodText} mood, ${config.music.genre} music style, ${config.music.language} language, `;
    prompt += `length ${config.video.duration} seconds, aspect ratio ${config.video.aspectRatio}, `;
    prompt += "camera framing: medium shot (upper body), avoid extreme close-up, keep stable composition";
    if (config.video.action === "singing") {
      prompt += ", character is singing to camera, strict lip-sync to vocals, mouth shapes match audio, holds mic or instrument naturally";
    } else if (config.video.action === "dancing") {
      prompt += ", character is dancing and singing with clear lip-sync to the vocals, choreography synced to music, expressive performance, mouth shapes must match the vocals";
    } else if (config.video.action === "talking") {
      prompt += ", character is speaking to camera with clear lip-sync and expressive facial animation, mouth shapes synchronized to speech";
    } else if (config.video.action === "playing") {
      prompt += ", focus on instrument performance and hand movement, optional light lip-sync if vocals present";
    } else {
      prompt += ", natural movement, no lip-sync required";
    }
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    console.log("📝 Creating job:", jobId, "with prompt:", prompt);
    await colJobs.doc(jobId).set({
      job_id: jobId,
      status: "pending",
      prompt,
      config,
      created_at: nowMs()
    });
    console.log("✅ Job created:", jobId);
    return c.json({
      success: true,
      jobId,
      message: "Video generation started. Please poll /api/job/{jobId} for status."
    });
  } catch (error) {
    console.error("❌ Job creation error:", error);
    return c.json({ success: false, error: error.message }, 500);
  }
});
app.post("/api/save-schedule", async (c) => {
  try {
    const body = await c.req.json();
    const enabled = !!body.enabled;
    const slot1Enabled = body.slot1Enabled === void 0 ? true : !!body.slot1Enabled;
    const time = body.time || "09:00";
    const time2 = body.time2 || "18:00";
    const slot2Enabled = !!body.slot2Enabled;
    const privacy = body.privacy || "public";
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
    });
    return c.json({ success: true, message: "スケジュールを保存しました", time, time2 });
  } catch (err) {
    console.error("❌ save-schedule error:", err);
    return c.json({ success: false, error: err.message }, 500);
  }
});
app.get("/api/schedule", async (c) => {
  try {
    const row = await getScheduleDoc();
    return c.json({
      success: true,
      schedule: {
        enabled: !!row.enabled,
        slot1Enabled: !!row.slot1_enabled,
        slot2Enabled: !!row.slot2_enabled,
        time: row.slot1_time || "09:00",
        time2: row.slot2_time || "18:00",
        privacy: row.privacy || "public"
      }
    });
  } catch (err) {
    console.error("❌ get-schedule error:", err);
    return c.json({ success: false, error: err.message }, 500);
  }
});
app.get("/api/job/:jobId", async (c) => {
  try {
    const jobId = c.req.param("jobId");
    const result = await getJobById(jobId);
    if (!result) {
      return c.json({ success: false, error: "Job not found" }, 404);
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
    });
  } catch (error) {
    console.error("❌ Job status check error:", error);
    return c.json({ success: false, error: error.message }, 500);
  }
});
const getCurrentTimeInTz = (tz) => {
  var _a, _b;
  const formatter = new Intl.DateTimeFormat("ja-JP", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
  const parts = formatter.formatToParts(/* @__PURE__ */ new Date());
  const hour = ((_a = parts.find((p) => p.type === "hour")) == null ? void 0 : _a.value) || "00";
  const minute = ((_b = parts.find((p) => p.type === "minute")) == null ? void 0 : _b.value) || "00";
  return `${hour}:${minute}`;
};
const getDateKeyInTz = (tz) => {
  const formatter = new Intl.DateTimeFormat("ja-JP", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return formatter.format(/* @__PURE__ */ new Date()).replace(/\//g, "-");
};
const timeToMinutes = (t) => {
  const [h, m] = (t || "00:00").split(":").map((v) => parseInt(v, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
};
const buildConfigFromSettings = (settings, schedule, activeSlot) => {
  const safe = settings || {};
  const baseSchedule = {
    enabled: !!(schedule == null ? void 0 : schedule.enabled),
    slot1Enabled: (schedule == null ? void 0 : schedule.slot1_enabled) !== 0,
    slot2Enabled: !!(schedule == null ? void 0 : schedule.slot2_enabled),
    time: (schedule == null ? void 0 : schedule.slot1_time) || "09:00",
    time2: (schedule == null ? void 0 : schedule.slot2_time) || "18:00",
    privacy: (schedule == null ? void 0 : schedule.privacy) || "public",
    triggeredSlot: activeSlot
  };
  if (activeSlot === "slot2" && (schedule == null ? void 0 : schedule.slot2_time)) {
    baseSchedule.time = schedule.slot2_time;
  }
  return {
    character: {
      mode: "prompt",
      imageUrl: "",
      prompt: safe.characterPrompt || ""
    },
    video: {
      action: safe.action || "singing",
      instrument: safe.instrument || "",
      theme: safe.theme || "vibe",
      aspectRatio: safe.aspect || "9:16",
      duration: parseInt(safe.duration || "8", 10) || 8
    },
    music: {
      genre: safe.genre || "pop",
      language: safe.language || "english",
      lyrics: safe.lyrics || ""
    },
    schedule: baseSchedule
  };
};
const buildLocalYoutubeMeta = (config) => {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j;
  const actionText = ((_a = config.video) == null ? void 0 : _a.action) || "video";
  const instrumentText = (((_b = config.video) == null ? void 0 : _b.action) === "playing" || ((_c = config.video) == null ? void 0 : _c.action) === "singing") && ((_d = config.video) == null ? void 0 : _d.instrument) ? `with ${config.video.instrument}` : "";
  const rawTheme = ((_e = config.video) == null ? void 0 : _e.theme) || "vibe";
  const rawGenre = ((_f = config.music) == null ? void 0 : _f.genre) || "pop";
  const sanitizeAscii = (s) => /[^\x00-\x7F]/.test(s) ? "vibe" : s;
  const shortenTheme = (s) => {
    const parts = s.split(/[\n,\/]/).map((p) => p.trim()).filter(Boolean);
    return (parts[0] || "vibe").slice(0, 30);
  };
  const theme = sanitizeAscii(shortenTheme(rawTheme));
  const genre = sanitizeAscii(rawGenre);
  const lengthText = `${((_g = config.video) == null ? void 0 : _g.duration) || 8}s`;
  const formatText = ((_h = config.video) == null ? void 0 : _h.aspectRatio) === "9:16" ? "YouTube Shorts (9:16)" : "YouTube (16:9)";
  const title = `[AI] ${genre} ${actionText} | ${theme}`;
  const description = `AI-generated short.

Theme: ${theme}
Genre: ${genre}
${instrumentText ? `Instrument: ${instrumentText}
` : ""}Length: ${lengthText}
Format: ${formatText}

#AI #${genre} #${theme} #music #shorts #AIGenerated`;
  const tags = [
    "AI generated",
    "AI music",
    genre,
    theme,
    instrumentText ? instrumentText.replace("with ", "") : null,
    ((_i = config.video) == null ? void 0 : _i.aspectRatio) === "9:16" ? "Shorts" : "YouTube",
    ((_j = config.music) == null ? void 0 : _j.language) === "japanese" ? "Japanese" : "English"
  ].filter(Boolean).map((t) => /[^\x00-\x7F]/.test(t) ? "AI" : t).join(", ");
  return { title, description, tags };
};
app.get("/api/cron/run-schedule", async (c) => {
  var _a;
  try {
    try {
      const ping = await colSettings.limit(1).get();
      console.log("✅ Firestore ping ok. settings docs:", ping.size);
    } catch (fireErr) {
      logError("❌ Firestore ping failed", fireErr);
      return c.json({ success: false, error: fireErr.message || "Firestore ping failed" }, 500);
    }
    const timezone = c.env.TIMEZONE || "Asia/Tokyo";
    const scheduleRow = await getScheduleDoc();
    if (!scheduleRow || !scheduleRow.enabled) {
      return c.json({ success: true, message: "Scheduler disabled" });
    }
    const currentTime = getCurrentTimeInTz(timezone);
    const dateKey = getDateKeyInTz(timezone);
    const currentMinutes = timeToMinutes(currentTime);
    const dueSlots = [];
    if (scheduleRow.slot1_enabled && currentMinutes >= timeToMinutes(scheduleRow.slot1_time)) {
      dueSlots.push("slot1");
    }
    if (scheduleRow.slot2_enabled && currentMinutes >= timeToMinutes(scheduleRow.slot2_time)) {
      dueSlots.push("slot2");
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
      });
    }
    const savedSettings = await getSettingsDoc() || {};
    const host = c.req.header("host");
    const baseUrl = host ? `https://${host}` : "";
    const accessHeaders = {};
    const cfId = c.req.header("cf-access-client-id");
    const cfSecret = c.req.header("cf-access-client-secret");
    if (cfId && cfSecret) {
      accessHeaders["CF-Access-Client-Id"] = cfId;
      accessHeaders["CF-Access-Client-Secret"] = cfSecret;
    }
    const results = [];
    const toMs = (s) => {
      if (!s) return 0;
      const t = Date.parse(s);
      if (!Number.isNaN(t)) return t;
      const iso = s.includes("T") ? s : s.replace(" ", "T");
      const withZ = iso.endsWith("Z") ? iso : `${iso}Z`;
      const parsed = Date.parse(withZ);
      return Number.isNaN(parsed) ? 0 : parsed;
    };
    const scheduleUpdatedAt = toMs(scheduleRow.updated_at);
    for (const slot of dueSlots) {
      const runDocId = `${slot}_${dateKey}`;
      const existing = await colRuns.doc(runDocId).get();
      if (existing.exists) {
        const executedAt = toMs((_a = existing.data()) == null ? void 0 : _a.created_at);
        if (scheduleUpdatedAt <= executedAt) {
          results.push({ slot, skipped: true, reason: "already executed" });
          continue;
        } else {
          await colRuns.doc(runDocId).delete();
        }
      }
      const config = buildConfigFromSettings(savedSettings, scheduleRow, slot);
      let youtubeMeta = buildLocalYoutubeMeta(config);
      try {
        const ytRes = await fetch(`${baseUrl}/api/generate-youtube-settings`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...accessHeaders },
          body: JSON.stringify(config)
        });
        if (ytRes.ok) {
          const ytJson = await ytRes.json();
          if (ytJson.success && ytJson.youtube) {
            youtubeMeta = ytJson.youtube;
          }
        }
      } catch (err) {
        console.warn("generate-youtube-settings fallback:", (err == null ? void 0 : err.message) || err);
      }
      config.youtube = youtubeMeta;
      try {
        const genRes = await fetch(`${baseUrl}/api/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...accessHeaders },
          body: JSON.stringify(config)
        });
        const genJson = await genRes.json();
        if (!genRes.ok || !genJson.success) {
          throw new Error(genJson.error || "generate failed");
        }
        await colRuns.doc(runDocId).set({
          slot,
          run_date: dateKey,
          created_at: (/* @__PURE__ */ new Date()).toISOString()
        });
        results.push({ slot, jobId: genJson.jobId });
      } catch (err) {
        results.push({ slot, error: err.message });
      }
    }
    return c.json({ success: true, now: currentTime, date: dateKey, results });
  } catch (error) {
    logError("❌ run-schedule error", error);
    return c.json({ success: false, error: error.message }, 500);
  }
});
app.get("/api/debug/schedule-runs", async (c) => {
  try {
    const runsSnap = await colRuns.orderBy("created_at", "desc").limit(20).get();
    const runs = runsSnap.docs.map((d) => d.data());
    const latestSchedule = await getScheduleDoc();
    const jobsSnap = await colJobs.orderBy("created_at", "desc").limit(20).get();
    const jobs = jobsSnap.docs.map((d) => d.data());
    return c.json({
      success: true,
      schedule: latestSchedule || null,
      runs: runs || [],
      jobs: jobs || []
    });
  } catch (err) {
    console.error("❌ debug schedule runs error:", err);
    return c.json({ success: false, error: err.message }, 500);
  }
});
const getSoraSize = (aspect) => {
  if (aspect === "16:9") return "1280x720";
  return "720x1280";
};
const getSoraSeconds = (duration) => {
  const allowed = ["4", "8", "12"];
  const candidate = String(duration || "").trim();
  if (allowed.includes(candidate)) return candidate;
  if (candidate === "5") return "4";
  if (candidate === "10") return "12";
  return "4";
};
app.get("/api/cron/process-jobs", async (c) => {
  var _a, _b;
  try {
    const { OPENAI_API_KEY } = c.env;
    if (!OPENAI_API_KEY) {
      return c.json({ success: false, error: "OPENAI_API_KEY not configured" }, 500);
    }
    const pendingSnap = await colJobs.where("status", "==", "pending").orderBy("created_at").limit(5).get();
    const jobs = pendingSnap.docs.map((d) => d.data());
    if (!jobs || jobs.length === 0) {
      return c.json({ success: true, message: "No pending jobs" });
    }
    console.log(`🔄 Processing ${jobs.length} pending jobs`);
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    for (const job of jobs) {
      try {
        await colJobs.doc(job.job_id).update({
          status: "processing",
          started_at: nowMs()
        });
        console.log(`🎬 Starting video generation for job: ${job.job_id}`);
        const config = job.config || {};
        const size = getSoraSize((_a = config.video) == null ? void 0 : _a.aspectRatio);
        const seconds = getSoraSeconds((_b = config.video) == null ? void 0 : _b.duration);
        const video = await openai.videos.create({
          model: "sora-2",
          prompt: job.prompt,
          size,
          seconds
        });
        await colJobs.doc(job.job_id).update({
          config: { ...config, videoId: video.id, size }
        });
        console.log(`✅ Video generation started for job: ${job.job_id}, video: ${video.id}`);
      } catch (error) {
        console.error(`❌ Failed to start job ${job.job_id}:`, error.message);
        await colJobs.doc(job.job_id).update({
          status: "failed",
          error_message: error.message,
          completed_at: nowMs()
        });
      }
    }
    return c.json({ success: true, processed: jobs.length });
  } catch (error) {
    console.error("❌ Cron processing error:", error);
    return c.json({ success: false, error: error.message }, 500);
  }
});
app.get("/api/cron/check-jobs", async (c) => {
  var _a, _b, _c, _d;
  try {
    const { OPENAI_API_KEY } = c.env;
    if (!OPENAI_API_KEY) {
      return c.json({ success: false, error: "OPENAI_API_KEY not configured" }, 500);
    }
    const procSnap = await colJobs.where("status", "==", "processing").orderBy("started_at").limit(10).get();
    const processingJobs = procSnap.docs.map((d) => d.data());
    if (processingJobs.length === 0) {
      console.log("🔍 No processing jobs; running upload retries only");
    } else {
      console.log(`🔍 Checking ${processingJobs.length} processing jobs`);
    }
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    const accessHeadersRetry = {};
    const cfIdRetry = c.req.header("cf-access-client-id");
    const cfSecretRetry = c.req.header("cf-access-client-secret");
    if (cfIdRetry && cfSecretRetry) {
      accessHeadersRetry["CF-Access-Client-Id"] = cfIdRetry;
      accessHeadersRetry["CF-Access-Client-Secret"] = cfSecretRetry;
    }
    for (const job of processingJobs) {
      try {
        const config = job.config || {};
        if (!config.videoId) {
          console.log(`⚠️ No video id for job: ${job.job_id}`);
          continue;
        }
        const pollingVideo = await openai.videos.retrieve(config.videoId);
        if (pollingVideo.status === "completed") {
          console.log(`✅ Job ${job.job_id} completed`);
          const host2 = c.req.header("host");
          const videoUrl = host2 ? `https://${host2}/api/video/${config.videoId}/content` : `/api/video/${config.videoId}/content`;
          await colJobs.doc(job.job_id).update({
            status: "completed",
            video_url: videoUrl,
            completed_at: nowMs()
          });
          console.log(`🎥 Video URL saved for job: ${job.job_id}`);
          if (!config.youtube) {
            try {
              config.youtube = buildLocalYoutubeMeta(config);
            } catch (_) {
            }
          }
          const shouldUpload = ((_a = config.schedule) == null ? void 0 : _a.enabled) && config.youtube && !config.youtubeUploaded;
          if (shouldUpload) {
            try {
              const accessHeaders2 = {};
              const cfId2 = c.req.header("cf-access-client-id");
              const cfSecret2 = c.req.header("cf-access-client-secret");
              if (cfId2 && cfSecret2) {
                accessHeaders2["CF-Access-Client-Id"] = cfId2;
                accessHeaders2["CF-Access-Client-Secret"] = cfSecret2;
              }
              const baseUrl2 = host2 ? `https://${host2}` : "";
              const ytRes = await fetch(`${baseUrl2}/api/youtube-upload`, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...accessHeaders2 },
                body: JSON.stringify({
                  videoUrl,
                  youtube: config.youtube,
                  privacy: ((_b = config.schedule) == null ? void 0 : _b.privacy) || "public"
                })
              });
              const ytJson = await ytRes.json();
              if (ytJson.success) {
                console.log(`📺 YouTube upload success for job ${job.job_id}: ${ytJson.videoId}`);
                await colJobs.doc(job.job_id).update({
                  config: { ...config, youtubeUploaded: true, youtubeVideoId: ytJson.videoId }
                });
              } else {
                console.warn(`⚠️ YouTube upload failed for job ${job.job_id}: ${ytJson.error || "unknown"}`);
              }
            } catch (uploadErr) {
              console.error(`❌ YouTube upload exception for job ${job.job_id}:`, uploadErr.message);
            }
          }
        } else if (pollingVideo.status === "failed") {
          throw new Error(((_c = pollingVideo.error) == null ? void 0 : _c.message) || "Video generation failed");
        } else {
          console.log(`⏳ Job ${job.job_id} still processing...`);
        }
      } catch (error) {
        console.error(`❌ Failed to check job ${job.job_id}:`, error.message);
        await colJobs.doc(job.job_id).update({
          status: "failed",
          error_message: error.message,
          completed_at: nowMs()
        });
      }
    }
    const retrySnap = await colJobs.where("status", "==", "completed").orderBy("completed_at", "desc").limit(20).get();
    const retryUploads = retrySnap.docs.map((d) => d.data()).filter((job) => {
      var _a2;
      const cfg = job.config || {};
      return ((_a2 = cfg == null ? void 0 : cfg.schedule) == null ? void 0 : _a2.enabled) && (cfg == null ? void 0 : cfg.youtube) && !(cfg == null ? void 0 : cfg.youtubeUploaded);
    }).slice(0, 5);
    const accessHeaders = {};
    const cfId = c.req.header("cf-access-client-id");
    const cfSecret = c.req.header("cf-access-client-secret");
    if (cfId && cfSecret) {
      accessHeaders["CF-Access-Client-Id"] = cfId;
      accessHeaders["CF-Access-Client-Secret"] = cfSecret;
    }
    const host = c.req.header("host");
    const baseUrl = host ? `https://${host}` : "";
    for (const job of retryUploads || []) {
      try {
        const config = job.config || {};
        const videoUrl = job.video_url || (host ? `https://${host}/api/video/${config.videoId}/content` : "");
        if (!videoUrl) continue;
        const ytRes = await fetch(`${baseUrl}/api/youtube-upload`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...accessHeadersRetry },
          body: JSON.stringify({
            videoUrl,
            youtube: config.youtube,
            privacy: ((_d = config.schedule) == null ? void 0 : _d.privacy) || "public"
          })
        });
        const ytJson = await ytRes.json();
        if (ytJson.success) {
          console.log(`📺 YouTube upload retry success for job ${job.job_id}: ${ytJson.videoId}`);
          await colJobs.doc(job.job_id).update({
            config: { ...config, youtubeUploaded: true, youtubeVideoId: ytJson.videoId }
          });
        } else {
          console.warn(`⚠️ YouTube upload retry failed for job ${job.job_id}: ${ytJson.error || "unknown"}`);
          await colJobs.doc(job.job_id).update({
            config: { ...config, youtubeUploadError: ytJson.error || "unknown" }
          });
        }
      } catch (uploadErr) {
        console.error(`❌ YouTube upload retry exception for job ${job.job_id}:`, uploadErr.message);
      }
    }
    return c.json({ success: true, checked: processingJobs.length, retried: (retryUploads == null ? void 0 : retryUploads.length) || 0 });
  } catch (error) {
    console.error("❌ Cron checking error:", error);
    return c.json({ success: false, error: error.message }, 500);
  }
});
app.post("/api/youtube-upload", async (c) => {
  try {
    const { videoUrl, youtube, privacy } = await c.req.json();
    const { YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN, OPENAI_API_KEY } = c.env;
    if (!YOUTUBE_CLIENT_ID || !YOUTUBE_CLIENT_SECRET || !YOUTUBE_REFRESH_TOKEN) {
      return c.json({ success: false, error: "YouTube credentials not configured" }, 500);
    }
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: YOUTUBE_CLIENT_ID,
        client_secret: YOUTUBE_CLIENT_SECRET,
        refresh_token: YOUTUBE_REFRESH_TOKEN,
        grant_type: "refresh_token"
      })
    });
    if (!tokenRes.ok) {
      throw new Error(`Failed to refresh token: ${tokenRes.status}`);
    }
    const tokenJson = await tokenRes.json();
    const accessToken = tokenJson.access_token;
    const host = c.req.header("host");
    const absoluteVideoUrl = (videoUrl == null ? void 0 : videoUrl.startsWith("http")) ? videoUrl : `https://${host}${videoUrl}`;
    let videoArrayBuffer;
    let ct = "video/mp4";
    const proxyMatch = absoluteVideoUrl.match(/\/api\/video\/(.+?)\/content/);
    if (proxyMatch) {
      if (!OPENAI_API_KEY) {
        throw new Error("OPENAI_API_KEY not set for direct video fetch");
      }
      const vid = proxyMatch[1];
      const openAiUrl = `https://api.openai.com/v1/videos/${vid}/content`;
      const videoResp = await fetch(openAiUrl, {
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}` }
      });
      if (!videoResp.ok) throw new Error(`Failed to fetch video from OpenAI: ${videoResp.status}`);
      ct = videoResp.headers.get("content-type") || "video/mp4";
      videoArrayBuffer = await videoResp.arrayBuffer();
    } else {
      const videoResp = await fetch(absoluteVideoUrl);
      if (!videoResp.ok) {
        throw new Error(`Failed to fetch video: ${videoResp.status}`);
      }
      ct = videoResp.headers.get("content-type") || "";
      if (!ct.includes("video")) {
        const snippet = await videoResp.text();
        throw new Error(`Unexpected content-type: ${ct}. Status: ${videoResp.status}. Snippet: ${snippet.substring(0, 200)}`);
      }
      videoArrayBuffer = await videoResp.arrayBuffer();
      ct = ct || "video/mp4";
    }
    const fallbackYoutube = {
      title: "Test Upload from API",
      description: "AI generated short video.",
      tags: ""
    };
    const incoming = youtube || {};
    const safeTitle = (incoming.title || "").trim() || fallbackYoutube.title;
    const safeDescription = (incoming.description || "").trim() || fallbackYoutube.description;
    const safeTags = incoming.tags ? incoming.tags.split(",").map((t) => t.trim()).filter(Boolean) : [];
    const cleanTags = safeTags.filter(Boolean);
    const sanitizeStr = (s, max) => s.length > max ? s.substring(0, max) : s;
    const sanitizedTitle = sanitizeStr(safeTitle, 60);
    const sanitizedDescription = sanitizeStr(safeDescription, 4e3);
    const sanitizedTags = cleanTags.slice(0, 8).map((t) => sanitizeStr(t, 30));
    const metadataBody = {
      snippet: {
        title: sanitizedTitle,
        description: sanitizedDescription,
        categoryId: "24"
        // Entertainment
      },
      status: {
        privacyStatus: privacy || "unlisted"
      }
    };
    if (sanitizedTags.length > 0) {
      metadataBody.snippet.tags = sanitizedTags;
    }
    console.log("📤 YouTube metadata payload", JSON.stringify(metadataBody));
    const contentType = "video/mp4";
    const startRes = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": contentType,
        "X-Upload-Content-Length": String(videoArrayBuffer.byteLength)
      },
      body: JSON.stringify(metadataBody)
    });
    if (!startRes.ok) {
      const text = await startRes.text();
      throw new Error(`Failed to start upload: ${startRes.status} ${text.substring(0, 200)}`);
    }
    const uploadUrl = startRes.headers.get("location");
    if (!uploadUrl) {
      throw new Error("Upload URL not provided");
    }
    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": contentType,
        "Content-Length": String(videoArrayBuffer.byteLength)
      },
      body: Buffer.from(videoArrayBuffer)
    });
    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      throw new Error(`Upload failed: ${uploadRes.status} ${errText}`);
    }
    const uploadJson = await uploadRes.json();
    const videoId = uploadJson.id;
    return c.json({ success: true, videoId });
  } catch (error) {
    console.error("❌ YouTube upload error:", error);
    return c.json({ success: false, error: error.message }, 500);
  }
});
app.post("/api/settings", async (c) => {
  try {
    const body = await c.req.json();
    await saveSettingsDoc(body);
    return c.json({ success: true });
  } catch (err) {
    console.error("❌ save settings error:", err);
    return c.json({ success: false, error: err.message }, 500);
  }
});
app.get("/api/settings", async (c) => {
  try {
    const settings = await getSettingsDoc();
    if (!settings) {
      return c.json({ success: true, settings: null });
    }
    return c.json({ success: true, settings });
  } catch (err) {
    console.error("❌ get settings error:", err);
    return c.json({ success: false, error: err.message }, 500);
  }
});
app.get("/api/video/:videoId/content", async (c) => {
  const { OPENAI_API_KEY } = c.env;
  const videoId = c.req.param("videoId");
  if (!OPENAI_API_KEY) {
    return c.json({ success: false, error: "OPENAI_API_KEY not configured" }, 500);
  }
  try {
    const videoResp = await fetch(`https://api.openai.com/v1/videos/${videoId}/content`, {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`
      }
    });
    if (!videoResp.ok || !videoResp.body) {
      throw new Error(`Failed to fetch video content: ${videoResp.status} ${videoResp.statusText}`);
    }
    return new Response(videoResp.body, {
      status: 200,
      headers: {
        "Content-Type": videoResp.headers.get("content-type") || "video/mp4"
      }
    });
  } catch (error) {
    console.error("❌ Video proxy error:", error);
    return c.json({ success: false, error: error.message }, 500);
  }
});
app.get("/oauth2callback", async (c) => {
  const code = c.req.query("code");
  const { YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET } = c.env;
  if (!code) {
    return c.html("<p>Missing ?code in query.</p>");
  }
  if (!YOUTUBE_CLIENT_ID || !YOUTUBE_CLIENT_SECRET) {
    return c.html("<p>YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET not set.</p>");
  }
  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: YOUTUBE_CLIENT_ID,
        client_secret: YOUTUBE_CLIENT_SECRET,
        redirect_uri: `${c.req.url.split("?")[0]}`,
        grant_type: "authorization_code"
      })
    });
    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      throw new Error(`Token exchange failed: ${tokenRes.status} ${text}`);
    }
    const tokens = await tokenRes.json();
    const refreshToken = tokens.refresh_token;
    const accessToken = tokens.access_token;
    const expiresIn = tokens.expires_in;
    return c.html(`
      <h2>YouTube OAuth Success</h2>
      <p><strong>Refresh Token (save to Cloudflare Pages Secret):</strong></p>
      <pre style="background:#f5f5f5;padding:8px;">${refreshToken || "(not returned)"}</pre>
      <p>Access Token (temporary):</p>
      <pre style="background:#f5f5f5;padding:8px;">${accessToken}</pre>
      <p>expires_in: ${expiresIn}</p>
      <p>Next: set <code>YOUTUBE_REFRESH_TOKEN</code> with wrangler pages secret put, then remove this callback if不要.</p>
    `);
  } catch (err) {
    return c.html(`<p>OAuth error: ${err.message}</p>`);
  }
});
app.get("/api/debug/jobs", async (c) => {
  try {
    const snap = await colJobs.orderBy("created_at", "desc").limit(5).get();
    const jobs = snap.docs.map((d) => {
      var _a;
      const data = d.data();
      const cfg = data.config || {};
      return {
        job_id: data.job_id,
        status: data.status,
        error_message: data.error_message,
        video_url: data.video_url,
        created_at: data.created_at,
        completed_at: data.completed_at,
        youtube_title: (_a = cfg == null ? void 0 : cfg.youtube) == null ? void 0 : _a.title,
        youtube_uploaded: cfg == null ? void 0 : cfg.youtubeUploaded,
        youtube_video_id: cfg == null ? void 0 : cfg.youtubeVideoId
      };
    });
    return c.json({ success: true, jobs });
  } catch (err) {
    return c.json({ success: false, error: err.message }, 500);
  }
});
app.get("/", (c) => {
  return c.render(
    /* @__PURE__ */ jsxs("div", { class: "min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50", children: [
      /* @__PURE__ */ jsx("header", { class: "bg-white shadow-sm border-b border-gray-200", children: /* @__PURE__ */ jsx("div", { class: "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6", children: /* @__PURE__ */ jsxs("div", { class: "flex items-center justify-between", children: [
        /* @__PURE__ */ jsxs("div", { class: "flex items-center space-x-3", children: [
          /* @__PURE__ */ jsx("i", { class: "fas fa-video text-3xl text-purple-600" }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("h1", { class: "text-3xl font-bold text-gray-900", children: "AI動画自動投稿システム" }),
            /* @__PURE__ */ jsxs("p", { class: "text-sm text-orange-600 font-semibold mt-1", children: [
              /* @__PURE__ */ jsx("i", { class: "fas fa-flask mr-1" }),
              "ver 1.1.12"
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsx("div", { class: "flex items-center space-x-4", children: /* @__PURE__ */ jsxs("a", { href: "https://www.youtube.com/@4directionsApproachRecords", target: "_blank", rel: "noopener noreferrer", class: "px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition", children: [
          /* @__PURE__ */ jsx("i", { class: "fab fa-youtube mr-2" }),
          "チャンネルを見る"
        ] }) })
      ] }) }) }),
      /* @__PURE__ */ jsx("main", { class: "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8", children: /* @__PURE__ */ jsxs("div", { class: "grid grid-cols-1 lg:grid-cols-4 gap-6", children: [
        /* @__PURE__ */ jsxs("div", { class: "lg:col-span-2 space-y-6", children: [
          /* @__PURE__ */ jsxs("div", { class: "bg-white rounded-xl shadow-lg p-6 border border-gray-200", children: [
            /* @__PURE__ */ jsxs("div", { class: "flex items-center mb-6", children: [
              /* @__PURE__ */ jsx("i", { class: "fas fa-user-circle text-2xl text-purple-600 mr-3" }),
              /* @__PURE__ */ jsx("h2", { class: "text-2xl font-bold text-gray-900", children: "キャラクター設定" })
            ] }),
            /* @__PURE__ */ jsxs("div", { class: "space-y-4", children: [
              /* @__PURE__ */ jsx("div", { class: "bg-purple-50 border border-purple-200 rounded-lg p-3 text-sm text-purple-800", children: "Sora APIは画像リファレンス非対応のため、プロンプトのみで指定します。" }),
              /* @__PURE__ */ jsxs("div", { children: [
                /* @__PURE__ */ jsx("label", { class: "block text-sm font-semibold text-gray-700 mb-2", children: "キャラクタープロンプト" }),
                /* @__PURE__ */ jsx(
                  "textarea",
                  {
                    id: "characterPrompt",
                    rows: "4",
                    placeholder: "例: 白髪ボブの女性、シンプルな黒トップス、落ち着いた雰囲気",
                    class: "w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  }
                )
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { class: "bg-white rounded-xl shadow-lg p-6 border border-gray-200", children: [
            /* @__PURE__ */ jsxs("div", { class: "flex items-center mb-6", children: [
              /* @__PURE__ */ jsx("i", { class: "fas fa-film text-2xl text-blue-600 mr-3" }),
              /* @__PURE__ */ jsx("h2", { class: "text-2xl font-bold text-gray-900", children: "動画内容設定" })
            ] }),
            /* @__PURE__ */ jsxs("div", { id: "randomSettings", class: "space-y-4 mb-6", children: [
              /* @__PURE__ */ jsxs("div", { children: [
                /* @__PURE__ */ jsx("label", { class: "block text-sm font-semibold text-gray-700 mb-2", children: "アクション候補" }),
                /* @__PURE__ */ jsxs("div", { class: "grid grid-cols-2 gap-2 text-sm", id: "actionCandidates", children: [
                  /* @__PURE__ */ jsxs("label", { class: "flex items-center space-x-2", children: [
                    /* @__PURE__ */ jsx("input", { type: "checkbox", value: "singing", checked: true, class: "action-candidate" }),
                    " ",
                    /* @__PURE__ */ jsx("span", { children: "歌う（アップテンポ）" })
                  ] }),
                  /* @__PURE__ */ jsxs("label", { class: "flex items-center space-x-2", children: [
                    /* @__PURE__ */ jsx("input", { type: "checkbox", value: "dancing", checked: true, class: "action-candidate" }),
                    " ",
                    /* @__PURE__ */ jsx("span", { children: "踊る（トレンドダンス）" })
                  ] }),
                  /* @__PURE__ */ jsxs("label", { class: "flex items-center space-x-2", children: [
                    /* @__PURE__ */ jsx("input", { type: "checkbox", value: "playing", checked: true, class: "action-candidate" }),
                    " ",
                    /* @__PURE__ */ jsx("span", { children: "楽器演奏" })
                  ] }),
                  /* @__PURE__ */ jsxs("label", { class: "flex items-center space-x-2", children: [
                    /* @__PURE__ */ jsx("input", { type: "checkbox", value: "talking", checked: true, class: "action-candidate" }),
                    " ",
                    /* @__PURE__ */ jsx("span", { children: "リアクション/トーク" })
                  ] }),
                  /* @__PURE__ */ jsxs("label", { class: "flex items-center space-x-2", children: [
                    /* @__PURE__ */ jsx("input", { type: "checkbox", value: "behind-the-scenes", class: "action-candidate" }),
                    " ",
                    /* @__PURE__ */ jsx("span", { children: "behind-the-scenes on set" })
                  ] }),
                  /* @__PURE__ */ jsxs("label", { class: "flex items-center space-x-2", children: [
                    /* @__PURE__ */ jsx("input", { type: "checkbox", value: "art", class: "action-candidate" }),
                    " ",
                    /* @__PURE__ */ jsx("span", { children: "アート制作" })
                  ] }),
                  /* @__PURE__ */ jsxs("label", { class: "flex items-center space-x-2", children: [
                    /* @__PURE__ */ jsx("input", { type: "checkbox", value: "sport", class: "action-candidate" }),
                    " ",
                    /* @__PURE__ */ jsx("span", { children: "スポーツトリック" })
                  ] }),
                  /* @__PURE__ */ jsxs("label", { class: "flex items-center space-x-2", children: [
                    /* @__PURE__ */ jsx("input", { type: "checkbox", value: "cooking", class: "action-candidate" }),
                    " ",
                    /* @__PURE__ */ jsx("span", { children: "料理ショート" })
                  ] })
                ] })
              ] }),
              /* @__PURE__ */ jsxs("div", { children: [
                /* @__PURE__ */ jsx("label", { class: "block text-sm font-semibold text-gray-700 mb-2", children: "楽器候補（演奏/歌う時に使用）" }),
                /* @__PURE__ */ jsxs("div", { class: "grid grid-cols-2 gap-2 text-sm", id: "instrumentCandidates", children: [
                  /* @__PURE__ */ jsxs("label", { class: "flex items-center space-x-2", children: [
                    /* @__PURE__ */ jsx("input", { type: "checkbox", value: "acoustic-guitar", checked: true, class: "instrument-candidate" }),
                    " ",
                    /* @__PURE__ */ jsx("span", { children: "アコ/エレキギター" })
                  ] }),
                  /* @__PURE__ */ jsxs("label", { class: "flex items-center space-x-2", children: [
                    /* @__PURE__ */ jsx("input", { type: "checkbox", value: "piano", checked: true, class: "instrument-candidate" }),
                    " ",
                    /* @__PURE__ */ jsx("span", { children: "ピアノ" })
                  ] }),
                  /* @__PURE__ */ jsxs("label", { class: "flex items-center space-x-2", children: [
                    /* @__PURE__ */ jsx("input", { type: "checkbox", value: "drum", class: "instrument-candidate" }),
                    " ",
                    /* @__PURE__ */ jsx("span", { children: "ドラム" })
                  ] }),
                  /* @__PURE__ */ jsxs("label", { class: "flex items-center space-x-2", children: [
                    /* @__PURE__ */ jsx("input", { type: "checkbox", value: "violin", class: "instrument-candidate" }),
                    " ",
                    /* @__PURE__ */ jsx("span", { children: "バイオリン" })
                  ] }),
                  /* @__PURE__ */ jsxs("label", { class: "flex items-center space-x-2", children: [
                    /* @__PURE__ */ jsx("input", { type: "checkbox", value: "flute", class: "instrument-candidate" }),
                    " ",
                    /* @__PURE__ */ jsx("span", { children: "フルート" })
                  ] }),
                  /* @__PURE__ */ jsxs("label", { class: "flex items-center space-x-2", children: [
                    /* @__PURE__ */ jsx("input", { type: "checkbox", value: "synth", class: "instrument-candidate" }),
                    " ",
                    /* @__PURE__ */ jsx("span", { children: "シンセ" })
                  ] }),
                  /* @__PURE__ */ jsxs("label", { class: "flex items-center space-x-2", children: [
                    /* @__PURE__ */ jsx("input", { type: "checkbox", value: "ukulele", class: "instrument-candidate" }),
                    " ",
                    /* @__PURE__ */ jsx("span", { children: "ウクレレ" })
                  ] })
                ] })
              ] }),
              /* @__PURE__ */ jsxs("div", { children: [
                /* @__PURE__ */ jsx("label", { class: "block text-sm font-semibold text-gray-700 mb-2", children: "テーマ/ムード候補（改行区切り）" }),
                /* @__PURE__ */ jsx("textarea", { id: "themePool", rows: "3", class: "w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent", placeholder: "元気\\n夜景シネマ\\n感動バラード\\nトレンドダンス" })
              ] }),
              /* @__PURE__ */ jsxs("div", { children: [
                /* @__PURE__ */ jsx("label", { class: "block text-sm font-semibold text-gray-700 mb-2", children: "長さ候補" }),
                /* @__PURE__ */ jsxs("div", { class: "flex flex-wrap gap-3 text-sm", id: "lengthCandidates", children: [
                  /* @__PURE__ */ jsxs("label", { class: "flex items-center space-x-2", children: [
                    /* @__PURE__ */ jsx("input", { type: "checkbox", value: "4", class: "length-candidate" }),
                    " ",
                    /* @__PURE__ */ jsx("span", { children: "4秒" })
                  ] }),
                  /* @__PURE__ */ jsxs("label", { class: "flex items-center space-x-2", children: [
                    /* @__PURE__ */ jsx("input", { type: "checkbox", value: "8", class: "length-candidate", checked: true }),
                    " ",
                    /* @__PURE__ */ jsx("span", { children: "8秒" })
                  ] }),
                  /* @__PURE__ */ jsxs("label", { class: "flex items-center space-x-2", children: [
                    /* @__PURE__ */ jsx("input", { type: "checkbox", value: "12", class: "length-candidate" }),
                    " ",
                    /* @__PURE__ */ jsx("span", { children: "12秒" })
                  ] })
                ] })
              ] })
            ] }),
            /* @__PURE__ */ jsxs("div", { class: "hidden", id: "manualVideoSettings", style: "display:none !important", "aria-hidden": "true", children: [
              /* @__PURE__ */ jsx("div", { children: /* @__PURE__ */ jsxs("select", { id: "action", class: "w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent", children: [
                /* @__PURE__ */ jsx("option", { value: "singing", selected: true, children: "歌っている" }),
                /* @__PURE__ */ jsx("option", { value: "dancing", children: "踊っている" }),
                /* @__PURE__ */ jsx("option", { value: "talking", children: "喋っている" }),
                /* @__PURE__ */ jsx("option", { value: "playing", children: "楽器演奏" }),
                /* @__PURE__ */ jsx("option", { value: "behind-the-scenes", children: "behind-the-scenes on set" }),
                /* @__PURE__ */ jsx("option", { value: "art", children: "アート制作" }),
                /* @__PURE__ */ jsx("option", { value: "sport", children: "スポーツトリック" }),
                /* @__PURE__ */ jsx("option", { value: "cooking", children: "料理ショート" })
              ] }) }),
              /* @__PURE__ */ jsx("div", { id: "instrumentSection", children: /* @__PURE__ */ jsxs("select", { id: "instrument", class: "w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent", children: [
                /* @__PURE__ */ jsx("option", { value: "acoustic-guitar", selected: true, children: "アコースティックギター" }),
                /* @__PURE__ */ jsx("option", { value: "piano", children: "ピアノ" }),
                /* @__PURE__ */ jsx("option", { value: "drum", children: "ドラム/ハンドドラム" }),
                /* @__PURE__ */ jsx("option", { value: "flute", children: "フルート" }),
                /* @__PURE__ */ jsx("option", { value: "electric-guitar", children: "エレキギター" }),
                /* @__PURE__ */ jsx("option", { value: "violin", children: "バイオリン" }),
                /* @__PURE__ */ jsx("option", { value: "ukulele", children: "ウクレレ" })
              ] }) }),
              /* @__PURE__ */ jsx("div", { children: /* @__PURE__ */ jsx(
                "input",
                {
                  type: "text",
                  id: "theme",
                  placeholder: "例: 勇気、希望、愛、楽しい、元気...",
                  class: "w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                }
              ) }),
              /* @__PURE__ */ jsx("div", { children: /* @__PURE__ */ jsxs("div", { class: "flex space-x-4", children: [
                /* @__PURE__ */ jsxs("label", { class: "flex items-center", children: [
                  /* @__PURE__ */ jsx("input", { type: "radio", name: "aspect", value: "9:16", checked: true, class: "mr-2" }),
                  /* @__PURE__ */ jsx("span", { class: "text-sm", children: "9:16 (ショート)" })
                ] }),
                /* @__PURE__ */ jsxs("label", { class: "flex items-center", children: [
                  /* @__PURE__ */ jsx("input", { type: "radio", name: "aspect", value: "16:9", class: "mr-2" }),
                  /* @__PURE__ */ jsx("span", { class: "text-sm", children: "16:9 (通常)" })
                ] })
              ] }) }),
              /* @__PURE__ */ jsx("div", { children: /* @__PURE__ */ jsxs("select", { id: "duration", class: "w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent", children: [
                /* @__PURE__ */ jsx("option", { value: "4", children: "4秒" }),
                /* @__PURE__ */ jsx("option", { value: "8", selected: true, children: "8秒" }),
                /* @__PURE__ */ jsx("option", { value: "12", children: "12秒" })
              ] }) })
            ] }),
            /* @__PURE__ */ jsx("div", { class: "flex justify-end pt-2", children: /* @__PURE__ */ jsxs("button", { id: "saveContentBtn", class: "px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm", children: [
              /* @__PURE__ */ jsx("i", { class: "fas fa-save mr-2" }),
              "動画内容設定を保存"
            ] }) })
          ] }),
          /* @__PURE__ */ jsxs("div", { class: "bg-white rounded-xl shadow-lg p-6 border border-gray-200", children: [
            /* @__PURE__ */ jsxs("div", { class: "flex items-center mb-6", children: [
              /* @__PURE__ */ jsx("i", { class: "fas fa-music text-2xl text-green-600 mr-3" }),
              /* @__PURE__ */ jsx("h2", { class: "text-2xl font-bold text-gray-900", children: "音楽設定" })
            ] }),
            /* @__PURE__ */ jsxs("div", { class: "space-y-4", children: [
              /* @__PURE__ */ jsxs("div", { children: [
                /* @__PURE__ */ jsx("label", { class: "block text-sm font-semibold text-gray-700 mb-2", children: "ジャンル" }),
                /* @__PURE__ */ jsxs("select", { id: "genre", class: "w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent", children: [
                  /* @__PURE__ */ jsx("option", { value: "pop", children: "ポップ" }),
                  /* @__PURE__ */ jsx("option", { value: "ballad", children: "バラード" }),
                  /* @__PURE__ */ jsx("option", { value: "rock", children: "ロック" }),
                  /* @__PURE__ */ jsx("option", { value: "folk", children: "フォーク" }),
                  /* @__PURE__ */ jsx("option", { value: "jazz", children: "ジャズ" }),
                  /* @__PURE__ */ jsx("option", { value: "acoustic", children: "アコースティック" })
                ] })
              ] }),
              /* @__PURE__ */ jsxs("div", { children: [
                /* @__PURE__ */ jsx("label", { class: "block text-sm font-semibold text-gray-700 mb-2", children: "言語" }),
                /* @__PURE__ */ jsxs("div", { class: "flex space-x-4", children: [
                  /* @__PURE__ */ jsxs("label", { class: "flex items-center", children: [
                    /* @__PURE__ */ jsx("input", { type: "radio", name: "language", value: "english", checked: true, class: "mr-2" }),
                    /* @__PURE__ */ jsx("span", { class: "text-sm", children: "英語" })
                  ] }),
                  /* @__PURE__ */ jsxs("label", { class: "flex items-center", children: [
                    /* @__PURE__ */ jsx("input", { type: "radio", name: "language", value: "japanese", class: "mr-2" }),
                    /* @__PURE__ */ jsx("span", { class: "text-sm", children: "日本語" })
                  ] })
                ] })
              ] }),
              /* @__PURE__ */ jsx("div", { style: "display:none", "aria-hidden": "true", children: /* @__PURE__ */ jsx("textarea", { id: "lyrics" }) })
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { class: "bg-white rounded-xl shadow-lg p-6 border border-gray-200", children: [
            /* @__PURE__ */ jsxs("div", { class: "flex items-center justify-between mb-6", children: [
              /* @__PURE__ */ jsxs("div", { class: "flex items-center", children: [
                /* @__PURE__ */ jsx("i", { class: "fas fa-calendar-alt text-2xl text-orange-600 mr-3" }),
                /* @__PURE__ */ jsx("h2", { class: "text-2xl font-bold text-gray-900", children: "投稿スケジューラ" })
              ] }),
              /* @__PURE__ */ jsx("span", { class: "text-sm text-gray-500", children: "(常時有効)" })
            ] }),
            /* @__PURE__ */ jsx("div", { id: "schedulerContent", style: "display:block;", children: /* @__PURE__ */ jsxs("div", { class: "space-y-4", children: [
              /* @__PURE__ */ jsxs("div", { class: "bg-orange-50 border border-orange-200 rounded-lg p-4", children: [
                /* @__PURE__ */ jsxs("div", { class: "flex items-center mb-2", children: [
                  /* @__PURE__ */ jsx("i", { class: "fas fa-repeat text-orange-600 mr-2" }),
                  /* @__PURE__ */ jsx("span", { class: "text-sm font-semibold text-orange-900", children: "毎日最大2本自動投稿" })
                ] }),
                /* @__PURE__ */ jsx("p", { class: "text-xs text-orange-800", children: "時間を2つまで設定できます" })
              ] }),
              /* @__PURE__ */ jsxs("div", { class: "border border-gray-200 rounded-lg p-4", children: [
                /* @__PURE__ */ jsxs("label", { class: "block text-sm font-semibold text-gray-700 mb-2 flex items-center justify-between", children: [
                  /* @__PURE__ */ jsx("span", { children: "投稿時間1" }),
                  /* @__PURE__ */ jsxs("label", { class: "flex items-center text-xs", children: [
                    /* @__PURE__ */ jsx("input", { type: "checkbox", id: "enableSlot1", class: "mr-2", checked: true }),
                    "有効化"
                  ] })
                ] }),
                /* @__PURE__ */ jsx(
                  "input",
                  {
                    type: "time",
                    id: "dailyPostTime",
                    value: "09:00",
                    class: "w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  }
                )
              ] }),
              /* @__PURE__ */ jsxs("div", { class: "border border-gray-200 rounded-lg p-4", children: [
                /* @__PURE__ */ jsxs("label", { class: "block text-sm font-semibold text-gray-700 mb-2 flex items-center justify-between", children: [
                  /* @__PURE__ */ jsx("span", { children: "投稿時間2" }),
                  /* @__PURE__ */ jsxs("label", { class: "flex items-center text-xs", children: [
                    /* @__PURE__ */ jsx("input", { type: "checkbox", id: "enableSlot2", class: "mr-2" }),
                    "有効化"
                  ] })
                ] }),
                /* @__PURE__ */ jsx(
                  "input",
                  {
                    type: "time",
                    id: "dailyPostTime2",
                    value: "18:00",
                    class: "w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  }
                )
              ] }),
              /* @__PURE__ */ jsxs("div", { children: [
                /* @__PURE__ */ jsx("label", { class: "block text-sm font-semibold text-gray-700 mb-2", children: "公開設定" }),
                /* @__PURE__ */ jsxs("select", { id: "privacy", class: "w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent", children: [
                  /* @__PURE__ */ jsx("option", { value: "public", children: "公開" }),
                  /* @__PURE__ */ jsx("option", { value: "unlisted", children: "限定公開" }),
                  /* @__PURE__ */ jsx("option", { value: "private", children: "非公開" })
                ] })
              ] }),
              /* @__PURE__ */ jsxs(
                "button",
                {
                  id: "saveScheduleBtn",
                  class: "w-full bg-orange-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-orange-700 transition",
                  children: [
                    /* @__PURE__ */ jsx("i", { class: "fas fa-calendar-check mr-2" }),
                    "スケジュールを保存"
                  ]
                }
              )
            ] }) }),
            /* @__PURE__ */ jsx("div", { id: "schedulerDisabled", class: "hidden" }),
            /* @__PURE__ */ jsx("div", { class: "bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4", children: /* @__PURE__ */ jsxs("div", { class: "flex items-start", children: [
              /* @__PURE__ */ jsx("i", { class: "fas fa-info-circle text-blue-600 mr-2 mt-1" }),
              /* @__PURE__ */ jsxs("div", { class: "text-sm text-blue-800", children: [
                /* @__PURE__ */ jsx("p", { class: "font-semibold mb-1", children: "YouTube投稿情報は自動生成されます" }),
                /* @__PURE__ */ jsx("p", { class: "text-xs", children: "タイトル、説明文、タグは、キャラクター設定と動画内容に基づいてAIが最適化します。" })
              ] })
            ] }) })
          ] }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsxs(
              "button",
              {
                id: "generateBtn",
                class: "w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white px-8 py-4 rounded-xl font-bold text-lg hover:from-purple-700 hover:to-blue-700 transition shadow-lg",
                children: [
                  /* @__PURE__ */ jsx("i", { class: "fas fa-magic mr-2" }),
                  /* @__PURE__ */ jsx("span", { id: "generateBtnText", children: "今すぐ動画を生成" })
                ]
              }
            ),
            /* @__PURE__ */ jsx("p", { class: "text-xs text-gray-500 text-center mt-2", children: "スケジューラが有効な場合、設定された時間に自動投稿されます" })
          ] })
        ] }),
        /* @__PURE__ */ jsx("div", { class: "lg:col-span-1 space-y-6", children: /* @__PURE__ */ jsxs("div", { class: "bg-white rounded-xl shadow-lg p-6 border border-gray-200 sticky top-8", children: [
          /* @__PURE__ */ jsxs("div", { class: "flex items-center mb-4", children: [
            /* @__PURE__ */ jsx("i", { class: "fas fa-eye text-xl text-gray-600 mr-2" }),
            /* @__PURE__ */ jsx("h3", { class: "text-lg font-bold text-gray-900", children: "プレビュー" })
          ] }),
          /* @__PURE__ */ jsx("div", { id: "videoPreview", class: "bg-gray-100 rounded-lg aspect-[9/16] flex items-center justify-center", children: /* @__PURE__ */ jsxs("div", { class: "text-center text-gray-400", children: [
            /* @__PURE__ */ jsx("i", { class: "fas fa-video text-4xl mb-2" }),
            /* @__PURE__ */ jsx("p", { class: "text-sm", children: "動画生成後に表示" })
          ] }) }),
          /* @__PURE__ */ jsx("div", { id: "generationStatus", class: "mt-4 hidden", children: /* @__PURE__ */ jsxs("div", { class: "bg-blue-50 border border-blue-200 rounded-lg p-4", children: [
            /* @__PURE__ */ jsxs("div", { class: "flex items-center", children: [
              /* @__PURE__ */ jsx("i", { class: "fas fa-spinner fa-spin text-blue-600 mr-2" }),
              /* @__PURE__ */ jsx("span", { class: "text-sm font-semibold text-blue-800", children: "生成中..." })
            ] }),
            /* @__PURE__ */ jsx("div", { class: "mt-2 bg-blue-200 rounded-full h-2", children: /* @__PURE__ */ jsx("div", { class: "bg-blue-600 h-2 rounded-full", style: "width: 0%", id: "progressBar" }) })
          ] }) })
        ] }) }),
        /* @__PURE__ */ jsx("div", { class: "lg:col-span-1 space-y-6", children: /* @__PURE__ */ jsxs("div", { class: "bg-white rounded-xl shadow-lg p-6 border border-gray-200", children: [
          /* @__PURE__ */ jsxs("div", { class: "flex items-center mb-4", children: [
            /* @__PURE__ */ jsx("i", { class: "fab fa-youtube text-xl text-red-600 mr-2" }),
            /* @__PURE__ */ jsx("h3", { class: "text-lg font-bold text-gray-900", children: "YouTube設定" })
          ] }),
          /* @__PURE__ */ jsx("div", { id: "youtubeSettingsPreview", class: "space-y-3", children: /* @__PURE__ */ jsxs("div", { class: "text-center text-gray-400 py-6", children: [
            /* @__PURE__ */ jsx("i", { class: "fas fa-robot text-3xl mb-2" }),
            /* @__PURE__ */ jsx("p", { class: "text-sm", children: "AI自動生成" }),
            /* @__PURE__ */ jsx("p", { class: "text-xs mt-1", children: "設定入力後に自動生成されます" })
          ] }) }),
          /* @__PURE__ */ jsxs("div", { class: "mt-4 bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-700", children: [
            /* @__PURE__ */ jsx("p", { class: "font-semibold mb-1", children: "Debug Info" }),
            /* @__PURE__ */ jsxs("div", { class: "space-y-1", children: [
              /* @__PURE__ */ jsxs("div", { children: [
                "Video URL: ",
                /* @__PURE__ */ jsx("span", { id: "debugVideoUrl", children: "-" })
              ] }),
              /* @__PURE__ */ jsx("div", { children: "Category: -" }),
              /* @__PURE__ */ jsx("div", { children: "Playlist: - (disabled)" }),
              /* @__PURE__ */ jsxs("div", { children: [
                "Privacy: ",
                /* @__PURE__ */ jsx("span", { id: "debugPrivacy", children: "-" })
              ] }),
              /* @__PURE__ */ jsxs("div", { children: [
                "YouTube Upload: ",
                /* @__PURE__ */ jsx("span", { id: "debugYoutubeStatus", children: "-" })
              ] }),
              /* @__PURE__ */ jsxs("div", { children: [
                "Settings Save: ",
                /* @__PURE__ */ jsx("span", { id: "debugSettingsSave", children: "-" })
              ] }),
              /* @__PURE__ */ jsxs("div", { children: [
                "Settings Load: ",
                /* @__PURE__ */ jsx("span", { id: "debugSettingsLoad", children: "-" })
              ] }),
              /* @__PURE__ */ jsxs("div", { children: [
                "Job Status: ",
                /* @__PURE__ */ jsx("span", { id: "debugJobStatus", children: "-" })
              ] }),
              /* @__PURE__ */ jsxs("div", { children: [
                "Job Error: ",
                /* @__PURE__ */ jsx("span", { id: "debugJobError", children: "-" })
              ] }),
              /* @__PURE__ */ jsxs("div", { children: [
                "Cron Process: ",
                /* @__PURE__ */ jsx("span", { id: "debugCronProcess", children: "-" })
              ] }),
              /* @__PURE__ */ jsxs("div", { children: [
                "Cron Check: ",
                /* @__PURE__ */ jsx("span", { id: "debugCronCheck", children: "-" })
              ] })
            ] }),
            /* @__PURE__ */ jsxs("div", { class: "mt-3", children: [
              /* @__PURE__ */ jsx("p", { class: "font-semibold mb-1", children: "Recent Jobs (5)" }),
              /* @__PURE__ */ jsx("div", { id: "debugJobsList", class: "space-y-1" })
            ] })
          ] })
        ] }) })
      ] }) }),
      /* @__PURE__ */ jsx("footer", { class: "bg-white border-t border-gray-200 mt-12", children: /* @__PURE__ */ jsx("div", { class: "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6", children: /* @__PURE__ */ jsx("p", { class: "text-center text-gray-500 text-sm", children: "© 2024 YouTube AI Video Auto-Upload System" }) }) }),
      /* @__PURE__ */ jsx("script", { src: "/static/app.js?v=1.1.12" })
    ] })
  );
});
app.onError((err, c) => {
  logError("❌ unhandled error", err);
  return c.json({ success: false, error: "internal_error" }, 500);
});
app.notFound((c) => c.text("Not Found", 404));
export {
  app as default
};
