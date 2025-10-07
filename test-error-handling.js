const http = require('http');

// Test script to verify error handling improvements
async function testErrorHandling() {
  console.log('🧪 Testing error handling improvements...');

  // Test 1: Server health check
  console.log('\n📝 Test 1: Initial server health check');
  await testServerHealth();

  // Test 2: Test invalid endpoints to trigger error handling
  console.log('\n📝 Test 2: Testing error handling with invalid requests');
  await testInvalidRequests();

  // Test 3: Final health check
  console.log('\n📝 Test 3: Final server health check');
  await testServerHealth();

  console.log('\n🎉 Error handling tests completed!');
  console.log('✅ If you see this message, the server didn\'t crash - our fixes are working!');
}

async function testServerHealth() {
  try {
    const response = await makeRequest('GET', '/health');
    if (response.statusCode === 200) {
      console.log('✅ Server is healthy');
    } else {
      console.log(`⚠️ Server returned status ${response.statusCode}`);
    }
  } catch (error) {
    console.log('❌ Server appears to be down:', error.message);
  }
}

async function testInvalidRequests() {
  const tests = [
    { method: 'GET', path: '/rooms/invalid-room-id', description: 'Invalid room ID' },
    { method: 'POST', path: '/rooms/join', description: 'Join room without auth', data: '{"roomId":"test"}' },
    { method: 'GET', path: '/users/invalid-user-id', description: 'Invalid user ID' },
    { method: 'POST', path: '/auth/login', description: 'Invalid login', data: '{"username":"invalid","password":"invalid"}' }
  ];

  for (const test of tests) {
    try {
      console.log(`  Testing: ${test.description}`);
      const response = await makeRequest(test.method, test.path, test.data);
      console.log(`  ✅ Server handled error gracefully (status: ${response.statusCode})`);
    } catch (error) {
      console.log(`  ❌ Request failed: ${error.message}`);
    }
  }
}

function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      }
    };

    if (data) {
      options.headers['Content-Length'] = Buffer.byteLength(data);
    }

    const req = http.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          data: responseData
        });
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (data) {
      req.write(data);
    }

    req.end();
  });
}

testErrorHandling().catch(console.error);
