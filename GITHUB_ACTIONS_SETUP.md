# GitHub Actions ワークフロー設定ガイド

## ✅ 前提条件（完了済み）

- ✅ Cloudflare Access Service Token (CRONTOKEN) が設定済み
- ✅ Access Application (YoutuberPro) にService Token Policyが追加済み
- ✅ 全てのCronエンドポイントが動作確認済み

---

## 🎯 目的

GitHub Actionsで5分ごとに以下のエンドポイントを自動実行：
1. `/api/cron/run-schedule` - スケジュールチェック、ジョブ作成
2. `/api/cron/process-jobs` - ジョブ処理、動画生成
3. `/api/cron/check-jobs` - 完了確認、YouTube投稿

---

## 📋 手順1: ワークフローファイルを作成

GitHubリポジトリに以下のファイルを手動で作成してください：

**ファイルパス**: `.github/workflows/scheduled-video-jobs.yml`

**内容**:

```yaml
name: Scheduled Video Jobs

on:
  schedule:
    # 5分ごとに実行（UTC時間）
    - cron: '*/5 * * * *'
  workflow_dispatch:  # 手動実行も可能

jobs:
  call-cron:
    runs-on: ubuntu-latest
    
    steps:
      - name: Call Cron Endpoints
        env:
          BASE_URL: ${{ secrets.DEPLOY_URL || 'https://webapp-30w.pages.dev' }}
          CF_ACCESS_CLIENT_ID: ${{ secrets.CF_ACCESS_CLIENT_ID }}
          CF_ACCESS_CLIENT_SECRET: ${{ secrets.CF_ACCESS_CLIENT_SECRET }}
        run: |
          echo "Calling cron endpoints at ${BASE_URL}..."
          
          # 1. Schedule check and job creation
          echo "1. Running schedule..."
          curl -f -X GET "${BASE_URL}/api/cron/run-schedule?source=gha" \
            ${CF_ACCESS_CLIENT_ID:+-H "CF-Access-Client-Id: ${CF_ACCESS_CLIENT_ID}"} \
            ${CF_ACCESS_CLIENT_SECRET:+-H "CF-Access-Client-Secret: ${CF_ACCESS_CLIENT_SECRET}"}
          
          # 2. Process pending jobs
          echo "2. Processing jobs..."
          curl -f -X POST "${BASE_URL}/api/cron/process-jobs?source=gha" \
            ${CF_ACCESS_CLIENT_ID:+-H "CF-Access-Client-Id: ${CF_ACCESS_CLIENT_ID}"} \
            ${CF_ACCESS_CLIENT_SECRET:+-H "CF-Access-Client-Secret: ${CF_ACCESS_CLIENT_SECRET}"}
          
          # 3. Check and complete jobs
          echo "3. Checking jobs..."
          curl -f -X POST "${BASE_URL}/api/cron/check-jobs?source=gha" \
            ${CF_ACCESS_CLIENT_ID:+-H "CF-Access-Client-Id: ${CF_ACCESS_CLIENT_ID}"} \
            ${CF_ACCESS_CLIENT_SECRET:+-H "CF-Access-Client-Secret: ${CF_ACCESS_CLIENT_SECRET}"}
          
          echo "All cron jobs completed successfully!"
```

---

## 📋 手順2: GitHub Secrets を設定

1. GitHubリポジトリ（https://github.com/xingyangJP/youtuber）にアクセス
2. **Settings** → **Secrets and variables** → **Actions** をクリック
3. 以下の3つのSecretsを追加：

### 必須Secrets

| Secret Name | Value |
|------------|-------|
| `CF_ACCESS_CLIENT_ID` | `956d91e22bd7517b3a271251184986dc.access` |
| `CF_ACCESS_CLIENT_SECRET` | `72ced5b9677e6870a3057f7b32bbc53d631e22fdb79f2867a622bdf9cf8e7b8c` |
| `DEPLOY_URL` | `https://webapp-30w.pages.dev` |

### Secretsの追加方法

1. **New repository secret** をクリック
2. **Name** に上記の名前を入力
3. **Secret** に対応する値を入力
4. **Add secret** をクリック
5. 3つ全て繰り返す

---

## 📋 手順3: 手動テスト

Secretsを設定したら、手動でワークフローをテストします：

1. GitHubリポジトリの **Actions** タブに移動
2. 左サイドバーから **Scheduled Video Jobs** を選択
3. **Run workflow** ボタンをクリック
4. **Run workflow** を確認

### 期待される結果

- ✅ ワークフローが正常に完了（緑色のチェックマーク）
- ✅ ログに "All cron jobs completed successfully!" が表示
- ✅ エラーなし

### エラーが出る場合

