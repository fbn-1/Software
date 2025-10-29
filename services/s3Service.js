import AWS from 'aws-sdk';
import crypto from 'crypto';


const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME;

// Configure AWS SDK
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'us-east-1',
  bucket: BUCKET_NAME ,
});


/**
 * Generate a presigned URL for direct upload to S3
 * @param {string} fileName - Original filename
 * @param {string} fileType - MIME type
 * @returns {Object} - Contains uploadUrl, key, and downloadUrl
 */
export function generatePresignedUploadUrl(fileName, fileType) {
  const fileExtension = fileName.split('.').pop();
  const key = `videos/${crypto.randomUUID()}.${fileExtension}`;
  
  const params = {
    Bucket: BUCKET_NAME,
    Key: key,
    ContentType: fileType,
    Expires: 300, // 5 minutes
    ACL: 'private'
  };

  const uploadUrl = s3.getSignedUrl('putObject', params);
  const downloadUrl = `https://${BUCKET_NAME}.s3.amazonaws.com/${key}`;

  return {
    uploadUrl,
    key,
    downloadUrl
  };
}

/**
 * Download a video file from S3 to local filesystem
 * @param {string} s3Key - S3 object key
 * @param {string} localPath - Local file path to save to
 * @returns {Promise} - Resolves when download is complete
 */
export function downloadFromS3(s3Key, localPath) {
  return new Promise((resolve, reject) => {
    const params = {
      Bucket: BUCKET_NAME,
      Key: s3Key
    };

    const file = require('fs').createWriteStream(localPath);
    const stream = s3.getObject(params).createReadStream();

    stream.pipe(file);
    
    stream.on('error', reject);
    file.on('error', reject);
    file.on('close', resolve);
  });
}

/**
 * Delete a file from S3
 * @param {string} s3Key - S3 object key
 * @returns {Promise} - Resolves when deletion is complete
 */
export function deleteFromS3(s3Key) {
  const params = {
    Bucket: BUCKET_NAME,
    Key: s3Key
  };

  return s3.deleteObject(params).promise();
}

/**
 * Check if a file exists in S3
 * @param {string} s3Key - S3 object key
 * @returns {Promise<boolean>} - True if file exists
 */
export async function fileExistsInS3(s3Key) {
  try {
    await s3.headObject({
      Bucket: BUCKET_NAME,
      Key: s3Key
    }).promise();
    return true;
  } catch (error) {
    if (error.code === 'NotFound') {
      return false;
    }
    throw error;
  }
}