// server.js
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
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
// Initialize Gemini
// =============================================
let genAI = null;
let GeminiInitialized = false;

try {
    if (!process.env.GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY is not set in environment variables');
    }
    
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    GeminiInitialized = true;
    console.log('✅ Gemini API initialized successfully');
} catch (error) {
    console.error('❌ Failed to initialize Gemini API:', error.message);
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
        geminiInitialized: GeminiInitialized,
        timestamp: new Date().toISOString()
    });
});

app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        message: 'Server is running!',
        cors: 'enabled',
        apiKeyLoaded: !!process.env.GEMINI_API_KEY,
        geminiInitialized: GeminiInitialized
    });
});

app.get('/api/test-gemini', async (req, res) => {
    try {
        if (!GeminiInitialized || !genAI) {
            return res.status(503).json({
                error: 'Gemini API is not initialized',
                details: {
                    apiKeyLoaded: !!process.env.GEMINI_API_KEY,
                    geminiInitialized: GeminiInitialized
                }
            });
        }

        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const result = await model.generateContent("Say 'Hello, Gemini is working!'");
        const response = await result.response;
        
        res.json({
            status: 'ok',
            message: 'Gemini API is working!',
            response: response.text()
        });
    } catch (error) {
        console.error('❌ Gemini test failed:', error);
        res.status(500).json({
            error: 'Gemini test failed',
            details: error.message
        });
    }
});

app.post('/api/parse-resume', async (req, res) => {
    try {
        if (!GeminiInitialized || !genAI) {
            return res.status(503).json({
                error: 'Gemini API is not initialized. Please check your API key.',
                details: {
                    apiKeyLoaded: !!process.env.GEMINI_API_KEY,
                    geminiInitialized: GeminiInitialized
                }
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
        const parsedData = await parseResumeWithAI(resumeText);
        console.log('✅ Resume parsed successfully');
        res.json(parsedData);

    } catch (error) {
        console.error('❌ Error in parse-resume:', error);
        res.status(500).json({ error: error.message });
    }
});

// =============================================
// AI PARSING FUNCTION
// =============================================
async function parseResumeWithAI(resumeText) {
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

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        let json = response.text();

        json = json.replace(/```json/g, "");
        json = json.replace(/```/g, "");
        json = json.trim();

        try {
            const parsed = JSON.parse(json);
            return parsed;
        } catch (parseError) {
            console.error('Invalid JSON:', json);
            throw new Error('AI returned invalid JSON format');
        }
    } catch (error) {
        console.error('AI parsing error:', error);
        throw new Error('Failed to parse resume with AI: ' + error.message);
    }
}

// =============================================
// START SERVER
// =============================================
app.listen(port, () => {
    console.log(`🚀 Server running on port ${port}`);
    console.log(`📝 Health check: /api/health`);
    console.log(`🔒 CORS enabled for:`, allowedOrigins);
    console.log(`🔑 API Key status: ${process.env.GEMINI_API_KEY ? '✅ Loaded' : '❌ NOT LOADED'}`);
    console.log(`🤖 Gemini API status: ${GeminiInitialized ? '✅ Initialized' : '❌ NOT INITIALIZED'}`);
});