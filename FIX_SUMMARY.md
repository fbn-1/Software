# 502 Error Fix - Upload Changes Summary

## Problem
Uploads were failing on Render with a 502 error because large files (>50MB) were being sent through the backend, hitting Render's request size limits or timeout.

## Solution Implemented
Changed the upload flow to use **presigned S3 URLs** for production uploads, allowing the browser to upload directly to S3, bypassing Render's backend entirely.

## Changes Made

### 1. Backend Changes

#### `index.js`
- Added `/s3` route registration for presigned URL endpoints

#### `routes/s3.js`
- Added `POST /s3/presigned-url` - Generates presigned S3 upload URLs
- Added `POST /s3/setup-cors` - Helper to configure S3 bucket CORS

#### `routes/upload.js`
- Added `POST /upload/process-s3` - Processes videos after direct S3 upload
- Kept `POST /upload` for small files (<50MB) in local development

#### `services/s3Service.js`
- Fixed region in download URL to use `AWS_REGION` env var
- Increased presigned URL expiry to 600 seconds (10 min) for large files

### 2. Frontend Changes

#### `VideoUploader.js`
- Detects if running on Render (production) or locally
- **Production flow**: Always uses presigned S3 upload
- **Local flow (<50MB)**: Uses direct backend upload
- Added better error handling for 502 errors

### Upload Flow Comparison

**OLD (Causing 502):**
```
Browser → [Large File] → Render Backend → S3
         ↑ FAILS HERE (502)
```

**NEW (Working):**
```
Browser → Render Backend → Get Presigned URL
       ↓
       → S3 Direct Upload (no backend involved)
       ↓
       → Render Backend → Process video from S3
```

## Deployment Steps

### 1. Apply S3 CORS Policy (REQUIRED)

Choose one method:

**Option A - AWS Console:**
1. Go to https://s3.console.aws.amazon.com/s3/buckets/fbn-uploads
2. Click Permissions tab → Cross-origin resource sharing (CORS)
3. Paste contents from `s3-cors-policy.json`
4. Save

**Option B - AWS CLI:**
```bash
aws s3api put-bucket-cors --bucket fbn-uploads --cors-configuration file://s3-cors-policy.json
```

**Option C - Via API (after deploying code):**
```bash
curl -X POST https://software-k6yu.onrender.com/s3/setup-cors
```

### 2. Deploy to Render

```bash
git add .
git commit -m "Fix 502 error with presigned S3 uploads"
git push origin main
```

Render will auto-deploy.

### 3. Verify Environment Variables on Render

Make sure these are set in Render dashboard:
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION=us-east-2`
- `AWS_S3_BUCKET_NAME=fbn-uploads`

### 4. Test

1. Go to your Render URL: https://software-k6yu.onrender.com
2. Upload a large video file (>50MB)
3. Check browser console - should see:
   ```
   📤 Uploading video.mp4 (220.7MB) via presigned S3...
   🔗 Getting presigned URL...
   ✅ Got presigned URL
   📤 Uploading to S3...
   Upload progress: 100%
   ✅ Upload to S3 completed
   ⚙️ Processing video...
   ```
4. Video should process successfully without 502 error

## Rollback Plan

If issues occur, temporarily set this in Render env vars:
```
FORCE_BACKEND_UPLOAD=true
```

And update VideoUploader.js line 23 to:
```javascript
const useS3Upload = process.env.FORCE_BACKEND_UPLOAD !== 'true' && (isProduction || fileSizeMB > 50);
```

## Benefits

✅ No more 502 errors on large uploads  
✅ Faster uploads (direct to S3)  
✅ No Render bandwidth costs for upload  
✅ Supports files up to 5TB (S3 limit)  
✅ Better user experience with upload progress  

## What Stays the Same

- Small files (<50MB) in local dev still upload through backend
- Video processing pipeline unchanged
- Database schema unchanged
- All existing transcripts work the same
