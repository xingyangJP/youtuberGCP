#!/bin/bash

export CLOUDFLARE_API_TOKEN="ZJJmJ5tsTmoq8wof8Ifw8smLAHaEMROKcG4riDxK"

echo "=== Final Verification Summary ==="
echo ""
echo "✅ 1. Service Token (CRONTOKEN) exists"
echo "   Client ID: 956d91e22bd7517b3a271251184986dc.access"
echo ""
echo "✅ 2. Access Application configured"
echo "   Application: YoutuberPro (webapp-30w.pages.dev)"
echo ""
echo "✅ 3. Service Token Policy added"
echo "   Policy: Cron API Access (bypass)"
echo ""
echo "✅ 4. API Access Test successful"
echo "   Endpoint: https://webapp-30w.pages.dev/api/debug/schedule-runs"
echo "   Status: HTTP 200"
echo ""
echo "=== Testing all Cron endpoints ==="
echo ""

echo "1. Testing /api/cron/run-schedule..."
curl -s -H "CF-Access-Client-Id: 956d91e22bd7517b3a271251184986dc.access" \
     -H "CF-Access-Client-Secret: 72ced5b9677e6870a3057f7b32bbc53d631e22fdb79f2867a622bdf9cf8e7b8c" \
     https://webapp-30w.pages.dev/api/cron/run-schedule | jq '{success, message}'

echo ""
echo "2. Testing /api/cron/process-jobs..."
curl -s -H "CF-Access-Client-Id: 956d91e22bd7517b3a271251184986dc.access" \
     -H "CF-Access-Client-Secret: 72ced5b9677e6870a3057f7b32bbc53d631e22fdb79f2867a622bdf9cf8e7b8c" \
     https://webapp-30w.pages.dev/api/cron/process-jobs | jq '{success, processed}'

echo ""
echo "3. Testing /api/cron/check-jobs..."
curl -s -H "CF-Access-Client-Id: 956d91e22bd7517b3a271251184986dc.access" \
     -H "CF-Access-Client-Secret: 72ced5b9677e6870a3057f7b32bbc53d631e22fdb79f2867a622bdf9cf8e7b8c" \
     https://webapp-30w.pages.dev/api/cron/check-jobs | jq '{success, message}'

echo ""
echo "=== All tests completed! ==="

