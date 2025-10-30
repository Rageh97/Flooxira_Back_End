const axios = require('axios');

class AIService {
  constructor() {
    this.googleApiKey = process.env.GOOGLE_API_KEY;
    this.openAiApiKey = process.env.OPENAI_API_KEY;
  }

  async generateContent(messages) {
    // Try Google AI first
    if (this.googleApiKey) {
      try {
        return await this.generateWithGoogle(messages);
      } catch (error) {
        console.error('Google AI failed, trying OpenAI:', error.message);
        if (this.openAiApiKey) {
          return await this.generateWithOpenAI(messages);
        }
        throw error;
      }
    }

    // Fallback to OpenAI
    if (this.openAiApiKey) {
      return await this.generateWithOpenAI(messages);
    }

    throw new Error('لا يوجد مفتاح API متاح. يرجى تكوين GOOGLE_API_KEY أو OPENAI_API_KEY');
  }

  async generateWithGoogle(messages) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${this.googleApiKey}`;
    
    // Convert messages to Google format
    const contents = messages.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }));

    const response = await axios.post(url, {
      contents: contents,
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 2048,
      }
    });

    if (!response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
      throw new Error('استجابة غير صالحة من Google AI');
    }

    const generatedText = response.data.candidates[0].content.parts[0].text;
    const tokensUsed = this.estimateTokens(generatedText);

    return {
      content: generatedText,
      tokensUsed,
      creditsUsed: Math.ceil(tokensUsed / 1000) // 1 credit per 1000 tokens
    };
  }

  async generateWithOpenAI(messages) {
    const url = 'https://api.openai.com/v1/chat/completions';
    
    const response = await axios.post(url, {
      model: 'gpt-3.5-turbo',
      messages: messages,
      temperature: 0.7,
      max_tokens: 2048
    }, {
      headers: {
        'Authorization': `Bearer ${this.openAiApiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.data?.choices?.[0]?.message?.content) {
      throw new Error('استجابة غير صالحة من OpenAI');
    }

    const generatedText = response.data.choices[0].message.content;
    const tokensUsed = response.data.usage?.total_tokens || this.estimateTokens(generatedText);

    return {
      content: generatedText,
      tokensUsed,
      creditsUsed: Math.ceil(tokensUsed / 1000) // 1 credit per 1000 tokens
    };
  }

  estimateTokens(text) {
    // Rough estimation: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }
}

module.exports = new AIService();















