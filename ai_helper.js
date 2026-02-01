
// ============================================
// AI ENGINE
// ============================================
const https = require('https');

const GENERIC_SYSTEM_PROMPT = `You are a helpful AI assistant integrated into a web browser.
Your goal is to provide concise, accurate, and helpful responses to user queries.
Format your responses using clean HTML tags (<div>, <p>, <ul>, <li>, <strong>, <em>, <h3>, <h4>) where appropriate.
Do not use markdown blocks (no \`\`\`html). Return raw inner HTML content.
For comparisons, use the requested structure.
For lists, use proper <ul> or <ol>.
Keep responses brief and directly address the prompt.`;

async function handleAISearch(prompt, settings, systemPrompt) {
    if (!settings) return { error: 'No settings provided' };

    // Default to OpenAI if not specified or keys missing but OpenAI present
    const provider = settings.aiProvider || 'openai';

    console.log(`[AI] Processing request using ${provider}`);

    try {
        if (provider === 'gemini') {
            return await callGeminiAI(prompt, settings.geminiKey, systemPrompt);
        } else if (provider === 'grok') {
            return await callGrokAI(prompt, settings.grokKey, systemPrompt);
        } else {
            // Default OpenAI
            const key = settings.intentsSearchKey || settings.openaiKey;
            return await callOpenAI(prompt, key, systemPrompt);
        }
    } catch (err) {
        console.error('[AI] Request failed:', err.message);
        return { error: err.message };
    }
}

async function callOpenAI(prompt, apiKey, systemPrompt) {
    if (!apiKey) return { error: 'OpenAI API Key missing' };

    const requestBody = JSON.stringify({
        model: "gpt-4o-mini", // Use a fast model
        messages: [
            { role: "system", content: systemPrompt || GENERIC_SYSTEM_PROMPT },
            { role: "user", content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 1000
    });

    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: 'api.openai.com',
            path: '/v1/chat/completions',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'Content-Length': Buffer.byteLength(requestBody)
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.error) {
                        resolve({ error: json.error.message });
                    } else if (json.choices && json.choices.length > 0) {
                        resolve({ summary: json.choices[0].message.content });
                    } else {
                        resolve({ error: 'No response from AI' });
                    }
                } catch (e) {
                    resolve({ error: 'Failed to parse AI response' });
                }
            });
        });

        req.on('error', (e) => resolve({ error: e.message }));
        req.write(requestBody);
        req.end();
    });
}

async function callGeminiAI(prompt, apiKey, systemPrompt) {
    if (!apiKey) return { error: 'Gemini API Key missing' };

    // Gemini doesn't use system prompt in the same way in v1beta/models/gemini-pro:generateContent
    // We prepend it to the user prompt for simplicity
    const fullPrompt = `${systemPrompt || GENERIC_SYSTEM_PROMPT}\n\nUser Query: ${prompt}`;

    const requestBody = JSON.stringify({
        contents: [{ parts: [{ text: fullPrompt }] }]
    });

    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: 'generativelanguage.googleapis.com',
            path: `/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(requestBody)
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.error) {
                        resolve({ error: json.error.message });
                    } else if (json.candidates && json.candidates[0].content) {
                        resolve({ summary: json.candidates[0].content.parts[0].text });
                    } else {
                        resolve({ error: 'No response from Gemini' });
                    }
                } catch (e) {
                    resolve({ error: 'Failed to parse Gemini response' });
                }
            });
        });

        req.on('error', (e) => resolve({ error: e.message }));
        req.write(requestBody);
        req.end();
    });
}

async function callGrokAI(prompt, apiKey, systemPrompt) {
    if (!apiKey) return { error: 'Grok API Key missing' };

    const requestBody = JSON.stringify({
        model: "grok-beta",
        messages: [
            { role: "system", content: systemPrompt || GENERIC_SYSTEM_PROMPT },
            { role: "user", content: prompt }
        ],
        stream: false
    });

    return new Promise((resolve) => {
        const req = https.request({
            hostname: 'api.x.ai',
            path: '/v1/chat/completions',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'Content-Length': Buffer.byteLength(requestBody)
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.error) {
                        resolve({ error: json.error.message });
                    } else if (json.choices && json.choices.length > 0) {
                        resolve({ summary: json.choices[0].message.content });
                    } else {
                        resolve({ error: 'No response from Grok' });
                    }
                } catch (e) {
                    resolve({ error: 'Failed to parse Grok response' });
                }
            });
        });
        req.on('error', (e) => resolve({ error: e.message }));
        req.write(requestBody);
        req.end();
    });
}

module.exports = { handleAISearch, GENERIC_SYSTEM_PROMPT };
