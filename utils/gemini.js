const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const MODEL = 'gemini-2.5-flash';

async function callGemini(prompt, retries = 1) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
            temperature: 0.7,
            topP: 0.95,
            topK: 64,
            maxOutputTokens: 2048,
            responseMimeType: "application/json",
        }
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-goog-api-key': API_KEY
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        if (response.status === 429 && retries > 0) {
            await new Promise(res => setTimeout(res, 2000));
            return callGemini(prompt, retries - 1);
        }

        let errorMsg = `API Error ${response.status}: ${response.statusText}`;
        try {
            const errData = await response.json();
            if (errData?.error?.message) {
                errorMsg = `Gemini: ${errData.error.message}`;
            }
        } catch (_) {}

        throw new Error(errorMsg);
    }

    const data = await response.json();

    if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
        throw new Error('Gemini returned an empty or unexpected response. Please try again.');
    }

    try {
        return JSON.parse(data.candidates[0].content.parts[0].text);
    } catch (_) {
        throw new Error('Gemini returned non-JSON output. Please try again.');
    }
}

export const gemini = {
    async generateChallenge(language, difficulty) {
        const prompt = `
            Task: Generate a coding challenge.
            Language: ${language}
            Difficulty: ${difficulty}

            Return a JSON object with EXACTLY these keys:
            {
                "title": "Short descriptive title",
                "description": "Markdown description with clear objectives, constraints and input/output examples.",
                "initialCode": "Starter code boilerplate with function signatures and helpful comments.",
                "difficultyLabel": "${difficulty}"
            }

            Ensure the challenge is appropriate for the difficulty level.
        `;
        return await callGemini(prompt);
    },

    async evaluate(language, challenge, userCode) {
        const prompt = `
            Task: Evaluate a user's coding solution.
            Challenge Title: ${challenge.title}
            Challenge Description: ${challenge.description}
            Language: ${language}
            User's Code:
            \`\`\`${language}
            ${userCode}
            \`\`\`

            Return a JSON object with EXACTLY these keys:
            {
                "isCorrect": true or false,
                "feedback": "A short encouraging message or a clear description of what went wrong.",
                "errorLog": "If incorrect: a realistic console error message. If correct: empty string."
            }

            Be strict but fair. If the logic is correct even if slightly different, mark as correct.
        `;
        return await callGemini(prompt);
    },

    async solve(language, challenge) {
        const prompt = `
            Task: Help a student understand and solve this coding challenge without just giving away the answer immediately.
            Challenge: ${challenge.title}
            Description: ${challenge.description}
            Language: ${language}

            Return a JSON object with EXACTLY these keys:
            {
                "hints": ["hint 1", "hint 2", "hint 3"],
                "steps": ["Step 1: ...", "Step 2: ...", "Step 3: ...", "Step 4: ..."],
                "solution": "The complete, well-commented code solution."
            }

            - hints: 3 short nudges that guide thinking without revealing the algorithm
            - steps: 4-6 clear numbered steps explaining the approach/algorithm in plain English
            - solution: clean, readable code with inline comments explaining each part
        `;
        return await callGemini(prompt);
    }
};
