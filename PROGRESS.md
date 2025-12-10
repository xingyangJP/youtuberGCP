## 2025-12-06

- 投稿スケジューラのUIを常時表示に変更（トグル廃止）。投稿時間1/2とも個別有効化のチェックを設け、保存・復元できるようD1スキーマを保証。
- ランダム設定の候補（アクション/楽器/長さ/テーマ）の保存・復元ロジックを強化。ロード順の整合性と保存時のスコープエラーを解消。
- YouTubeメタデータ生成を短縮・安全化（タイトル/タグ上限処理、undefined参照修正）。本番にデプロイ済み（main）。

## 2025-12-08

- ストレージをCloudflare D1からFirestoreへ移行する実装に差し替え（jobs/schedules/settings/schedule_runsをFirestore CRUDに変更）。Cron系もFirestoreベースに更新。
- Cloud Run用のNodeエントリ（server-node.mjs）を追加し、`npm run start:cloudrun` で dist/_worker.js を起動可能に。wrangler依存はデプロイ時に不要。
- GCP向けデプロイ手順/Secret登録/Cloud Scheduler設定をDEPLOY.mdに刷新。Dockerfile.cloudrun 追加。
- npm audit fix --force を実施し wrangler 4.53.0 に更新、脆弱性0件。npm run build 成功。

取得
client_secret_95388533498-0lhg4qgsifaq1n2gt794ejbegjv4jaif.apps.googleusercontent.com.json

### 次のステップ（まだ未実行）
- Secret Manager に本番シークレットを登録: OPENAI_API_KEY / YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET / YOUTUBE_REFRESH_TOKEN / APP_CRYPTO_KEY
- Cloud Run へデプロイ（PROJECT_ID=youtuber-480602, REGION=asia-northeast1, SERVICE=webapp）
- Cloud Scheduler を5分刻みで3本作成（/api/cron/run-schedule, /api/cron/process-jobs, /api/cron/check-jobs）
- Firestoreインデックスが要求されたら提示URLから作成

## 2025-12-09

- YouTube投稿先をブランドチャンネルで固定するためリフレッシュトークンを再発行（複数回）し、Secret更新→Cloud Run再デプロイ（最新リビジョン webapp-00050-9nt）。二重投稿を防ぐためフロント側のアップロード処理を停止し、サーバ側のみでアップロード。
- プロンプト生成を強化（アクションを明示、カメラフレーミング指定、歌詞項目を非表示/送信停止）。バージョン表記を 1.1.12 に更新。
- Cloud Scheduler の URI/audience を Cloud Run 実行URLに修正し、`cron-*` ジョブが成功する状態に復旧。OpenAI動画URL 404 でのリトライ失敗ログを確認（旧ジョブ残骸によるもの）。
- スケジューラ・手動生成とも Firestore/Firestoreインデックスは整備済み。デバッグ情報を拡充（Job/Cronステータス、YouTube Upload 状況表示）。
