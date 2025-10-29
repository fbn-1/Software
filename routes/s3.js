import express from "express";
import { generatePresignedUploadUrl } from "../services/s3Service.js";
import AWS from 'aws-sdk';

const router = express.Router();

// Configure S3 client
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'us-east-1'
});
const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME;

// Generate presigned URL for direct S3 upload
router.post("/presigned-url", async (req, res) => {
  try {
    const { fileName, fileType } = req.body;
    
    if (!fileName || !fileType) {
      return res.status(400).json({ 
        error: "fileName and fileType are required" 
      });
    }

    // Validate file type - allow both video and audio (for browser-converted MP3)
    if (!fileType.startsWith('video/') && !fileType.startsWith('audio/')) {
      return res.status(400).json({ 
        error: "Only video or audio files are allowed" 
      });
    }

    const result = generatePresignedUploadUrl(fileName, fileType);
    
    res.json({
      uploadUrl: result.uploadUrl,
      s3Key: result.key,
      downloadUrl: result.downloadUrl
    });
  } catch (error) {
    console.error('Error generating presigned URL:', error);
    res.status(500).json({ 
      error: "Failed to generate upload URL" 
    });
  }
});

// Setup CORS policy for S3 bucket (one-time setup)
router.post("/setup-cors", async (req, res) => {
  try {
    const frontendUrl = process.env.FRONTEND_URL || 'https://software-k6yu.onrender.com';
    
    const corsConfiguration = {
      CORSRules: [
        {
          AllowedHeaders: ['*'],
          AllowedMethods: ['PUT', 'POST', 'GET'],
          AllowedOrigins: [
            'http://localhost:3000',
            'http://127.0.0.1:3000',
            frontendUrl,
            'http://192.168.*.*:3000'
          ].filter(Boolean),
          ExposeHeaders: ['ETag'],
          MaxAgeSeconds: 3000
        }
      ]
    };

    await s3.putBucketCors({
      Bucket: BUCKET_NAME,
      CORSConfiguration: corsConfiguration
    }).promise();
    
    console.log('✅ S3 CORS policy updated successfully');
    res.json({ 
      message: "CORS policy updated successfully",
      bucket: BUCKET_NAME,
      allowedOrigins: corsConfiguration.CORSRules[0].AllowedOrigins
    });
  } catch (error) {
    console.error('❌ Failed to update S3 CORS policy:', error);
    res.status(500).json({ 
      error: "Failed to setup CORS policy",
      details: error.message 
    });
  }
});

export default router;