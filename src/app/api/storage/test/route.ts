import { NextResponse } from 'next/server';
import { uploadFile, downloadFile, deleteFile, checkR2Connection, getFileInfo } from '@/lib/storage';
import { validateFile } from '@/lib/validation';

export async function GET() {
  try {
    console.log('🧪 Starting R2 storage test...');
    
    // Test 1: Check R2 connection
    console.log('Test 1: Checking R2 connection...');
    const isConnected = await checkR2Connection();
    
    if (!isConnected) {
      return NextResponse.json({
        ok: false,
        error: 'R2 connection test failed',
        data: {
          test: 'connection',
          status: 'failed'
        }
      }, { status: 500 });
    }
    
    console.log('✅ R2 connection test passed');
    
    // Test 2: Upload a test file
    console.log('Test 2: Uploading test file...');
    const testContent = JSON.stringify({
      test: 'R2 storage integration',
      timestamp: new Date().toISOString(),
      message: 'This is a test file for R2 storage functionality'
    }, null, 2);
    
    const testBuffer = Buffer.from(testContent, 'utf-8');
    const testFilename = 'test-file.json';
    const testProjectId = 'test-project-' + Date.now();
    
    // Validate the test file
    const validationResult = validateFile(
      testFilename,
      testBuffer,
      'DOC',
      'application/json'
    );
    
    if (!validationResult.isValid) {
      return NextResponse.json({
        ok: false,
        error: 'File validation failed',
        data: {
          test: 'validation',
          errors: validationResult.errors
        }
      }, { status: 400 });
    }
    
    console.log('✅ File validation passed');
    
    // Upload the test file
    const uploadResult = await uploadFile(
      testProjectId,
      'DOC',
      testFilename,
      testBuffer,
      'application/json'
    );
    
    console.log('✅ File upload test passed');
    
    // Test 3: Get file info
    console.log('Test 3: Getting file info...');
    const fileInfo = await getFileInfo(uploadResult.key);
    
    console.log('✅ File info test passed');
    
    // Test 4: Download the test file
    console.log('Test 4: Downloading test file...');
    const downloadedBuffer = await downloadFile(uploadResult.key);
    const downloadedContent = downloadedBuffer.toString('utf-8');
    
    // Verify content matches
    const originalData = JSON.parse(testContent);
    const downloadedData = JSON.parse(downloadedContent);
    
    if (originalData.test !== downloadedData.test) {
      return NextResponse.json({
        ok: false,
        error: 'Downloaded content does not match uploaded content',
        data: {
          test: 'download',
          status: 'failed'
        }
      }, { status: 500 });
    }
    
    console.log('✅ File download test passed');
    
    // Test 5: Clean up - delete the test file
    console.log('Test 5: Cleaning up test file...');
    await deleteFile(uploadResult.key);
    
    console.log('✅ File cleanup test passed');
    
    // All tests passed
    console.log('🎉 All R2 storage tests passed!');
    
    return NextResponse.json({
      ok: true,
      data: {
        status: 'all_tests_passed',
        timestamp: new Date().toISOString(),
        tests: {
          connection: 'passed',
          validation: 'passed',
          upload: 'passed',
          fileInfo: 'passed',
          download: 'passed',
          cleanup: 'passed'
        },
        testFile: {
          projectId: testProjectId,
          filename: testFilename,
          size: testBuffer.length,
          key: uploadResult.key,
          url: uploadResult.url
        },
        fileInfo: {
          size: fileInfo.size,
          contentType: fileInfo.contentType,
          lastModified: fileInfo.lastModified
        },
        validationResult: {
          isValid: validationResult.isValid,
          warnings: validationResult.warnings
        }
      }
    });
    
  } catch (error) {
    console.error('❌ R2 storage test failed:', error);
    
    return NextResponse.json({
      ok: false,
      error: 'R2 storage test failed',
      data: {
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      }
    }, { status: 500 });
  }
}

