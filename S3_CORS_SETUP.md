# S3 CORS Configuration for Video Uploads

## Apply CORS Policy to Your S3 Bucket

Your bucket needs CORS configured to allow direct uploads from the browser.

### Option 1: AWS Console (Easiest)

1. Go to [AWS S3 Console](https://s3.console.aws.amazon.com/s3/buckets)
2. Click on your bucket: `fbn-uploads`
3. Go to the **Permissions** tab
4. Scroll down to **Cross-origin resource sharing (CORS)**
5. Click **Edit**
6. Copy and paste the contents of `s3-cors-policy.json` from this directory
7. Click **Save changes**

### Option 2: AWS CLI

If you have AWS CLI configured:

```bash
aws s3api put-bucket-cors --bucket fbn-uploads --cors-configuration file://s3-cors-policy.json
```

### Option 3: Via Code (One-time setup)

You can also run this endpoint once to set the CORS policy:

```bash
curl -X POST https://software-k6yu.onrender.com/s3/setup-cors
```

## Verify CORS is Working

After applying the CORS policy, test by:

1. Deploy your code changes to Render
2. Try uploading a large video file (>50MB)
3. Check browser console - you should see:
   - "🔗 Getting presigned URL..."
   - "✅ Got presigned URL"
   - "📤 Uploading to S3..."
   - Upload progress percentages
   - "✅ Upload to S3 completed"
   - "⚙️ Processing video..."

## Troubleshooting

If you still get CORS errors:

1. **Check the bucket region** - Your bucket is in `us-east-2`, make sure `.env` has:
   ```
   AWS_REGION=us-east-2
   ```

2. **Verify CORS was applied** - Run:
   ```bash
   aws s3api get-bucket-cors --bucket fbn-uploads
   ```

3. **Check Render environment variables** - Make sure Render has all AWS env vars set

4. **Clear browser cache** and try again

## What Changed

The upload flow now works like this:

**Production (Render):**
1. Frontend detects it's on Render
2. Requests a presigned URL from `/s3/presigned-url`
3. Uploads directly to S3 (bypasses Render's 50MB limit)
4. Calls `/upload/process-s3` to process the video

**Local (files < 50MB):**
1. Uploads through backend `/upload` route
2. Processes normally

This avoids the 502 error on Render because the file never goes through Render's servers during upload.
