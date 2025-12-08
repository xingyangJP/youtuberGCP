-- YouTube AI Video System Database Schema

-- 生成された動画の履歴テーブル
CREATE TABLE IF NOT EXISTS videos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- キャラクター設定
  character_mode TEXT NOT NULL CHECK(character_mode IN ('upload', 'prompt')),
  character_image_url TEXT,
  character_prompt TEXT,
  
  -- 動画内容設定
  action TEXT NOT NULL CHECK(action IN ('singing', 'dancing', 'talking', 'playing')),
  instrument TEXT,
  theme TEXT NOT NULL,
  aspect_ratio TEXT NOT NULL CHECK(aspect_ratio IN ('9:16', '16:9')),
  duration INTEGER NOT NULL,
  
  -- 音楽設定
  genre TEXT NOT NULL,
  language TEXT NOT NULL CHECK(language IN ('english', 'japanese')),
  lyrics TEXT,
  
  -- 生成結果
  character_image_ai_url TEXT,
  video_url TEXT,
  thumbnail_url TEXT,
  audio_url TEXT,
  
  -- YouTube設定
  youtube_title TEXT,
  youtube_description TEXT,
  youtube_tags TEXT,
  
  -- YouTube投稿情報
  youtube_video_id TEXT,
  youtube_status TEXT CHECK(youtube_status IN ('pending', 'uploaded', 'failed')),
  youtube_uploaded_at DATETIME,
  
  -- タイムスタンプ
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- スケジュール設定テーブル
CREATE TABLE IF NOT EXISTS schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  enabled INTEGER NOT NULL DEFAULT 0,
  
  -- 投稿時間設定（最大4つ）
  slot1_enabled INTEGER DEFAULT 0,
  slot1_time TEXT,
  slot2_enabled INTEGER DEFAULT 0,
  slot2_time TEXT,
  slot3_enabled INTEGER DEFAULT 0,
  slot3_time TEXT,
  slot4_enabled INTEGER DEFAULT 0,
  slot4_time TEXT,
  
  -- 公開設定
  privacy TEXT NOT NULL DEFAULT 'public' CHECK(privacy IN ('public', 'unlisted', 'private')),
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- デフォルトスケジュール設定を挿入
INSERT INTO schedules (enabled, slot1_enabled, slot1_time, privacy) 
VALUES (0, 1, '09:00', 'public');

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_videos_created_at ON videos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_videos_youtube_status ON videos(youtube_status);
CREATE INDEX IF NOT EXISTS idx_videos_youtube_video_id ON videos(youtube_video_id);
