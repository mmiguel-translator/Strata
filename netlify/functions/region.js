// Netlify serverless function — proxies one prompt to Google's Gemini API
// (free tier) so the API key stays server-side. Requires Node 18+ (global
// fetch), pinned via NODE_VERSION in netlify.toml.
//
// Setup: get a free key at https://aistudio.google.com/app/apikey (no credit
// card), then in Netlify add an environment variable GEMINI_API_KEY = your key.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const MODEL = 'gemini-1.5-flash';

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' };
  }
  if (typeof fetch !== 'function') {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Node older than 18 — set NODE_VERSION=18 in Netlify.' }) };
  }

  let prompt;
  try {
    ({ prompt } = JSON.parse(event.body || '{}'));
  } catch (_) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }
  if (!prompt) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Missing prompt' }) };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'GEMINI_API_KEY not set in Netlify environment variables' }) };
  }

  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + MODEL + ':generateContent?key=' + encodeURIComponent(apiKey);

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 512 }
      })
    });
  } catch (e) {
    return { statusCode: 502, headers: CORS, body: JSON.stringify({ error: 'Upstream request failed: ' + String(e && e.message || e) }) };
  }

  if (!response.ok) {
    const err = await response.text().catch(() => String(response.status));
    return { statusCode: 502, headers: CORS, body: JSON.stringify({ error: err }) };
  }

  let data;
  try {
    data = await response.json();
  } catch (_) {
    return { statusCode: 502, headers: CORS, body: JSON.stringify({ error: 'Malformed response from Gemini API' }) };
  }

  const text =
    (data &&
      data.candidates &&
      data.candidates[0] &&
      data.candidates[0].content &&
      data.candidates[0].content.parts &&
      data.candidates[0].content.parts[0] &&
      data.candidates[0].content.parts[0].text) || '';

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', ...CORS },
    body: JSON.stringify({ text })
  };
};