// Test different asset types
export async function POST() {
  try {
    console.log('🧪 Starting comprehensive R2 asset type tests...');
    
    const testResults = {
      connection: false,
      assetTests: {} as Record<string, any>
    };
    
    // Check connection first
    testResults.connection = await checkR2Connection();
    
    if (!testResults.connection) {
      throw new Error('R2 connection failed');
    }
    
    const testProjectId = 'asset-test-' + Date.now();
    const assetTypes = ['DOC', 'AUDIO', 'FRAME'] as const;
    
    // Test different asset types
    for (const assetType of assetTypes) {
      console.log(`Testing ${assetType} asset type...`);
      
      let testBuffer: Buffer;
      let testFilename: string;
      let contentType: string;
      
      switch (assetType) {
        case 'DOC':
          testFilename = 'test-document.json';
          testBuffer = Buffer.from(JSON.stringify({ type: 'test-doc' }));
          contentType = 'application/json';
          break;
        case 'AUDIO':
          testFilename = 'beat_1.wav';
          // Minimal WAV file header (44 bytes + 4 bytes of silence)
          testBuffer = Buffer.from([
            0x52, 0x49, 0x46, 0x46, 0x28, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
            0x66, 0x6D, 0x74, 0x20, 0x10, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
            0x44, 0xAC, 0x00, 0x00, 0x88, 0x58, 0x01, 0x00, 0x02, 0x00, 0x10, 0x00,
            0x64, 0x61, 0x74, 0x61, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
          ]);
          contentType = 'audio/wav';
          break;
        case 'FRAME':
          testFilename = 'B1_F01.png';
          // Minimal PNG file (1x1 pixel transparent PNG)
          testBuffer = Buffer.from([
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
            0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
            0x08, 0x04, 0x00, 0x00, 0x00, 0xB5, 0x1C, 0x0C, 0x02, 0x00, 0x00, 0x00,
            0x0B, 0x49, 0x44, 0x41, 0x54, 0x08, 0x1D, 0x01, 0x00, 0x00, 0xFF, 0xFF,
            0x00, 0x00, 0x00, 0x02, 0x00, 0x01, 0xE8, 0x27, 0xDE, 0xFC, 0x00, 0x00,
            0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
          ]);
          contentType = 'image/png';
          break;
      }
      
      try {
        // Validate file
        const validation = validateFile(testFilename, testBuffer, assetType, contentType);
        
        // Upload file
        const uploadResult = await uploadFile(testProjectId, assetType, testFilename, testBuffer, contentType);
        
        // Download file
        const downloadedBuffer = await downloadFile(uploadResult.key);
        
        // Verify content
        const contentMatches = Buffer.compare(testBuffer, downloadedBuffer) === 0;
        
        // Clean up
        await deleteFile(uploadResult.key);
        
        testResults.assetTests[assetType] = {
          status: 'passed',
          validation: validation.isValid,
          upload: true,
          download: true,
          contentMatches,
          fileSize: testBuffer.length,
          filename: testFilename,
          warnings: validation.warnings
        };
        
        console.log(`✅ ${assetType} test passed`);
        
      } catch (error) {
        testResults.assetTests[assetType] = {
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error'
        };
        console.error(`❌ ${assetType} test failed:`, error);
      }
    }
    
    const allTestsPassed = Object.values(testResults.assetTests).every(
      test => test.status === 'passed'
    );
    
    return NextResponse.json({
      ok: allTestsPassed,
      data: {
        status: allTestsPassed ? 'all_tests_passed' : 'some_tests_failed',
        timestamp: new Date().toISOString(),
        testProjectId,
        ...testResults
      }
    });
    
  } catch (error) {
    console.error('❌ Comprehensive R2 test failed:', error);
    
    return NextResponse.json({
      ok: false,
      error: 'Comprehensive R2 test failed',
      data: {
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      }
    }, { status: 500 });
  }
}