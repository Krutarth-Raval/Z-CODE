// Run JavaScript natively in browser (no external API needed)
function runJavaScript(code) {
    const logs = [];

    // Sandbox: capture console methods
    const origLog   = console.log;
    const origError = console.error;
    const origWarn  = console.warn;
    const origInfo  = console.info;

    const fmt = (args) => args.map(a =>
        typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)
    ).join(' ');

    console.log   = (...a) => logs.push(fmt(a));
    console.error = (...a) => logs.push('[error] ' + fmt(a));
    console.warn  = (...a) => logs.push('[warn]  ' + fmt(a));
    console.info  = (...a) => logs.push('[info]  ' + fmt(a));

    try {
        // eslint-disable-next-line no-new-func
        new Function(code)();
        return { output: logs.join('\n') || '(no output)', isError: false };
    } catch (e) {
        logs.push(e.toString());
        return { output: logs.join('\n'), isError: true };
    } finally {
        console.log   = origLog;
        console.error = origError;
        console.warn  = origWarn;
        console.info  = origInfo;
    }
}

// Piston API for non-JS languages (free, no auth)
const PISTON_URL = 'https://emkc.org/api/v2/piston/execute';

const LANG_MAP = {
    python:     { language: 'python',     version: '3.10.0' },
    typescript: { language: 'typescript', version: '5.0.3'  },
    cpp:        { language: 'c++',        version: '10.2.0' },
    java:       { language: 'java',       version: '15.0.2' },
};

async function runViaPiston(language, code) {
    const lang = LANG_MAP[language];
    if (!lang) {
        return { output: `Execution not supported for: ${language}`, isError: true };
    }

    try {
        const res = await fetch(PISTON_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                language: lang.language,
                version:  lang.version,
                files:    [{ name: 'solution', content: code }],
                stdin:    '',
                args:     [],
            }),
        });

        if (!res.ok) {
            const text = await res.text().catch(() => '');
            return { output: `Execution service error: ${res.status}${text ? ' — ' + text : ''}`, isError: true };
        }

        const data = await res.json();
        const compile = data.compile || {};
        const run     = data.run     || {};

        if (compile.stderr) {
            return { output: compile.stderr.trim(), isError: true };
        }

        const out = (run.stdout || '') + (run.stderr ? '\n' + run.stderr : '');
        return { output: out.trim() || '(no output)', isError: run.code !== 0 };
    } catch (err) {
        return { output: `Network error: ${err.message}`, isError: true };
    }
}

// Public API
export async function runCode(language, code) {
    if (language === 'javascript') {
        return runJavaScript(code);
    }
    return runViaPiston(language, code);
}
