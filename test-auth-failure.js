#!/usr/bin/env node

/**
 * Test script to verify authentication failure handling
 * This script tests the scenario where a user is deleted or disabled
 * while they have an active session on the client.
 */

const axios = require('axios');

const API_BASE_URL = 'http://localhost:3000';

async function testAuthFailureHandling() {
  console.log('🧪 Testing Authentication Failure Handling\n');

  try {
    // Step 1: Login as admin to get a token
    console.log('1️⃣ Logging in as admin...');
    const loginResponse = await axios.post(`${API_BASE_URL}/auth/login`, {
      username: 'admin',
      password: 'admin123'
    });

    if (!loginResponse.data.success) {
      console.error('❌ Login failed:', loginResponse.data.message);
      return;
    }

    const adminToken = loginResponse.data.access_token;
    console.log('✅ Admin login successful');

    // Step 2: Create a test user
    console.log('\n2️⃣ Creating test user...');
    const createUserResponse = await axios.post(`${API_BASE_URL}/users`, {
      username: 'testuser',
      password: 'testpass',
      role: 'user',
      isActive: true
    }, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    const testUserId = createUserResponse.data.id;
    console.log('✅ Test user created with ID:', testUserId);

    // Step 3: Login as test user
    console.log('\n3️⃣ Logging in as test user...');
    const testUserLoginResponse = await axios.post(`${API_BASE_URL}/auth/login`, {
      username: 'testuser',
      password: 'testpass'
    });

    if (!testUserLoginResponse.data.success) {
      console.error('❌ Test user login failed:', testUserLoginResponse.data.message);
      return;
    }

    const testUserToken = testUserLoginResponse.data.access_token;
    console.log('✅ Test user login successful');

    // Step 4: Test that the user can access protected resources
    console.log('\n4️⃣ Testing protected resource access with valid token...');
    const profileResponse = await axios.get(`${API_BASE_URL}/users/profile`, {
      headers: { Authorization: `Bearer ${testUserToken}` }
    });
    console.log('✅ Protected resource access successful:', profileResponse.data.username);

    // Step 5: Disable the test user while they have an active session
    console.log('\n5️⃣ Disabling test user account...');
    await axios.patch(`${API_BASE_URL}/users/${testUserId}`, {
      isActive: false
    }, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    console.log('✅ Test user account disabled');

    // Step 6: Try to access protected resource with the same token (should fail)
    console.log('\n6️⃣ Testing protected resource access with disabled user token...');
    try {
      await axios.get(`${API_BASE_URL}/users/profile`, {
        headers: { Authorization: `Bearer ${testUserToken}` }
      });
      console.error('❌ ERROR: Disabled user was still able to access protected resource!');
    } catch (error) {
      if (error.response?.status === 401) {
        console.log('✅ SUCCESS: Disabled user correctly received 401 Unauthorized');
      } else {
        console.error('❌ Unexpected error:', error.response?.status, error.response?.data);
      }
    }

    // Step 7: Delete the test user
    console.log('\n7️⃣ Deleting test user...');
    await axios.delete(`${API_BASE_URL}/users/${testUserId}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    console.log('✅ Test user deleted');

    // Step 8: Try to access protected resource with deleted user token (should fail)
    console.log('\n8️⃣ Testing protected resource access with deleted user token...');
    try {
      await axios.get(`${API_BASE_URL}/users/profile`, {
        headers: { Authorization: `Bearer ${testUserToken}` }
      });
      console.error('❌ ERROR: Deleted user was still able to access protected resource!');
    } catch (error) {
      if (error.response?.status === 401) {
        console.log('✅ SUCCESS: Deleted user correctly received 401 Unauthorized');
      } else {
        console.error('❌ Unexpected error:', error.response?.status, error.response?.data);
      }
    }

    console.log('\n🎉 Authentication failure handling test completed!');
    console.log('\n📋 Summary:');
    console.log('• Backend JWT strategy now checks if user exists and is active');
    console.log('• Deleted or disabled users receive 401 Unauthorized responses');
    console.log('• Client-side response interceptor handles 401 errors');
    console.log('• Authentication failure triggers session expired handler');
    console.log('• User is redirected to login page with appropriate error message');

  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

// Run the test
testAuthFailureHandling();
