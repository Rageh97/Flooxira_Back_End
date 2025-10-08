#!/usr/bin/env node

/**
 * Test script to verify social media publishing functionality
 * This script tests the publishing system for all platforms
 */

const { Post } = require('./src/models/post');
const { tryPublishNow } = require('./src/scheduler');

async function testPublishing() {
  console.log('🧪 Testing Social Media Publishing System...\n');

  // Test data for different platforms
  const testPosts = [
    {
      id: 1,
      type: 'text',
      content: 'Test post for Twitter and LinkedIn',
      platforms: ['twitter', 'linkedin'],
      userId: 1
    },
    {
      id: 2,
      type: 'video',
      content: 'Test video for YouTube',
      mediaUrl: 'https://sample-videos.com/zip/10/mp4/SampleVideo_1280x720_1mb.mp4',
      platforms: ['youtube'],
      userId: 1
    },
    {
      id: 3,
      type: 'photo',
      content: 'Test photo for Instagram',
      mediaUrl: 'https://picsum.photos/800/600',
      platforms: ['instagram'],
      userId: 1
    },
    {
      id: 4,
      type: 'text',
      content: 'Test post for Facebook',
      platforms: ['facebook'],
      userId: 1
    }
  ];

  for (const testPost of testPosts) {
    console.log(`\n📝 Testing ${testPost.platforms.join(', ')} publishing...`);
    console.log(`Content: ${testPost.content}`);
    console.log(`Type: ${testPost.type}`);
    if (testPost.mediaUrl) {
      console.log(`Media: ${testPost.mediaUrl}`);
    }

    try {
      // Create a mock post object
      const post = {
        id: testPost.id,
        type: testPost.type,
        content: testPost.content,
        mediaUrl: testPost.mediaUrl,
        platforms: testPost.platforms,
        userId: testPost.userId,
        status: 'draft',
        error: null,
        save: async function() {
          console.log(`✅ Post ${this.id} saved with status: ${this.status}`);
        }
      };

      // Test publishing
      const result = await tryPublishNow(post);
      
      if (result) {
        console.log(`✅ Publishing successful for ${testPost.platforms.join(', ')}`);
      } else {
        console.log(`❌ Publishing failed for ${testPost.platforms.join(', ')}`);
      }
    } catch (error) {
      console.error(`❌ Error testing ${testPost.platforms.join(', ')}:`, error.message);
    }
  }

  console.log('\n🏁 Publishing test completed!');
}

// Run the test
if (require.main === module) {
  testPublishing().catch(console.error);
}

module.exports = { testPublishing };







