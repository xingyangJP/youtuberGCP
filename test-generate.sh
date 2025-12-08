#!/bin/bash
# Gemini Veo 3.1 動画生成テスト

echo "🎬 動画生成テスト開始..."

curl -X POST http://localhost:3001/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "character": {
      "mode": "prompt",
      "prompt": "A young Spanish woman with pale skin and an oriental atmosphere"
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
    "youtube": {
      "title": "【AI生成】hopeのポップ | アコースティックギター歌っている動画",
      "description": "この動画はAIによって自動生成されました。",
      "tags": "AI生成, AI音楽, ポップ, hope, アコースティックギター, Shorts, 英語"
    }
  }' | jq .

echo ""
echo "✅ テスト完了"
