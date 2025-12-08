# GCP移行メモ（未作成プロジェクト前提）

まだ GCP/Firebase プロジェクトは作成していない前提で、Cloud Run + Firestore + Cloud Scheduler + Secret Manager への初期セットアップ手順をまとめる。リージョンは東京（`asia-northeast1`）、Cron は5分刻み、1テナントあたり 2本/日の負荷を想定。

## 1. プロジェクト作成
- 新規プロジェクトを作成（IDは任意）。Billing 有効化。
- リージョン方針: 東京 (`asia-northeast1`) を優先。

## 2. 必要なAPIを有効化
- Cloud Run API
- Cloud Scheduler API
- Firestore API
- Secret Manager API
- Cloud Logging API（既定で有効な場合が多い）

## 3. サービスアカウント
- `cloud-run-sa`: Cloud Run 実行用。権限: `roles/run.invoker`（自己呼び出し用）、`roles/secretmanager.secretAccessor`。
- `scheduler-sa`: Cloud Scheduler 用。権限: `roles/run.invoker`、必要に応じ `roles/iam.serviceAccountTokenCreator`（OIDC 署名する場合）。
- デプロイ用に別途 `deploy-sa` を作る場合は `roles/run.admin`, `roles/iam.serviceAccountUser`, `roles/secretmanager.secretAccessor` を付与。

## 4. Secret Manager に保存する値
- `OPENAI_API_KEY`
- `YOUTUBE_CLIENT_ID`
- `YOUTUBE_CLIENT_SECRET`
- `YOUTUBE_REFRESH_TOKEN`
- `APP_CRYPTO_KEY`（アプリ内でSecretsを暗号化/復号する鍵）

Cloud Run 環境変数では Secret Manager の参照を設定する。

## 5. Firestore
- モード: Native。リージョン: `asia-northeast1`。
- コレクション例（`tenant_id` 付きで運用）:
  - `tenants`
  - `secrets`
  - `jobs`
  - `schedules`
  - `schedule_runs`
  - `settings`

## 6. Cloud Run デプロイ（概要）
1) Honoアプリをコンテナ化（Dockerfile 作成）。  
2) `gcloud builds submit --tag gcr.io/<PROJECT_ID>/webapp`  
3) `gcloud run deploy webapp --image gcr.io/<PROJECT_ID>/webapp --region asia-northeast1 --service-account cloud-run-sa --allow-unauthenticated`  
   - 公開範囲を絞る場合は `--allow-unauthenticated` を外し、Scheduler から OIDC で叩く。

## 7. Cloud Scheduler（5分刻み）
- ジョブ1: `/api/cron/run-schedule`
- ジョブ2: `/api/cron/process-jobs`
- ジョブ3: `/api/cron/check-jobs`
- ターゲット: Cloud Run HTTP。認証は OIDC（`scheduler-sa` を使用）推奨。

## 7.1 Secret Manager 登録例
```bash
gcloud secrets create OPENAI_API_KEY
echo -n "$OPENAI_API_KEY" | gcloud secrets versions add OPENAI_API_KEY --data-file=-
gcloud secrets create YOUTUBE_CLIENT_ID
echo -n "$YOUTUBE_CLIENT_ID" | gcloud secrets versions add YOUTUBE_CLIENT_ID --data-file=-
gcloud secrets create YOUTUBE_CLIENT_SECRET
echo -n "$YOUTUBE_CLIENT_SECRET" | gcloud secrets versions add YOUTUBE_CLIENT_SECRET --data-file=-
gcloud secrets create YOUTUBE_REFRESH_TOKEN
echo -n "$YOUTUBE_REFRESH_TOKEN" | gcloud secrets versions add YOUTUBE_REFRESH_TOKEN --data-file=-
gcloud secrets create APP_CRYPTO_KEY
echo -n "$APP_CRYPTO_KEY" | gcloud secrets versions add APP_CRYPTO_KEY --data-file=-
```

## 7.2 Cloud Run デプロイ例（Dockerfile.cloudrun 使用）
```bash
PROJECT_ID=your-project-id
REGION=asia-northeast1
SERVICE=webapp

# ビルド
gcloud builds submit --tag gcr.io/$PROJECT_ID/$SERVICE -f Dockerfile.cloudrun

# デプロイ（公開する場合の例。非公開にする場合は --allow-unauthenticated を外し、OIDCで叩く）
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

## 7.3 Cloud Scheduler 作成例（5分刻み / OIDC）
```bash
PROJECT_ID=your-project-id
REGION=asia-northeast1
SERVICE=webapp
SA=scheduler-sa@$PROJECT_ID.iam.gserviceaccount.com
BASE_URL=https://$REGION-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/$PROJECT_ID/services/$SERVICE:invoke

# run-schedule
gcloud scheduler jobs create http cron-run-schedule \
  --location=$REGION \
  --schedule="*/5 * * * *" \
  --uri="$BASE_URL/api/cron/run-schedule" \
  --http-method=GET \
  --oidc-service-account-email=$SA

# process-jobs
gcloud scheduler jobs create http cron-process-jobs \
  --location=$REGION \
  --schedule="*/5 * * * *" \
  --uri="$BASE_URL/api/cron/process-jobs" \
  --http-method=GET \
  --oidc-service-account-email=$SA

# check-jobs
gcloud scheduler jobs create http cron-check-jobs \
  --location=$REGION \
  --schedule="*/5 * * * *" \
  --uri="$BASE_URL/api/cron/check-jobs" \
  --http-method=GET \
  --oidc-service-account-email=$SA
```

## 8. 移行時の注意
- D1 → Firestore マイグレーションを先行し、既存データには `tenant_id=1` を付与。
- Secrets を Secret Manager に集約し、アプリの環境変数参照を切り替える。
- `/api/video/:id/content` など外部APIアクセスが許容されるよう Cloud Run の egress 設定を確認。

### D1 → Firestore 簡易移行スクリプト
- 位置: `scripts/migrate-d1-to-firestore.mjs`
- 必要環境変数:  
  - `D1_SQLITE_PATH`（例: `./.wrangler/state/v3/d1/miniflare-D1DatabaseObject/<hash>.sqlite`）  
  - `FIRESTORE_PROJECT_ID`（GCP プロジェクトID）  
  - `TENANT_ID`（任意、デフォルト1）  
  - `DRY_RUN`（`true` で書き込みしない。確認後 `false` で実行）
- 認証: `gcloud auth application-default login` または `GOOGLE_APPLICATION_CREDENTIALS` を設定。
- 実行例:  
  ```bash
  DRY_RUN=false \
  D1_SQLITE_PATH=./.wrangler/state/v3/d1/miniflare-D1DatabaseObject/xxxx.sqlite \
  FIRESTORE_PROJECT_ID=your-project-id \
  TENANT_ID=1 \
  node scripts/migrate-d1-to-firestore.mjs
  ```

## 9. コスト目安（1テナント/2本/日）
- インフラ（Cloud Run/Scheduler/Firestore/Secret Manager）は $1 未満〜数ドル程度に収まる想定。  
- 実コストの大半は OpenAI Sora の生成単価（例: $0.65/本なら約 $39/月）。
