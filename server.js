// server.js
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// =============================================
// DEBUG: Check if API Key is Loaded
// =============================================
console.log('🔍 Checking environment variables...');
console.log('🔑 GEMINI_API_KEY loaded:', process.env.GEMINI_API_KEY ? '✅ Yes' : '❌ No');
if (process.env.GEMINI_API_KEY) {
    console.log('🔑 API Key starts with:', process.env.GEMINI_API_KEY.substring(0, 10) + '...');
    console.log('🔑 API Key length:', process.env.GEMINI_API_KEY.length);
}

// =============================================
// CORS CONFIGURATION
// =============================================
const allowedOrigins = [
    'https://resumatriix.onrender.com',
    'http://localhost:3000',
    'http://localhost:5500',
    'http://127.0.0.1:5500'
];

app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            console.log('❌ Blocked CORS request from:', origin);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.static('.'));

// =============================================
// ROUTES
// =============================================

app.get('/', (req, res) => {
    res.json({
        status: 'online',
        message: 'Resume Matrix API is running',
        endpoints: {
            health: '/api/health',
            parseResume: '/api/parse-resume (POST)',
            testGemini: '/api/test-gemini'
        },
        apiKeyLoaded: !!process.env.GEMINI_API_KEY,
        timestamp: new Date().toISOString()
    });
});

app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        message: 'Server is running!',
        cors: 'enabled',
        apiKeyLoaded: !!process.env.GEMINI_API_KEY
    });
});

// =============================================
// TEST GEMINI ENDPOINT (Direct API Call)
// =============================================
app.get('/api/test-gemini', async (req, res) => {
    try {
        if (!process.env.GEMINI_API_KEY) {
            return res.status(503).json({
                error: 'API Key is not loaded',
                details: { apiKeyLoaded: false }
            });
        }

        console.log('🔍 Testing Gemini API with key:', process.env.GEMINI_API_KEY.substring(0, 10) + '...');
        
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: "Say 'Hello, Gemini is working!'"
                        }]
                    }]
                })
            }
        );

        const data = await response.json();
        console.log('📡 Gemini API Response Status:', response.status);
        
        if (!response.ok) {
            return res.status(response.status).json({
                error: 'Gemini API returned error',
                details: data,
                status: response.status
            });
        }

        res.json({
            status: 'ok',
            message: 'Gemini API is working!',
            response: data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response text',
            fullResponse: data
        });

    } catch (error) {
        console.error('❌ Gemini test failed:', error);
        res.status(500).json({
            error: 'Gemini test failed',
            details: error.message
        });
    }
});

// =============================================
// PARSE RESUME (Direct API Call)
// =============================================
app.post('/api/parse-resume', async (req, res) => {
    try {
        if (!process.env.GEMINI_API_KEY) {
            return res.status(503).json({
                error: 'API Key is not loaded',
                details: { apiKeyLoaded: false }
            });
        }

        const { resumeText } = req.body;

        if (!resumeText) {
            return res.status(400).json({ error: 'No resume text provided' });
        }

        if (resumeText.trim().length === 0) {
            return res.status(400).json({ error: 'Resume text is empty' });
        }

        console.log('📄 Parsing resume text of length:', resumeText.length);
        
        const prompt = `
Extract the resume information and return ONLY valid JSON with this exact structure:

{
  "personal_info": {
    "name": "",
    "email": "",
    "phone": "",
    "location": "",
    "profession": "",
    "linkedin": "",
    "github": "",
    "website": ""
  },
  "professional_summary": "",
  "experience": [
    {
      "company": "",
      "position": "",
      "start_date": "",
      "end_date": "",
      "description": ""
    }
  ],
  "education": [
    {
      "institution": "",
      "degree": "",
      "field": "",
      "start_date": "",
      "end_date": ""
    }
  ],
  "project": [
    {
      "name": "",
      "description": ""
    }
  ],
  "skills": []
}

Resume text:
${resumeText}

Return ONLY the JSON, no other text.
`;

        // Direct API call to Gemini
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: prompt
                        }]
                    }]
                })
            }
        );

        const data = await response.json();
        console.log('📡 Gemini API Response Status:', response.status);

        if (!response.ok) {
            console.error('❌ Gemini API Error:', data);
            return res.status(response.status).json({
                error: 'Gemini API returned error',
                details: data
            });
        }

        // Extract the response text
        let json = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        
        // Clean up the response
        json = json.replace(/```json/g, "");
        json = json.replace(/```/g, "");
        json = json.trim();

        console.log('📝 Parsed JSON length:', json.length);

        try {
            const parsed = JSON.parse(json);
            console.log('✅ Resume parsed successfully');
            res.json(parsed);
        } catch (parseError) {
            console.error('❌ Invalid JSON:', json);
            res.status(500).json({
                error: 'AI returned invalid JSON format',
                rawResponse: json
            });
        }

    } catch (error) {
        console.error('❌ Error in parse-resume:', error);
        res.status(500).json({
            error: 'Failed to parse resume',
            details: error.message
        });
    }
});

// =============================================
// START SERVER
// =============================================
app.listen(port, () => {
    console.log(`🚀 Server running on port ${port}`);
    console.log(`📝 Health check: /api/health`);
    console.log(`🔒 CORS enabled for:`, allowedOrigins);
    console.log(`🔑 API Key status: ${process.env.GEMINI_API_KEY ? '✅ Loaded' : '❌ NOT LOADED'}`);
    console.log(`🤖 Using native Gemini API endpoint (no SDK required)`);
});