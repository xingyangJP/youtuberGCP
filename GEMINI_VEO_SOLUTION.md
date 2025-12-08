# ✅ Gemini Veo 3.1 API実装プラン

## 🎯 解決策: Google Gemini API (公式)

**完全無料枠で実装可能** (無料枠超過後も低コスト)

---

## 📊 Gemini API価格 (2025年最新)

### 無料枠 (Free Tier)
- **1,500リクエスト/日**
- **制約**: レート制限あり

### 有料プラン価格
- **Veo 3.1 Fast**: $0.40/秒 (音声込み)
- **Veo 3.1 Standard**: $0.75/秒 (音声込み)

### 月間コスト試算 (120本 x 8秒)

| プラン | 1本あたり | 120本/月 | 備考 |
|--------|----------|----------|------|
| **Veo 3.1 Fast** | $3.20 | **$384/月** | 推奨 |
| Veo 3.1 Standard | $6.00 | $720/月 | 高品質 |

**重要**: 1日1本 (30本/月) なら約**$96/月**

---

## 💡 実装方針

### Phase 1: サンドボックスで完成 (現在)
- ✅ UI/API設計完了
- ✅ D1データベース準備完了
- ✅ バックエンドAPI実装済み
- 🔜 Gemini API統合 (JavaScript SDK)

### Phase 2: Cloudflare Pages移行
- Cloudflare Workers環境で稼働
- Gemini API直接呼び出し
- 外部Cron (無料) でスケジュール実行
- **追加コスト: $384/月のみ** (動画生成API)

---

## 🚀 Gemini API実装コード

### 必要なパッケージ
```bash
npm install @google/genai
```

### 環境変数
```bash
# .dev.vars (ローカル開発)
GEMINI_API_KEY=your_gemini_api_key

# Cloudflare Pages (本番環境)
npx wrangler pages secret put GEMINI_API_KEY --project-name youtube-ai-video-system
```

### バックエンド実装例 (Node.js)
```javascript
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

// 動画生成API
app.post('/api/generate', async (req, res) => {
  const { character, video, music, youtubeSettings } = req.body;
  
  // プロンプト構築
  const prompt = buildVideoPrompt(character, video, music);
  
  try {
    // Veo 3.1 Fast で動画生成
    let operation = await ai.models.generateVideos({
      model: 'veo-3.1-generate-preview',
      prompt: prompt,
      config: {
        aspectRatio: video.aspectRatio, // '9:16' or '16:9'
        durationSeconds: parseInt(video.duration), // 4, 6, 8
        resolution: '720p'
      }
    });
    
    // ポーリング (動画生成完了まで待機)
    while (!operation.done) {
      console.log('動画生成中...');
      await new Promise(resolve => setTimeout(resolve, 10000)); // 10秒待機
      operation = await ai.operations.getVideosOperation({
        operation: operation
      });
    }
    
    // 動画ダウンロードURL取得
    const videoUrl = operation.response.generatedVideos[0].video.uri;
    
    // D1データベースに保存
    const result = await db.prepare(`
      INSERT INTO videos (
        character_prompt, video_settings, music_settings,
        youtube_title, youtube_description, youtube_tags,
        video_url, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'completed', datetime('now'))
    `).bind(
      JSON.stringify(character),
      JSON.stringify(video),
      JSON.stringify(music),
      youtubeSettings.title,
      youtubeSettings.description,
      youtubeSettings.tags,
      videoUrl
    ).run();
    
    res.json({
      success: true,
      videoId: result.meta.last_row_id,
      videoUrl: videoUrl
    });
    
  } catch (error) {
    console.error('動画生成エラー:', error);
    res.status(500).json({ error: 'Video generation failed' });
  }
});

// プロンプト構築ヘルパー関数
function buildVideoPrompt(character, video, music) {
  const actionMap = {
    'singing': '歌っている',
    'playing': '演奏している'
  };
  
  const instrumentMap = {
    'acoustic-guitar': 'アコースティックギター',
    'electric-guitar': 'エレクトリックギター',
    'piano': 'ピアノ',
    'drums': 'ドラム'
  };
  
  let prompt = '';
  
  // キャラクター設定
  if (character.mode === 'prompt') {
    prompt += character.prompt;
  } else {
    prompt += `画像の人物`;
  }
  
  // アクション
  prompt += `が${actionMap[video.action]}`;
  
  // 楽器
  if (video.instrument) {
    prompt += `${instrumentMap[video.instrument]}で`;
  }
  
  // テーマ
  prompt += `${video.theme}をテーマにした${music.genre}音楽の動画。`;
  
  // 品質指定
  prompt += `プロフェッショナルなミュージックビデオクオリティ、${video.duration}秒。`;
  
  return prompt;
}
```

---

## 📋 実装手順

### ステップ1: Gemini APIキー取得
1. https://aistudio.google.com/apikey にアクセス
2. 「Create API Key」をクリック
3. APIキーをコピー

### ステップ2: サンドボックスで統合テスト
```bash
# 依存関係インストール
cd /home/user/webapp/backend
npm install @google/genai

# 環境変数設定
echo "GEMINI_API_KEY=your_api_key" > .env

# バックエンド再起動
pm2 restart backend
```

### ステップ3: 動画生成テスト
```bash
curl -X POST http://localhost:3001/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "character": {
      "mode": "prompt",
      "prompt": "A young Spanish woman with pale skin"
    },
    "video": {
      "action": "singing",
      "instrument": "acoustic-guitar",
      "theme": "hope",
      "aspectRatio": "9:16",
      "duration": "8"
    },
    "music": {
      "genre": "pop",
      "language": "english"
    },
    "youtubeSettings": {
      "title": "AI Hope Song",
      "description": "AI generated pop ballad",
      "tags": "AI, music, hope"
    }
  }'
```

### ステップ4: Cloudflare Pages移行
```bash
# wrangler.tomlにシークレット追加
npx wrangler pages secret put GEMINI_API_KEY --project-name youtube-ai-video-system

# デプロイ
npm run deploy
```

---

## 💰 最終コスト見積もり

| 項目 | 月間コスト | 備考 |
|------|-----------|------|
| **Cloudflare Pages** | $0 | 完全無料 |
| **Cloudflare D1** | $0 | 無料枠内 |
| **外部Cron** | $0 | cron-job.org |
| **YouTube Data API** | $0 | 無料 |
| **Gemini Veo 3.1 Fast** | **$384/月** | 120本 x 8秒 |
| **合計** | **$384/月** | 動画生成のみ |

### コスト削減案
- **1日1本運用**: 約$96/月
- **週1本運用**: 約$24/月
- **テスト期間**: 必要な時だけ生成

---

## 🎯 次のステップ

1. ✅ Gemini APIキー取得
2. 🔜 バックエンドに`@google/genai`統合
3. 🔜 動画生成エンドポイント実装
4. 🔜 サンドボックスでE2Eテスト
5. 🔜 Cloudflare Pages移行

---

## どうしますか?

**A) 今すぐGemini API統合を開始** (推奨)
**B) まずAPIキー取得のサポートが必要**
**C) コスト削減案を検討したい**
