/*
 * v14: 最终 Vercel 原生 API 版 (100% 重写)
 *
 * 诊断：我之前一直在用 Express.js 语法 (res.json)，
 * 而 Vercel 需要的是标准 Response API (return new Response)。
 * 这是导致“无输出”的真正原因，代码在 Vercel 端当场崩溃。
 *
 * 修复：完全重写为 Vercel 能看懂的标准 API。
 */

import { GoogleGenerativeAI } from "@google/generative-ai";

// 1. 【【【 关键修复：使用 Vercel 的标准 API 语法 】】】
export default async function handler(request) {

  // 2. 处理 OPTIONS (CORS 预检)，使用标准 Response
  if (request.method === "OPTIONS") {
    return handleOptions();
  }

  try {
    // 3. 【【【 关键修复：从 Vercel 的 Request 中提取 body 和 key 】】】
    const body = await request.json(); // 替换 req.body
    const apiKey = getApiKey(request);  // 替换 getApiKey(req)

    const genAI = new GoogleGenerativeAI(apiKey);

    const model = genAI.getGenerativeModel({
      model: body.model // 使用 body.model
    });

    const chat = model.startChat({
      history: convertToGoogleHistory(body.messages), // 使用 body.messages
    });

    const prompt = body.messages[body.messages.length - 1].content;
    const result = await chat.sendMessage(prompt);
    const response = result.response;

    if (!response || !response.text()) {
      throw new Error("Gemini API returned an empty response.");
    }

    // 4. 【【【 关键修复：使用标准 Response 返回 OpenAI 格式 】】】
    const responseBody = {
      id: 'gemini-' + Date.now(),
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: body.model,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: response.text(),
        },
        finish_reason: 'stop'
      }],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
    };

    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: getCorsHeaders()
    });

  } catch (error) {
    console.error("Gemini API Error:", error);

    // 5. 【【【 关键修复：使用标准 Response 返回 500 错误 】】】
    return new Response(JSON.stringify({
      error: { message: error.message || "An unknown error occurred" }
    }), {
      status: 500,
      headers: getCorsHeaders()
    });
  }
}

// --- 辅助函数 ---

function getApiKey(request) {
  const authHeader = request.headers.get('authorization');
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

// 6. 【【【 关键修复：CORS 标头改为辅助函数 】】】
function getCorsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function handleOptions() {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders()
  });
}