- **403 Forbidden**: Secrets の値が間違っている
- **404 Not Found**: `DEPLOY_URL` が間違っている
- **curl: (22) The requested URL returned error**: エンドポイントのエラー（バックエンドログを確認）

---

## 🔄 自動実行の動作

ワークフローが正常に動作すれば、以下のように自動実行されます：

| 時刻（UTC） | 時刻（JST） | 動作 |
|-----------|-----------|------|
| 00:00 | 09:00 | スケジュールチェック、該当時刻ならジョブ作成 |
| 00:05 | 09:05 | ジョブ処理開始（Gemini API呼び出し） |
| 00:10 | 09:10 | 完了確認、YouTube投稿 |
| ... | ... | 5分ごとに繰り返し |

**重要**: スケジュール設定（`slot1_time`, `slot2_time`）と一致する時刻に動画生成が開始されます。

---

## 📊 現在のスケジュール設定

現在の設定（`/api/debug/schedule-runs`で確認済み）:

```json
{
  "enabled": 1,
  "slot1_enabled": 1,
  "slot1_time": "14:43",  // JST 14:43（UTC 05:43）
  "slot2_enabled": 1,
  "slot2_time": "23:00",  // JST 23:00（UTC 14:00）
  "privacy": "public"
}
```

### 実行タイミング

- **Slot 1**: 毎日 **JST 14:43**（UTC 05:43）
- **Slot 2**: 毎日 **JST 23:00**（UTC 14:00）

これらの時刻に自動的に動画生成ジョブが作成され、バックグラウンドで処理されます。

---

## 🔍 ワークフローのモニタリング

### GitHub Actionsログの確認

1. リポジトリの **Actions** タブ
2. **Scheduled Video Jobs** をクリック
3. 各実行をクリックしてログを確認

### ログで確認すべきポイント

- ✅ `1. Running schedule...` → スケジュールチェック成功
- ✅ `2. Processing jobs...` → ジョブ処理成功
- ✅ `3. Checking jobs...` → 完了確認成功
- ✅ `All cron jobs completed successfully!`

### エラー発生時の対処

- **Logs**: GitHub ActionsログでエラーメッセージをとCradle
- **Backend Logs**: Cloudflare Pages dashboardでWorkerログを確認
- **Database**: `/api/debug/schedule-runs` でジョブ状況を確認

---

## 🎯 完了チェックリスト

以下を全て確認してください：

- [ ] `.github/workflows/scheduled-video-jobs.yml` ファイルを作成した
- [ ] GitHub Secretsに3つの値を設定した
  - [ ] `CF_ACCESS_CLIENT_ID`
  - [ ] `CF_ACCESS_CLIENT_SECRET`
  - [ ] `DEPLOY_URL`
- [ ] 手動でワークフローを実行してテストした
- [ ] ワークフローが正常に完了した（緑色のチェックマーク）
- [ ] GitHub Actions ログにエラーがない

---

## 📞 トラブルシューティング

### 問題1: ワークフローが実行されない

**原因**: `.github/workflows/` ディレクトリの場所が間違っている

**解決策**: 
- リポジトリのルートに `.github/workflows/scheduled-video-jobs.yml` があるか確認
- GitHub App の `workflows` 権限が不足している場合、手動でWebから作成

### 問題2: "curl: (22) The requested URL returned error: 403"

**原因**: CF-Access認証が失敗

**解決策**:
1. GitHub Secretsの値を再確認（コピペミスがないか）
2. Cloudflare DashboardでService Tokenが有効か確認
3. Access Policyが正しく設定されているか確認

### 問題3: スケジュール時刻に動画が生成されない

**原因**: スケジュール設定とワークフロー実行のタイミングがずれている

**解決策**:
1. `/api/debug/schedule-runs` でスケジュール設定を確認
2. GitHub Actions実行時刻（UTC）とスケジュール時刻（JST）の変換を確認
3. ワークフローログで `run-schedule` の応答を確認

---

## 🎉 完了！

GitHub Actionsの設定が完了すれば、完全自動化された動画生成・YouTube投稿システムが稼働します！

**次回の自動実行**:
- 次のSlot 1実行: **JST 14:43**（毎日）
- 次のSlot 2実行: **JST 23:00**（毎日）

システムが正常に動作していることを確認するには：
- GitHub Actions → Scheduled Video Jobs の実行履歴
- `/api/debug/schedule-runs` でジョブ状況確認
- YouTubeチャンネルで動画投稿を確認

---

**重要な注意事項**:
- GitHub Actionsの無料枠: 月2,000分（5分ごと実行で十分）
- Cloudflare Pagesの無料枠: 月100,000リクエスト
- Gemini API quota: 使用状況をモニタリング

システムは完全に設定されています。お疲れ様でした！ 🚀
