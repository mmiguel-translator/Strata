// Netlify serverless function: proxies a single prompt to the Anthropic API
// so the API key stays server-side. Requires Node 18+ (global fetch) — pinned
// via NODE_VERSION in netlify.toml.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' };
  }

  if (typeof fetch !== 'function') {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Server is running a Node version older than 18. Set NODE_VERSION=18 in Netlify build settings.' }) };
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

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY not set in Netlify environment variables' }) };
  }

  let response;
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 512,
        messages: [{ role: 'user', content: prompt }]
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
    return { statusCode: 502, headers: CORS, body: JSON.stringify({ error: 'Malformed response from Anthropic API' }) };
  }

  const text = (data && Array.isArray(data.content) && data.content[0] && data.content[0].text) || '';

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', ...CORS },
    body: JSON.stringify({ text })
  };
};
