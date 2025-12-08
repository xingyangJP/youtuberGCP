# YouTube自動投稿までの残作業

## ✅ 完了済み

1. ✅ Cloudflare Pages デプロイ
2. ✅ D1 Database 設定（webapp-production）
3. ✅ Cloudflare Access Service Token 設定
4. ✅ Access Policy 設定（CRONTOKENをYoutuberProアプリに追加）
5. ✅ 全Cronエンドポイント動作確認（HTTP 200）
6. ✅ スケジュール設定（Slot1: 16:55 JST, Slot2: 23:00 JST）

---

## 🔧 残作業（3つ）

### **作業1: GitHub Actions ワークフローファイルを作成**

#### 手順：
1. https://github.com/xingyangJP/youtuber にアクセス
2. リポジトリのルートに `.github/workflows/scheduled-video-jobs.yml` を作成
3. 以下の内容を貼り付け：

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

4. ファイルをコミット

---

### **作業2: GitHub Secrets を設定**

#### 手順：
1. https://github.com/xingyangJP/youtuber にアクセス
2. **Settings** → **Secrets and variables** → **Actions** をクリック
3. 以下の3つのSecretsを追加：

| Secret Name | Value |
|------------|-------|
| `CF_ACCESS_CLIENT_ID` | `956d91e22bd7517b3a271251184986dc.access` |
| `CF_ACCESS_CLIENT_SECRET` | `72ced5b9677e6870a3057f7b32bbc53d631e22fdb79f2867a622bdf9cf8e7b8c` |
| `DEPLOY_URL` | `https://webapp-30w.pages.dev` |

#### 各Secretの追加方法：
1. **New repository secret** をクリック
2. **Name** に上記の名前を入力
3. **Secret** に対応する値を貼り付け
4. **Add secret** をクリック
5. 3つ全て繰り返す

---

### **作業3: 手動テストして動作確認**

#### 手順：
1. GitHubリポジトリの **Actions** タブに移動
2. 左サイドバーから **Scheduled Video Jobs** を選択
3. **Run workflow** ボタンをクリック
4. **Run workflow** を確認して実行

#### 期待される結果：
- ✅ ワークフローが正常に完了（緑色のチェックマーク）
- ✅ ログに以下が表示される：
  ```
  1. Running schedule...
  2. Processing jobs...
  3. Checking jobs...
  All cron jobs completed successfully!
  ```

#### もし現在時刻がスケジュール時刻（16:55または23:00）でない場合：
- `"No slots due at [現在時刻]"` と表示される → **正常**
- スケジュール時刻になると自動的に動画生成が開始される

---

## 📊 現在の設定

### スケジュール設定（確認済み）
```json
{
  "enabled": true,
  "slot1Enabled": true,
  "time": "16:55",      // JST 16:55（UTC 07:55）
  "slot2Enabled": true,
  "time2": "23:00",     // JST 23:00（UTC 14:00）
  "privacy": "public"
}
```

### Cloudflare Pages Secrets（設定済み）
- ✅ `CF_ACCESS_CLIENT_ID`
- ✅ `CF_ACCESS_CLIENT_SECRET`
- ✅ `GEMINI_API_KEY`
- ✅ `YOUTUBE_CLIENT_ID`
- ✅ `YOUTUBE_CLIENT_SECRET`
- ✅ `YOUTUBE_REFRESH_TOKEN`

### Access Policy（設定済み）
- ✅ Application: YoutuberPro (webapp-30w.pages.dev)
- ✅ Policy: Cron API Access (bypass)
- ✅ Service Token: CRONTOKEN

---

## 🚀 自動投稿の動作フロー

### 毎日のスケジュール実行：

**Slot 1: 毎日 16:55 JST**
```
16:55 JST → GitHub Actions実行
    ↓
/api/cron/run-schedule が新しいジョブを作成
    ↓
/api/cron/process-jobs がGemini API呼び出し（5-8分）
    ↓
動画生成完了
    ↓
/api/cron/check-jobs が完了を確認
    ↓
YouTube Data API v3 で自動投稿
    ↓
完了！
```

**Slot 2: 毎日 23:00 JST**
```
同じフロー
```

---

## 🧪 テスト方法

### すぐにテストしたい場合：

**方法1: UIから手動生成（推奨）**
1. https://webapp-30w.pages.dev/ にアクセス
2. ログイン（Cloudflare Access認証）
3. 「Generate Video」ボタンをクリック
4. 動画生成完了後、自動的にYouTubeに投稿される

**方法2: スケジュール時刻を変更**
1. UIでSlot1の時刻を「現在時刻+2分」に設定
2. 保存
3. GitHub Actionsが5分以内に実行される
4. 設定した時刻になると動画生成が開始される

---

## ⚠️ 重要な注意事項

### 1. スケジュール時刻とUTC変換
- JST 16:55 = UTC 07:55
- JST 23:00 = UTC 14:00
- GitHub Actionsのcronは**UTC時間**で動作

### 2. API Quota管理
- **Gemini API**: 使用量をモニタリング
- **YouTube Data API**: 1日のquota制限を確認
- **GitHub Actions**: 月2,000分まで無料

### 3. エラー監視
- **GitHub Actions** → Actionsタブでログ確認
- **Cloudflare Pages** → Workers Logsでエラー確認
- **Database** → `/api/debug/schedule-runs` でジョブ状況確認

---

## 📞 完了後の確認

全ての作業が完了したら：

1. ✅ GitHub Actions → Scheduled Video Jobsが存在する
2. ✅ GitHub Secrets に3つの値が設定されている
3. ✅ 手動実行でワークフローが成功する
4. ✅ 次のスケジュール時刻（16:55または23:00 JST）を待つ
5. ✅ YouTubeチャンネルで動画が自動投稿されることを確認

---

## 🎉 完了！

上記3つの作業を完了すれば、**完全自動化されたYouTube動画生成・投稿システム**が稼働します！

**質問があれば教えてください！**
