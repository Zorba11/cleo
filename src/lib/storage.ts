import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { AssetType } from '@prisma/client';

// R2 Configuration - validate required environment variables
const validateR2Config = () => {
  // Support both naming conventions for flexibility
  const endpoint = process.env.CLOUDFLARE_R2_ENDPOINT || process.env.R2_ENDPOINT;
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME || process.env.R2_BUCKET;
  
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error('Missing required R2 environment variables. Need: endpoint, access_key_id, secret_access_key, and bucket_name');
  }
  
  return {
    endpoint,
    accessKeyId,
    secretAccessKey,
    bucket,
    publicBaseUrl: process.env.R2_PUBLIC_BASE_URL || ''
  };
};

// Initialize R2 client with Cloudflare R2 endpoint
let r2Client: S3Client | null = null;
let r2Config: ReturnType<typeof validateR2Config> | null = null;

const getR2Client = () => {
  if (!r2Client) {
    try {
      r2Config = validateR2Config();
      
      r2Client = new S3Client({
        region: 'auto',
        endpoint: r2Config.endpoint,
        credentials: {
          accessKeyId: r2Config.accessKeyId,
          secretAccessKey: r2Config.secretAccessKey,
        },
      });
      
      console.log('✅ R2 client initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize R2 client:', error);
      throw error;
    }
  }
  
  return { client: r2Client!, config: r2Config! };
};

// File path generators following the project structure
export const generateFilePath = (
  projectId: string,
  type: AssetType,
  filename: string
): string => {
  const basePath = `projects/${projectId}`;
  
  switch (type) {
    case 'DOC':
      return `${basePath}/docs/${filename}`;
    case 'AUDIO':
      return `${basePath}/audio/${filename}`;
    case 'ALIGN':
      return `${basePath}/align/${filename}`;
    case 'FRAME':
      return `${basePath}/frames/${filename}`;
    case 'CUE':
      return `${basePath}/cues/${filename}`;
    case 'VIDEO':
      return `${basePath}/video/${filename}`;
    default:
      return `${basePath}/misc/${filename}`;
  }
};

// Generate plan-specific file paths
export const generatePlanFilePath = (projectId: string, filename: string): string => {
  return `projects/${projectId}/plan/${filename}`;
};

