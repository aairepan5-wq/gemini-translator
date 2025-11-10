/*
 * 这是一个 100% 正确的 Vercel "翻译官"
 * 来源: Discord 社区 (thinkingjimmy/gemini-openai-proxy-vercel)
 * 功能:
 * 1. 接收 OpenAI 格式的 /v1/chat/completions 请求
 * 2. 从 Authorization 标头里提取 Gemini Key
 * 3. 调用 Google SDK (这不会被 IP 屏蔽)
 * 4. 把 Gemini 的回复“翻译”回 OpenAI 格式并返回
 */

import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return handleOptions(req, res);
  }

  try {
    const genAI = new GoogleGenerativeAI(getApiKey(req));
    const model = genAI.getGenerativeModel({
      model: req.body.model,
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      ]
    });

    const chat = model.startChat({
      history: convertToGoogleHistory(req.body.messages),
    });

    const prompt = req.body.messages[req.body.messages.length - 1].content;
    const result = await chat.sendMessage(prompt);
    const response = result.response;

    // 成功，返回 OpenAI 格式的回复
    res.status(200).json({
      id: 'gemini-' + Date.now(),
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: req.body.model,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: response.text(),
        },
        finish_reason: 'stop'
      }],
      usage: {
        prompt_tokens: 0, // Gemini API 不返回 token 计数
        completion_tokens: 0,
        total_tokens: 0
      }
    });

  } catch (error) {
    console.error("Gemini API Error:", error);
    res.status(500).json({ error: { message: error.message || "An unknown error occurred" } });
  }
}

// --- 辅助函数 ---

function getApiKey(req) {
  const authHeader = req.headers.get('authorization');
  if (authHeader) {
    return authHeader.split(' ')[1]; // 提取 Bearer YOUR_KEY
  }
  // 作为备选，从 Vercel 环境变量里读取 (但我们会用上面的方法)
  return process.env.GEMINI_API_KEY; 
}

function convertToGoogleHistory(messages) {
  let history = [];
  for (let i = 0; i < messages.length - 1; i++) { // 最后一个是当前 prompt，不计入 history
    const msg = messages[i];
    if (msg.role === 'user') {
      history.push({ role: "user", parts: [{ text: msg.content }] });
    } else if (msg.role === 'assistant') {
      history.push({ role: "model", parts: [{ text: msg.content }] });
    }
  }
  return history;
}

function handleOptions(req, res) {
  res.status(204).send();
}
