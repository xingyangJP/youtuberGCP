# YouTube AI動画自動投稿システム
https://github.com/xerographix/youtuberGCP.git  
Cloudflare Pages Functions + Hono で動く、AI動画生成とYouTube自動投稿の一体型アプリです。UIとAPIを1つのHonoアプリで提供し、Cloudflare D1に設定・ジョブを保存します。

## 仕組みの概要
- Hono（TypeScript, SSR）をCloudflare Pages Functionsで稼働。ビルドはVite。
- D1に `jobs` / `schedules` / `settings` / `schedule_runs` を保持し、`schedule_runs` で1日あたりのスロット重複実行を防止。
- OpenAI Sora-2で動画を生成し、`/api/video/:id/content` でSoraの動画をプロキシ配信。完了後はYouTube Data API v3にResumable Uploadで投稿。
- GitHub Actions（`.github/workflows/cron-scheduler.yml`）が5分おきに `/api/cron/run-schedule` → `/api/cron/process-jobs` → `/api/cron/check-jobs` を叩き、自動投稿フローを回します。

## スケジュール実行フロー
- `/api/cron/run-schedule`: D1の`schedules`からslot1/slot2を読み、タイムゾーン（既定`Asia/Tokyo`）の現在時刻が「設定時刻以上」かつ当日未実行ならジョブ作成。設定は`/api/settings`に保存された値とマージし、YouTubeメタは`/api/generate-youtube-settings`（失敗時はローカル組立）で付与。
- `/api/cron/process-jobs`: `pending`を最大5件`processing`にしてSoraで生成開始。サイズはアスペクト比で `9:16→720x1280 / 16:9→1280x720`、長さは `4/8/12秒`（旧5/10秒は4/12秒に丸め）。
- `/api/cron/check-jobs`: Soraの進捗をポーリング。`completed`なら`video_url`を保存し、スケジュール有効かつ`youtube`メタありで未アップロードならYouTubeへ投稿（完了済み未アップロードのリトライも実施）。`failed`はエラーを記録。

## 現行UIの仕様
- キャラクター: プロンプトのみ（画像リファレンスなし）。
- 動画: アクション（歌う/踊る/喋る/楽器演奏/behind-the-scenes/art/sport/cooking）、楽器選択、テーマ、アスペクト比(9:16 or 16:9)、長さ(4/8/12秒)。
- 音楽: ジャンル(pop/ballad/rock/folk/jazz/acoustic)、言語(英語/日本語)、歌詞（任意）。
- ランダム設定: アクション/楽器/テーマ/長さのみ候補から抽選。シャッフルボタンで現在フィールドに反映。キャラクター/アスペクト比/音楽は手動固定。
- スケジューラ: 有効トグル + 時刻2枠（slot1必須デフォルト09:00、slot2任意デフォルト18:00） + 公開設定（public/unlisted/private）。保存値はD1に永続化。
- 実行: 「今すぐ動画を生成」で即ジョブ作成（スケジュール有効/無効に関わらずYouTubeアップロードまで実施）。履歴表示UIは未実装。
- YouTubeボタン: `https://www.youtube.com/@4directionsApproachRecords` へ遷移。

## 主なエンドポイント
- ジョブ作成/取得: `POST /api/generate`, `GET /api/job/:jobId`
- スケジュール: `POST /api/save-schedule`, `GET /api/schedule`
- 設定保存: `POST /api/settings`, `GET /api/settings`
- 自動メタ生成: `POST /api/generate-youtube-settings`
- Cron: `/api/cron/run-schedule`, `/api/cron/process-jobs`, `/api/cron/check-jobs`
- YouTubeアップロード: `POST /api/youtube-upload`（Resumable Upload）
- 動画プロキシ: `GET /api/video/:videoId/content`
- デバッグ: `/api/debug/schedule-runs`, `/api/debug/jobs`
- OAuthワンタイム: `/oauth2callback`（YouTube Refresh Token取得用）

## 必要な環境変数 / Bindings（Cloudflare Pages）
- `OPENAI_API_KEY`: Sora-2用
- `DB`: D1バインディング
- `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN`: YouTube Data API v3用
- `TIMEZONE`（任意）: スケジュール判定に使用。未設定は`Asia/Tokyo`。

## 開発・デプロイ
```bash
git clone https://github.com/xerographix/youtuberGCP.git
cd youtuberGCP
npm install

# 開発（Vite）
npm run dev

# Cloudflare Pages Functionsローカル
npm run build
npm run dev:sandbox

# デプロイ（Pages）
npm run deploy
```

## 付属のローカルバックエンド
`backend/` に Express + better-sqlite3 の簡易APIサーバーがあります（開発時のローカルD1代替）。`npm install && npm run dev`で起動。.envには`GEMINI_API_KEY`を想定していますが、本番フローとは独立しています。

## ライセンス・更新情報
- ライセンス: Private Project
- Last Updated: 2025-12-08
- Version: ver 1.1.3（Cloudflare Pages 稼働中）
