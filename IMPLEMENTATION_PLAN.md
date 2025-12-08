# YouTube AI動画自動投稿システム - 実装計画

## 🎯 要件

### 必須機能
1. ✅ **管理UI**: キャラクター・動画・音楽設定
2. ✅ **YouTube設定自動生成**: タイトル・説明文・タグ
3. ✅ **スケジューラUI**: 1日最大4回の投稿時間設定
4. 🔄 **自動動画生成**: スケジュール実行 + 手動実行
5. 🔄 **YouTube自動投稿**: 生成後に自動アップロード

---

## 📋 実装フェーズ

### **Phase 1: サンドボックス環境で完成（現在）**

#### 使用技術
- **フロントエンド**: Hono + JSX + Tailwind CSS
- **バックエンド**: Express + Node.js
- **データベース**: D1 (ローカルSQLite)
- **動画生成**: GenSpark `video_generation` ツール（gemini/veo3.1）
- **YouTube投稿**: YouTube Data API v3
- **スケジューラ**: node-cron

#### 環境
- **場所**: GenSpark サンドボックス
- **稼働時間**: セッション中のみ（30分〜1時間）
- **用途**: 開発・テスト・デモ

#### 実装ステップ
1. ✅ D1データベース + マイグレーション
2. ✅ Express バックエンドAPI
3. ✅ フロントエンド UI 完成
4. ✅ YouTube設定自動生成
5. ✅ スケジューラUI
6. 🔄 **AI動画生成統合**（GenSparkツール）← **今ここ**
7. ⏳ YouTube Data API v3統合
8. ⏳ node-cron スケジューラ実装
9. ⏳ エンドツーエンドテスト

---

### **Phase 2: Cloudflare Pages本番環境へ移行（将来）**

#### 移行が必要な理由
- ❌ サンドボックスは30分〜1時間で停止
- ❌ GenSparkツールはサンドボックス専用
- ✅ 24時間稼働が必要
- ✅ 完全自動化が必要

#### 使用技術（変更点）
- **フロントエンド**: Hono + Cloudflare Pages（変更なし）
- **バックエンド**: Cloudflare Workers（Express から移行）
- **データベース**: Cloudflare D1（本番環境）
- **動画生成**: **外部API**（GenSparkツール → Replicate/Fal.ai）
- **YouTube投稿**: YouTube Data API v3（変更なし）
- **スケジューラ**: 外部Cron（cron-job.org）または Cloudflare Cron Triggers

#### 移行手順

##### 1. 動画生成API切り替え
**変更箇所**: `backend/server.js` の動画生成部分のみ（約50行）

**Before（サンドボックス）**:
```javascript
// GenSparkツール使用（サンドボックス専用）
const video = await gensparkVideoGeneration(prompt, config)
```

**After（本番環境）**:
```javascript
// 外部API使用（Replicate/Fal.ai）
const video = await replicateVideoGeneration(prompt, config)
```

**外部API候補**:
- **Replicate**: Runway Gen-3, Luma Dream Machine
  - 価格: 約$0.05/秒 = 8秒動画 約$0.40
  - 月120本: 約$48/月
- **Fal.ai**: 各種動画生成モデル
  - 同様の価格帯

##### 2. スケジューラ切り替え
**無料オプション**: cron-job.org
- APIエンドポイント `/api/scheduled-post` を定期的に呼び出す
- 完全無料

**有料オプション**: Cloudflare Cron Triggers
- $5/月
- ネイティブ統合

##### 3. デプロイ
```bash
# ビルド
npm run build

# Cloudflare Pagesにデプロイ
npx wrangler pages deploy dist --project-name youtube-ai-system
```

---

## 💰 コスト比較

### サンドボックス（Phase 1）
- **開発環境**: $0
- **動画生成**: $0（GenSparkツール）
- **YouTube投稿**: $0（API無料）
- **合計**: **$0/月**

### Cloudflare Pages本番環境（Phase 2）
- **Cloudflare Pages**: $0
- **Cloudflare D1**: $0（無料枠内）
- **外部Cron**: $0（cron-job.org）
- **動画生成API**: 約$48/月（120本）
- **YouTube投稿**: $0（API無料）
- **合計**: **約$48/月**

### 収益見込み
- **YouTubeショート収益**: 約$100/月（120本、収益化後）
- **純利益**: 約$52/月

---

## 📝 重要な注意事項

### サンドボックス環境の制限
1. **セッション寿命**: 30分〜1時間で自動終了
2. **プロセス**: すべて停止（PM2含む）
3. **データ**: ファイルは保存される、プロセスは停止
4. **用途**: 開発・テスト・短時間実行のみ

### GenSparkツールの制限
- **利用可能場所**: この会話内のみ
- **バックエンドから呼び出し**: 不可
- **本番環境**: 使用不可

### 移行時の変更箇所
- ✅ **UI**: 変更なし
- ✅ **データベース構造**: 変更なし
- ✅ **API設計**: 変更なし
- 🔄 **動画生成部分**: 約50行のみ変更
- 🔄 **スケジューラ**: node-cron → 外部Cron

---

## 🚀 次のアクション（Phase 1完成）

### 残りの実装
1. **AI動画生成統合**
   - GenSparkツールをバックエンドから呼び出す方法を実装
   - 手動トリガー + スケジュール実行

2. **YouTube Data API v3統合**
   - OAuth認証
   - 動画アップロード機能
   - メタデータ設定（タイトル・説明文・タグ）

3. **スケジューラ実装**
   - node-cron設定
   - 1日最大4回の自動実行
   - DB保存された設定を使用

4. **エンドツーエンドテスト**
   - 手動生成テスト
   - スケジュール実行テスト
   - YouTube投稿テスト

5. **GitHubにプッシュ**
   - 完成版をコミット
   - リポジトリ: https://github.com/xingyangJP/youtuber

---

## 📌 覚えておくこと

**サンドボックスで完成 → Cloudflare Pages移行**

このフローを忘れないこと！
