import express from "express";
import { generatePresignedUploadUrl } from "../services/s3Service.js";

const router = express.Router();

// Generate presigned URL for direct S3 upload
router.post("/presigned-url", async (req, res) => {
  try {
    const { fileName, fileType } = req.body;
    
    if (!fileName || !fileType) {
      return res.status(400).json({ 
        error: "fileName and fileType are required" 
      });
    }

    // Validate file type
    if (!fileType.startsWith('video/')) {
      return res.status(400).json({ 
        error: "Only video files are allowed" 
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

export default router;