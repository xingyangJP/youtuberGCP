import Database from 'better-sqlite3';

const db = new Database('.wrangler/state/v3/d1/miniflare-D1DatabaseObject/7a321e1c997ab8e153b965c9a6bb80991f6ac35f4a46ec49f72ed2d92fc44616.sqlite');

const videos = db.prepare('SELECT id, video_url, thumbnail_url, youtube_title, created_at FROM videos ORDER BY id DESC LIMIT 5').all();

console.log('📹 保存された動画一覧:');
console.log(JSON.stringify(videos, null, 2));

db.close();
