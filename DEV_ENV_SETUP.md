# 開発環境構築ガイド（本番を壊さないためのおすすめ運用）

## 方針
- **リポジトリは1つ**（main=本番、dev/featureブランチで開発）。
- **Cloud Runサービスを2つ**作る：本番 `webapp`、開発検証 `webapp-stg`。デプロイ先のサービス名で環境を分離。
- **Cloud Scheduler/ジョブも2系統**：本番ジョブは本番URLだけを叩く、stgジョブは stg URL だけを叩く。
- **シークレット/環境変数も2セット**：Secret Manager で `prod-*` と `stg-*` を分け、Run にセットする環境変数名で切り替える。
- **Firestoreは別プロジェクトを推奨**：最も安全。どうしても同一プロジェクトなら `FIRESTORE_PROJECT_ID` と `COLLECTION_PREFIX`（例: dev_）で書き込みを隔離し、stg用 Scheduler は停止 or stg用に分離。
- **IAP/権限も分離**：stg は自分だけ許可。prod の IAP 設定は触らない。

## セットアップ手順（推奨パターン）
1) **Cloud Run (stg)**  
   - 新サービス `webapp-stg` を作成（同じリポからデプロイ）。  
   - 環境変数: `FIRESTORE_PROJECT_ID`（stg用）、`COLLECTION_PREFIX`（必要なら dev_）、stg用 Secret 名を設定。  
   - IAP で自分だけ許可。
2) **Secret Manager (stg用)**  
   - `stg-OPENAI_API_KEY`, `stg-YOUTUBE_CLIENT_ID`, `stg-YOUTUBE_CLIENT_SECRET`, `stg-YOUTUBE_REFRESH_TOKEN`, `stg-APP_CRYPTO_KEY` 等を作成。  
   - Cloud Run stg サービスアカウントにアクセス権付与。
3) **Cloud Scheduler (stg用)**  
   - `cron-run-schedule-stg`, `cron-process-jobs-stg`, `cron-check-jobs-stg` を作成し、ターゲットURLを `https://<webapp-stg-url>/api/cron/...` に設定。  
   - OIDC 認証は stg 用のスケジューラSA → stg Run に紐付ける。
4) **Firestore (推奨は別プロジェクト)**  
   - 可能なら stg 用 GCP プロジェクトを1つ用意し、そこに Firestore を作る。  
   - もし同一プロジェクトを使う場合は `COLLECTION_PREFIX` か `tenantId=dev` を徹底し、stg から本番データに触れないようコードと環境変数で隔離。
5) **デプロイフロー**  
   - 開発ブランチ → `webapp-stg` にデプロイ → stg でUI/ジョブ/YouTube投稿を確認。  
   - OKなら main にマージし、`webapp`（本番）にデプロイ。  
   - ロールバックは Cloud Run の過去リビジョンで即戻せるようリビジョン名をメモ。

## 運用チェックリスト
- デプロイ先サービス名（webapp か webapp-stg）を毎回確認。
- 参照する Secret 名が stg 用になっているか確認。
- Firestore の Project ID / Prefix が stg 用か確認。
- Scheduler が stg URL を叩いているか確認（本番ジョブに触らない）。
- IAP 許可ユーザーを stg と prod で分けているか確認。
