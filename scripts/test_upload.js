import express from 'express';
import integrationsRouter from '../routes/integrations.js';

const app = express();
app.use(express.json());
app.use('/api/integrations', integrationsRouter);

async function runUploadTest() {
  console.log('Testing in-memory Express server with integrations upload route...');

  // Start test server on random port
  const server = app.listen(0, async () => {
    const port = server.address().port;
    const url = `http://localhost:${port}/api/integrations/Core/UploadFile`;

    try {
      // Test base64 payload upload
      const testBase64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: testBase64 }),
      });

      const data = await res.json();
      console.log('Upload response status:', res.status);
      console.log('Upload response body:', data);

      if (res.status === 200 && data.file_url) {
        console.log('✅ File Upload Integration Test PASSED! Returned URL:', data.file_url);
      } else {
        console.error('❌ Upload Test failed:', data);
        process.exit(1);
      }
    } catch (err) {
      console.error('❌ Error during upload test:', err);
      process.exit(1);
    } finally {
      server.close();
    }
  });
}

runUploadTest();
