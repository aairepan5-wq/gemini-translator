/*
 * v13: 最终修复版 - 移除错误的 safetySettings
 *
 * 诊断：之前的“无输出”是因为我添加了
 * 错误的 safetySettings: [ ... ]
 * 导致 Google SDK 崩溃或返回空回复。
 *
 * 修复：我们将其完全移除，使用 Google 的默认安全设置。
 */

import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return handleOptions(req, res);
  }

  try {
    const genAI = new GoogleGenerativeAI(getApiKey(req));

    // 【【【 关键修复：已移除错误的 safetySettings 】】】
    const model = genAI.getGenerativeModel({
      model: req.body.model
    });

    const chat = model.startChat({
      history: convertToGoogleHistory(req.body.messages),
    });

    const prompt = req.body.messages[req.body.messages.length - 1].content;
    const result = await chat.sendMessage(prompt);
    const response = result.response;

    // 检查 Google 是否因安全（或其他原因）返回了空回复
    if (!response || !response.text()) {
      // 如果 Google 真的拦截了（比如 NSFW 内容），我们至少返回一个错误
      let errorMsg = "Gemini API returned an empty response.";
      if (response && response.promptFeedback && response.promptFeedback.blockReason) {
        errorMsg = `Gemini API blocked the prompt. Reason: ${response.promptFeedback.blockReason}`;
      }
      throw new Error(errorMsg);
    }

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
        prompt_tokens: 0, 
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
  return process.env.GEMINI_API_KEY; 
}

function convertToGoogleHistory(messages) {
  let history = [];
  for (let i = 0; i < messages.length - 1; i++) { 
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
  // 修复 CORS 预检，使其 100% 完整
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.status(204).send();
}