// Upload file to R2
export async function uploadFile(
  projectId: string,
  type: AssetType,
  filename: string,
  fileBuffer: Buffer,
  contentType: string = 'application/octet-stream'
): Promise<{ key: string; url: string }> {
  try {
    const { client, config } = getR2Client();
    const key = generateFilePath(projectId, type, filename);
    
    const command = new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: fileBuffer,
      ContentType: contentType,
    });
    
    await client.send(command);
    
    // Generate public URL if base URL is configured
    const url = config.publicBaseUrl 
      ? `${config.publicBaseUrl}/${key}`
      : `${config.endpoint}/${key}`;
    
    console.log(`✅ File uploaded: ${key}`);
    return { key, url };
    
  } catch (error) {
    console.error('❌ Failed to upload file:', error);
    throw new Error(`Failed to upload file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Upload plan file (ProjectPlan.json, StyleBible.min.json)
export async function uploadPlanFile(
  projectId: string,
  filename: string,
  content: string | Buffer,
  contentType: string = 'application/json'
): Promise<{ key: string; url: string }> {
  try {
    const { client, config } = getR2Client();
    const key = generatePlanFilePath(projectId, filename);
    
    const command = new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: typeof content === 'string' ? Buffer.from(content) : content,
      ContentType: contentType,
    });
    
    await client.send(command);
    
    const url = config.publicBaseUrl 
      ? `${config.publicBaseUrl}/${key}`
      : `${config.endpoint}/${key}`;
    
    console.log(`✅ Plan file uploaded: ${key}`);
    return { key, url };
    
  } catch (error) {
    console.error('❌ Failed to upload plan file:', error);
    throw new Error(`Failed to upload plan file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Download file from R2
export async function downloadFile(key: string): Promise<Buffer> {
  try {
    const { client, config } = getR2Client();
    
    const command = new GetObjectCommand({
      Bucket: config.bucket,
      Key: key,
    });
    
    const response = await client.send(command);
    
    if (!response.Body) {
      throw new Error('File not found or empty');
    }
    
    // Convert stream to buffer
    const chunks: Uint8Array[] = [];
    const stream = response.Body as any;
    
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    
    const buffer = Buffer.concat(chunks);
    console.log(`✅ File downloaded: ${key} (${buffer.length} bytes)`);
    return buffer;
    
  } catch (error) {
    console.error('❌ Failed to download file:', error);
    throw new Error(`Failed to download file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Generate presigned URL for upload
export async function getPresignedUploadUrl(
  projectId: string,
  type: AssetType,
  filename: string,
  contentType: string,
  expiresIn: number = 3600 // 1 hour default
): Promise<string> {
  try {
    const { client, config } = getR2Client();
    const key = generateFilePath(projectId, type, filename);
    
    const command = new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      ContentType: contentType,
    });
    
    const url = await getSignedUrl(client, command, { expiresIn });
    console.log(`✅ Generated presigned upload URL for: ${key}`);
    return url;
    
  } catch (error) {
    console.error('❌ Failed to generate presigned upload URL:', error);
    throw new Error(`Failed to generate presigned upload URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Generate presigned URL for download
export async function getPresignedDownloadUrl(
  key: string,
  expiresIn: number = 3600 // 1 hour default
): Promise<string> {
  try {
    const { client, config } = getR2Client();
    
    const command = new GetObjectCommand({
      Bucket: config.bucket,
      Key: key,
    });
    
    const url = await getSignedUrl(client, command, { expiresIn });
    console.log(`✅ Generated presigned download URL for: ${key}`);
    return url;
    
  } catch (error) {
    console.error('❌ Failed to generate presigned download URL:', error);
    throw new Error(`Failed to generate presigned download URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Delete file from R2
export async function deleteFile(key: string): Promise<void> {
  try {
    const { client, config } = getR2Client();
    
    const command = new DeleteObjectCommand({
      Bucket: config.bucket,
      Key: key,
    });
    
    await client.send(command);
    console.log(`✅ File deleted: ${key}`);
    
  } catch (error) {
    console.error('❌ Failed to delete file:', error);
    throw new Error(`Failed to delete file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Check R2 connectivity
export async function checkR2Connection(): Promise<boolean> {
  try {
    const { client, config } = getR2Client();
    
    const command = new HeadBucketCommand({
      Bucket: config.bucket,
    });
    
    await client.send(command);
    console.log('✅ R2 connection successful');
    return true;
    
  } catch (error) {
    console.error('❌ R2 connection failed:', error);
    return false;
  }
}

// Utility to get file size and metadata
export async function getFileInfo(key: string): Promise<{
  size: number;
  contentType?: string;
  lastModified?: Date;
}> {
  try {
    const { client, config } = getR2Client();
    
    const command = new GetObjectCommand({
      Bucket: config.bucket,
      Key: key,
    });
    
    const response = await client.send(command);
    
    return {
      size: response.ContentLength || 0,
      contentType: response.ContentType,
      lastModified: response.LastModified,
    };
    
  } catch (error) {
    console.error('❌ Failed to get file info:', error);
    throw new Error(`Failed to get file info: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Cleanup project files (delete entire project folder)
export async function cleanupProjectFiles(projectId: string): Promise<void> {
  try {
    console.log(`🧹 Cleaning up files for project: ${projectId}`);
    // Note: R2 doesn't have native folder deletion, so we'd need to list and delete individual files
    // For now, this is a placeholder for future implementation if needed
    console.log(`⚠️ Project cleanup not fully implemented yet for: ${projectId}`);
    
  } catch (error) {
    console.error('❌ Failed to cleanup project files:', error);
    throw new Error(`Failed to cleanup project files: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}