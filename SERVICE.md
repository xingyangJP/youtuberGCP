# SERVICE化ロードマップ（マルチテナント対応）＋ GCP/Firebase への移管計画

Cloudflare 依存（Pages Functions + GitHub Actions Cron）を廃止し、GCP もしくは Firebase に移管する前提での改訂版です。マルチテナント化の要件は維持しつつ、Cron を Cloud Scheduler 等に統合し、秘密情報を Secret Manager で集中管理します。

## 前提（今回の移行）
- 想定負荷: 1テナントあたり 2本/日 程度の生成・投稿。
- Cron 間隔: 現行の 5分刻みを踏襲（Cloud Scheduler で実施）。
- リージョン: 東京 (`asia-northeast1`)。
- レポート/集計: 最低限（CRUDベース、重い分析なし）。

## 推奨インフラの選択肢と判断

### 推奨: GCP (Cloud Run + Cloud Scheduler + Firestore + Secret Manager) （完了・運用中）
- **理由**: Cron を Cloud Scheduler に一本化でき、Cloud Run で Hono/SSR をそのままコンテナ稼働。スケール・権限管理が柔軟で、マルチテナント拡張やIP制限も組みやすい。
- **構成**: Cloud Run (コンテナ化した Hono アプリ) / Firestore / Cloud Scheduler（3本のエンドポイントを叩く）/ Secret Manager（OpenAI/YouTube鍵、暗号キー）/ Cloud Logging。
- **メリット**: GitHub Actions から Cron を解放、Secret 管理が一元化、VPC-SC/Private Service Connect 等で将来的なセキュリティ強化が可能。

### 代替: Firebase (Functions + Hosting + Scheduler + Firestore + Secret Manager)
- **理由**: マネージド度を優先するなら Firebase。Functions で HTTP エンドポイントをそのまま公開し、Firebase Scheduler で Cron 呼び出し。デプロイと権限管理が簡便。
- **構成**: Firebase Hosting (UI配信) + Cloud Functions for Firebase (API/Cron) + Firestore + Firebase Scheduler + Secret Manager。
- **注意**: Functions の起動レイテンシとランタイム制約に留意。マルチテナント/重い処理が増えると Cloud Run の方が予測しやすい。

結論: **運用柔軟性と今後のマルチテナント拡張を優先するなら GCP (Cloud Run) を第一候補**。セットアップの簡便さを優先する小規模運用なら Firebase でも可。データストアはシンプルな CRUD と少量集計で足りるため Firestore を推奨（Cloud SQL は不要）。

## To-Be アーキテクチャ（GCP案・Firestore） （完了）
- **Compute**: Cloud Run (Hono SSR + API をコンテナ化)  
  - 既存の Pages Functions のハンドラを Node ランタイムで稼働させる。`/api/*` と `/` SSR を1サービスで提供。
- **Storage**: Firestore (Native)  
  - テナント分離は `tenant_id` フィールド or ドキュメントルート分割で実装。SQL要件がないため Cloud SQL は使わない前提。
- **Cron**: Cloud Scheduler → Cloud Run HTTP (認証付き)  
  - エンドポイント: `/api/cron/run-schedule`, `/api/cron/process-jobs`, `/api/cron/check-jobs` を1～3分間隔で呼び出す。
- **Secrets**: Secret Manager  
  - OpenAI(Sora)、YouTube、暗号化キー(KMS)、OAuthクライアントなどを格納。Cloud Run サービスアカウントにアクセス権付与。
- **Logging/Monitoring**: Cloud Logging + Error Reporting + Metrics (optional Cloud Trace/Profiler)。
- **IAM**: サービスアカウントを Cloud Scheduler / Cloud Run / Secret Manager で役割分離。将来的にテナント別キーで KMS を使う場合も拡張容易。

## To-Be アーキテクチャ（Firebase案・簡略）
- Hosting で静的配信、Functions(HTTP) に Hono を載せるか、Functions を API 専用にし UI は Hosting/SSR。  
- Firestore でデータ保持、Firebase Scheduler で Cron。  
- Secret Manager で鍵管理（Functions から参照）。  
- 初期導入が簡単だが、長期運用の柔軟性は Cloud Run > Functions。

