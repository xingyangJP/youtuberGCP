# デプロイ手順（GCP/Cloud Run + Firestore 版）

## 重要ルール（毎回遵守）
- ヘッダーのバージョン表記（`src/index.tsx` の `ver x.y.z`）は **デプロイのたびに +0.0.1 で更新** すること（例: 1.1.3 → 1.1.4）。
- `.env` はメモ置き場にしない。デプロイ前に不要なメモを削除し、実際に使う値のみを残す。秘密情報は Secret Manager に登録し、`.env` にはローカル確認用の最小限の値だけを記載する。

プロジェクト: `youtuber-480602`（リージョン: `asia-northeast1`）  
環境: Cloud Run（コンテナ）, Firestore(Native), Cloud Scheduler, Secret Manager  
前提: GCP/Firebase プロジェクトは未デプロイ状態。Cloudflare 依存を廃止。

## 0. 前提
- 1テナントあたり 2本/日、Cron 5分刻みで運用。
- UI/API は `npm run build` で生成される `dist/_worker.js` を Node (`server-node.mjs`) で起動。
- データストアは Firestore。D1 は使用しない。既存データがあれば `scripts/migrate-d1-to-firestore.mjs` で移行。
- 秘密情報は Secret Manager に集約（OpenAI/YouTube/暗号鍵）。

## 1. 下準備（ローカル）
```bash
# 依存インストール
npm install

# ビルド確認
npm run build
```

## 2. GCP リソース作成
```bash
PROJECT_ID=youtuber-480602
REGION=asia-northeast1

# 有効化
gcloud services enable run.googleapis.com cloudscheduler.googleapis.com firestore.googleapis.com secretmanager.googleapis.com logging.googleapis.com --project $PROJECT_ID

# Firestore 初期化（Native）
gcloud firestore databases create --region=$REGION --project=$PROJECT_ID

# サービスアカウント
gcloud iam service-accounts create cloud-run-sa --project=$PROJECT_ID
gcloud iam service-accounts create scheduler-sa --project=$PROJECT_ID

# 権限付与
gcloud projects add-iam-policy-binding $PROJECT_ID --member="serviceAccount:cloud-run-sa@$PROJECT_ID.iam.gserviceaccount.com" --role="roles/secretmanager.secretAccessor"
gcloud projects add-iam-policy-binding $PROJECT_ID --member="serviceAccount:scheduler-sa@$PROJECT_ID.iam.gserviceaccount.com" --role="roles/run.invoker"
```

## 3. Secret Manager 登録
```bash
echo -n "$OPENAI_API_KEY" | gcloud secrets create OPENAI_API_KEY --data-file=- --project $PROJECT_ID
echo -n "$YOUTUBE_CLIENT_ID" | gcloud secrets create YOUTUBE_CLIENT_ID --data-file=- --project $PROJECT_ID
echo -n "$YOUTUBE_CLIENT_SECRET" | gcloud secrets create YOUTUBE_CLIENT_SECRET --data-file=- --project $PROJECT_ID
echo -n "$YOUTUBE_REFRESH_TOKEN" | gcloud secrets create YOUTUBE_REFRESH_TOKEN --data-file=- --project $PROJECT_ID
echo -n "$APP_CRYPTO_KEY" | gcloud secrets create APP_CRYPTO_KEY --data-file=- --project $PROJECT_ID
```

## 4. コンテナビルド & デプロイ（Cloud Run）
```bash
SERVICE=webapp

# ビルド
gcloud builds submit --tag gcr.io/$PROJECT_ID/$SERVICE -f Dockerfile.cloudrun --project $PROJECT_ID

# デプロイ（必要なら --no-allow-unauthenticated に変える）
gcloud run deploy $SERVICE \
  --image gcr.io/$PROJECT_ID/$SERVICE \
  --region $REGION \
  --service-account cloud-run-sa@$PROJECT_ID.iam.gserviceaccount.com \
  --port 8080 \
  --allow-unauthenticated \
  --set-secrets \
    OPENAI_API_KEY=OPENAI_API_KEY:latest,\
    YOUTUBE_CLIENT_ID=YOUTUBE_CLIENT_ID:latest,\
    YOUTUBE_CLIENT_SECRET=YOUTUBE_CLIENT_SECRET:latest,\
    YOUTUBE_REFRESH_TOKEN=YOUTUBE_REFRESH_TOKEN:latest,\
    APP_CRYPTO_KEY=APP_CRYPTO_KEY:latest
```

## 5. Cloud Scheduler（5分刻み）
```bash
SA=scheduler-sa@$PROJECT_ID.iam.gserviceaccount.com
BASE_URL="https://$REGION-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/$PROJECT_ID/services/$SERVICE:invoke"

gcloud scheduler jobs create http cron-run-schedule \
  --location=$REGION --schedule="*/5 * * * *" \
  --uri="$BASE_URL/api/cron/run-schedule" \
  --http-method=GET \
  --oidc-service-account-email=$SA

gcloud scheduler jobs create http cron-process-jobs \
  --location=$REGION --schedule="*/5 * * * *" \
  --uri="$BASE_URL/api/cron/process-jobs" \
  --http-method=GET \
  --oidc-service-account-email=$SA

gcloud scheduler jobs create http cron-check-jobs \
  --location=$REGION --schedule="*/5 * * * *" \
  --uri="$BASE_URL/api/cron/check-jobs" \
  --http-method=GET \
  --oidc-service-account-email=$SA
```

## 6. データ移行（任意）
- スクリプト: `scripts/migrate-d1-to-firestore.mjs`  
- 実行例:
```bash
DRY_RUN=false \
D1_SQLITE_PATH=./.wrangler/state/v3/d1/miniflare-D1DatabaseObject/xxxx.sqlite \
FIRESTORE_PROJECT_ID=$PROJECT_ID \
TENANT_ID=1 \
node scripts/migrate-d1-to-firestore.mjs
```

## 7. 動作確認
```bash
curl https://<CloudRunURL>/health    # ヘルスチェック
curl -X POST https://<CloudRunURL>/api/generate -d '{}' -H "Content-Type: application/json"
```

## 8. 注意事項
- Firestoreクエリで orderBy + filter を使う箇所があります。必要に応じて提示されるURLからインデックスを作成してください。
- `server-node.mjs` は Cloudflare Pages 用ビルド（`dist/_worker.js`）を Node で起動する暫定エントリです。必要に応じてネイティブな Node 実装に差し替え可能です。
- デプロイ先ミス防止のため、`PROJECT_ID=youtuber-480602` を明示してコマンドを実行してください。
