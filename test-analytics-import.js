#!/usr/bin/env node

/**
 * Test script to check which analytics functions are undefined
 */

console.log('🧪 Testing Analytics Import...\n');

try {
  console.log('📝 Testing analytics controller import...');
  const analyticsController = require('./src/controllers/analytics.controller');
  
  console.log('✅ Analytics controller imported successfully');
  console.log('📊 Available functions:', Object.keys(analyticsController));
  
  // Check each function
  const functions = [
    'getFacebookAnalytics',
    'getLinkedInAnalytics', 
    'getTwitterAnalytics',
    'getYouTubeAnalytics',
    'getPinterestAnalytics',
    'getAllAnalytics'
  ];
  
  console.log('\n📝 Checking individual functions:');
  for (const funcName of functions) {
    if (typeof analyticsController[funcName] === 'function') {
      console.log(`✅ ${funcName}: Function`);
    } else if (analyticsController[funcName] === undefined) {
      console.log(`❌ ${funcName}: Undefined`);
    } else {
      console.log(`⚠️ ${funcName}: ${typeof analyticsController[funcName]}`);
    }
  }
  
} catch (error) {
  console.error('❌ Error importing analytics controller:', error.message);
  console.error('Stack trace:', error.stack);
}

console.log('\n🏁 Analytics import test completed!');
