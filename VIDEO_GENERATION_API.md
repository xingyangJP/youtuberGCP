# Video Generation API

このサンドボックス環境では、AIアシスタントが直接video_generationツールを使用します。

## 実装方法

1. フロントエンドから `/api/generate` を呼び出す
2. バックエンドがプロンプトを構築してファイルに保存
3. AIアシスタントがファイルを監視
4. 新しいプロンプトを検出したら video_generation を実行
5. 生成した動画をダウンロードして保存
6. フロントエンドは定期的にポーリングして動画を取得

## フロー

```
User → Frontend → Backend (save prompt to file)
                      ↓
                  prompt.json
                      ↓
                AI Assistant (watch file)
                      ↓
              video_generation tool
                      ↓
            Download & Save video
                      ↓
         Frontend (polling) → Display video
```