## マルチテナント対応の方針（維持）
- `tenant_id` を全テーブル/コレクションに追加し、スーパーアドミンが発行・管理。  
- テナントごとに Sora / YouTube キーを Secret Manager で暗号化保持（アプリ側キーで復号）。  
- `tenant_id=1` をデフォルトテナントとして既存運用を継続可能にする。

## 具体的な移行ステップ（Cloud Run 案ベース）
0. **GCP プロジェクト初期化（未作成のため追加）**  
   - GCP プロジェクト新規作成（リージョン: 東京 `asia-northeast1` 前提）。  
   - APIs 有効化: Cloud Run, Cloud Scheduler, Firestore, Secret Manager, Cloud Logging。  
   - サービスアカウント作成: `cloud-run-sa`（Run 実行）、`scheduler-sa`（Scheduler 呼び出し）、必要に応じてデプロイ用 `deploy-sa`。（完了）  
   - Secret Manager に鍵を登録: `OPENAI_API_KEY`, `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN`, `APP_CRYPTO_KEY`(暗号化鍵)。（完了）
1. **データ移行**  
   - D1 → Firestore へ移行。`jobs/schedules/settings/schedule_runs` に `tenant_id` を追加し、既存データは `tenant_id=1` で投入。（完了・単一テナント運用）  
   - マイグレーションスクリプトを作成（Node or Bash + gcloud/firestore-importer）。（完了）
2. **アプリ移行**  
   - Hono アプリを Node ランタイムでコンテナ化（Dockerfile作成）。（完了）  
   - Cloud Run にデプロイし、環境変数を Secret Manager 参照に切替（`OPENAI_API_KEY` 等）。（完了）  
   - `/api/video/:id/content` など外部APIアクセスが許容されるよう Egress 設定を確認。（完了）
3. **Cron 移行**  
   - GitHub Actions のスケジューラを停止。（完了）  
   - Cloud Scheduler で 3エンドポイントを **5分間隔** でHTTP呼び出し（OIDC署名 or APIキーで認証）。（完了）
4. **認証/権限**  
   - ログイン/テナント管理を Cloud Run サービスで提供（JWT / Cookie）。（未）  
   - スーパーアドミン UI を別ルート or 同一サービスに追加。（未）
5. **シークレット・鍵管理**  
   - Secret Manager に Sora/YouTube鍵と暗号化キー。（完了）  
   - Firestore 保存用の暗号化ヘルパーを実装（AES-GCM）。（未）
6. **監視/運用**  
   - Cloud Logging で Cron 実行とジョブ処理を可観測化。（完了）  
   - Error Reporting を有効化し、YouTube/Soraの失敗を通知（Opsgenie/Slack連携は任意）。（未）

## スキーマ/コレクション案（Firestore）
- `tenants`: { name, login_id, password_hash, role, created_at, updated_at }  
- `secrets`: { tenant_id, sora_api_key_enc, youtube_client_id_enc, youtube_client_secret_enc, youtube_refresh_token_enc, updated_at }  
- `jobs`: { tenant_id, job_id, status, prompt, config, video_url, error_message, created_at, started_at, completed_at }  
- `schedules`: { tenant_id, enabled, slot1_enabled, slot1_time, slot2_enabled, slot2_time, privacy, updated_at }  
- `schedule_runs`: { tenant_id, slot, run_date, created_at }  
- `settings`: { tenant_id, data, updated_at }

## セキュリティとレート制限
- Secret Manager + KMS で秘密情報を保護し、平文を Firestore/SQL に置かない。  
- ログに鍵やトークンを出さない。  
- ログイン/API 設定変更にレートリミットを追加。  
- Cloud Scheduler → Cloud Run は OIDC 認証で保護。

