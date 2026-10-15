// Cloudflare Worker: relays photo -> Gemini image API -> caricature image.
// Keeps GEMINI_API_KEY server-side; the static site never sees it.

const GEMINI_MODEL = 'gemini-2.5-flash-image';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const CARICATURE_PROMPT = `Turn this photo into a fun, hand-drawn caricature-style cartoon portrait.
Exaggerate the person's distinctive facial features (eyes, nose, smile, hair, face shape) in a playful,
flattering way like a street-artist caricature sketch, while keeping the person clearly recognizable.
Render it as a single stylized character illustration with clean linework and a simple background.
Do not add any text, logo, or watermark.`;

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

export default {
  async fetch(request, env) {
    const origin = env.ALLOWED_ORIGIN || '*';

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(origin) });
    }
    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405, origin);
    }
    if (!env.GEMINI_API_KEY) {
      return json({ error: 'Server is missing GEMINI_API_KEY' }, 500, origin);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, 400, origin);
    }

    const dataUrl = body && body.image;
    const match = typeof dataUrl === 'string' && dataUrl.match(/^data:(image\/[a-zA-Z+.-]+);base64,(.+)$/);
    if (!match) {
      return json({ error: 'Expected { image: "data:image/...;base64,..." }' }, 400, origin);
    }
    const [, mimeType, base64Data] = match;

    const geminiRequest = {
      contents: [
        {
          parts: [
            { text: CARICATURE_PROMPT },
            { inlineData: { mimeType, data: base64Data } },
          ],
        },
      ],
      generationConfig: { responseModalities: ['IMAGE'] },
    };

    let upstream;
    try {
      upstream = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': env.GEMINI_API_KEY,
        },
        body: JSON.stringify(geminiRequest),
      });
    } catch (err) {
      return json({ error: `Failed to reach Gemini API: ${err.message}` }, 502, origin);
    }

    const upstreamJson = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      const message = upstreamJson?.error?.message || `Gemini API error (${upstream.status})`;
      return json({ error: message }, 502, origin);
    }

    const parts = upstreamJson?.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find((p) => p.inlineData && p.inlineData.data);
    if (!imagePart) {
      const textPart = parts.find((p) => p.text)?.text;
      return json(
        { error: textPart || 'Gemini did not return an image (it may have refused the request).' },
        422,
        origin
      );
    }

    const outMime = imagePart.inlineData.mimeType || 'image/png';
    return json({ image: `data:${outMime};base64,${imagePart.inlineData.data}` }, 200, origin);
  },
};