## 運用ガイド（サマリ）
- デプロイ: Cloud Build or GitHub Actions から Cloud Run にコンテナデプロイ。  
- Cron: Cloud Scheduler で 3 本の HTTP ジョブを設定。  
- 鍵登録: Secret Manager に Sora/YouTube、アプリ暗号鍵を保存。  
- データ保守: Firestore バックアップ（Managed Export/Import）を定期実行。  
- テナント運用: スーパーアドミンがテナント作成・キー登録・無効化を UI から実施。

## マルチテナント改訂計画（インフラ共用・テナント分離のみ）
インフラは共用（Cloud Run + Firestore + Secret Manager + Scheduler/IAP）。テナント単位で鍵とデータを分離し、スーパーアドミンが顧客ごとに鍵セットを登録する。

### 要件
- テナントユーザー: 既存機能（キャラクター設定／動画内容設定／音楽設定／投稿スケジューラ／今すぐ生成）をそのまま利用。
- スーパーアドミン: 顧客ごとに YouTube OAuth/リフレッシュトークン、OpenAI API Key を登録・更新・無効化できる管理画面が必要。
- インフラ分離なし: 1 プロジェクト内でテナントごとに論理分離（Firestore パーティション + Secret Manager 名称分け）。

### 仕様概要
- テナント識別: `tenantId` をリクエストに必須付与。IAP Principal（メール）→ テナントの紐付けテーブルで解決して自動付与も可。
- データ分離: Firestore コレクションを `tenants/{tenantId}/...` とし、settings/jobs/schedules など既存データをパーティション。
- 鍵管理: Secret Manager にテナントごとに `tenants-{tenantId}-openai-key` / `tenants-{tenantId}-youtube-refresh` などで保存。Firestore には Secret 名のみ保持。暗号化フィールド運用の場合は `APP_CRYPTO_KEY` で復号。
- OAuth: `/oauth2callback` の state に `tenantId` を入れ、取得したリフレッシュトークンを当該テナントの Secret に保存。
- ジョブ/スケジューラ: 既存の 3 本の Scheduler はそのまま。実行時に全テナントをループし、テナント鍵をロードして処理。テナント未設定や鍵欠損はスキップ＋ジョブエラーに記録。
- 権限: IAP で入れるユーザーを制御。アプリ内で IAP Principal→テナント紐付けをチェックし、テナント外アクセスは 403。

### 実装ステップ
1. スキーマ拡張  
   - Firestore を `tenants/{tenantId}/settings|schedule|jobs` 構造に変更。既存データを `tenants/default` へ移行。
2. API 改修  
   - `/api/settings` / `/api/save-schedule` / ジョブ生成系に `tenantId` 必須化。クエリに `where('tenantId','==',...)` を追加。
3. 秘密情報管理  
   - Secret Manager 名称をテナント別に再設計。スーパーアドミン UI から登録・更新・無効化を行い、アプリは Secret 名を Firestore から解決して取得。
4. OAuth フロー  
   - state に `tenantId` を入れてリダイレクト。取得トークンをテナント Secret に保存。テナントごとに別の YouTube チャンネルへ投稿可。
5. OpenAI Key 切替  
   - リクエストコンテキストの `tenantId` から OpenAI Key を取得し、SDK を初期化。未設定ならエラー応答。
6. 管理画面（スーパーアドミン）  
   - テナント一覧・作成・無効化  
   - 鍵状態表示（マスク）と登録/更新/削除  
   - テスト投稿/テスト生成ボタン（当該テナント鍵で動作確認）  
7. UI 改修（テナントユーザー向け）  
   - 現行画面にテナントコンテキストを保持（hidden/ラベル表示）。IAP メールとテナント紐付けで自動選択可。  
8. ロギング/デバッグ  
   - Debug Info に `tenantId`、使用した鍵の有無、ジョブエラーを表示。ログにも `tenantId` を付与。

### 追加で決めたいこと
- テナントとユーザーの紐付け方法: IAP メールをキーにするか、別途アプリ内アカウントを発行するか。
- テナントの作成/無効化フロー: 招待リンク or 手動登録のみか。
- レート制御/コスト分離: テナントごとに利用上限やメータリングを行うか。
