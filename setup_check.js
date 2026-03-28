const fs   = require('fs');
const path = require('path');
const os   = require('os');

const CLAUDE_DIR  = path.join(os.homedir(), '.claude');
const JSON_PATH   = path.join(CLAUDE_DIR, 'settings.json');
const TXT_PATH    = path.join(CLAUDE_DIR, 'settings.txt');

const RESET  = '\x1b[0m';
const BOLD   = '\x1b[1m';
const GREEN  = '\x1b[32m';
const YELLOW = '\x1b[93m';
const RED    = '\x1b[31m';
const CYAN   = '\x1b[36m';
const DIM    = '\x1b[2m';

function ok(msg)   { console.log(`  ${GREEN}✔${RESET}  ${msg}`); }
function warn(msg) { console.log(`  ${YELLOW}⚠${RESET}  ${msg}`); }
function info(msg) { console.log(`  ${CYAN}ℹ${RESET}  ${msg}`); }
function err(msg)  { console.log(`  ${RED}✖${RESET}  ${msg}`); }
function sep()     { console.log(`${DIM}${'─'.repeat(60)}${RESET}`); }

function checkEnvVars() {
    const url   = process.env.ANTHROPIC_BASE_URL   || null;
    const token = process.env.ANTHROPIC_AUTH_TOKEN || null;
    return { url, token };
}

function readSettingsJson() {
    if (!fs.existsSync(JSON_PATH)) return { exists: false, data: null };
    try {
        const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf-8'));
        return { exists: true, data };
    } catch (e) {
        return { exists: true, data: null, parseError: e.message };
    }
}

function buildSettingsTxtEntry(url, token, source) {
    const config = {
        env: {
            ANTHROPIC_BASE_URL:   url   || '',
            ANTHROPIC_AUTH_TOKEN: token || ''
        },
        model: 'sonnet[1m]'
    };
    return `#LegacyAccount\n##Imported from ${source}\n${JSON.stringify(config, null, 2)}\n`;
}

function clearEnvFromSettings(data) {
    const cleaned = JSON.parse(JSON.stringify(data)); // deep clone
    if (cleaned.env) {
        delete cleaned.env.ANTHROPIC_BASE_URL;
        delete cleaned.env.ANTHROPIC_AUTH_TOKEN;
        // remove env block entirely if now empty
        if (Object.keys(cleaned.env).length === 0) delete cleaned.env;
    }
    return cleaned;
}

function main() {
    console.log();
    console.log(`${BOLD}╔══════════════════════════════════════════════════════════╗${RESET}`);
    console.log(`${BOLD}║        cc-switch-linux  —  First-Run Setup Check         ║${RESET}`);
    console.log(`${BOLD}╚══════════════════════════════════════════════════════════╝${RESET}`);
    console.log();

    // ── Section 1: Environment variables ─────────────────────────────────────
    console.log(`${BOLD}[1/3] Checking environment variables${RESET}`);
    sep();
    const envVars = checkEnvVars();
    let envHasConfig = false;

    if (envVars.url || envVars.token) {
        envHasConfig = true;
        warn(`ANTHROPIC_BASE_URL   is set in environment: ${envVars.url || '(empty)'}`);
        warn(`ANTHROPIC_AUTH_TOKEN is set in environment: ${envVars.token ? '(present, hidden)' : '(empty)'}`);
        warn('These shell-level variables can override settings.json and may conflict.');
        info('Tip: remove them from ~/.bashrc / ~/.zshrc / ~/.profile after migration.');
    } else {
        ok('No ANTHROPIC_* environment variables detected.');
    }
    console.log();

    console.log(`${BOLD}[2/3] Checking ~/.claude/settings.json${RESET}`);
    sep();
    const { exists: jsonExists, data: jsonData, parseError } = readSettingsJson();

    if (!jsonExists) {
        warn('settings.json not found. Claude Code may not be installed yet.');
        info(`Expected location: ${JSON_PATH}`);
    } else if (parseError) {
        err(`settings.json exists but could not be parsed: ${parseError}`);
    } else {
        ok(`settings.json found: ${JSON_PATH}`);
    }

    const jsonUrl   = jsonData?.env?.ANTHROPIC_BASE_URL   || null;
    const jsonToken = jsonData?.env?.ANTHROPIC_AUTH_TOKEN || null;
    const jsonHasConfig = !!(jsonUrl || jsonToken);

    if (jsonHasConfig) {
        warn(`settings.json contains an existing API config:`);
        info(`  ANTHROPIC_BASE_URL:   ${jsonUrl   || '(empty)'}`);
        info(`  ANTHROPIC_AUTH_TOKEN: ${jsonToken ? '(present, hidden)' : '(empty)'}`);
    } else if (jsonExists && !parseError) {
        ok('settings.json has no conflicting API credentials.');
    }
    console.log();

    console.log(`${BOLD}[3/3] Preparing settings.txt${RESET}`);
    sep();

    const txtExists = fs.existsSync(TXT_PATH);

    if (txtExists) {
        ok(`settings.txt already exists: ${TXT_PATH}`);
        info('Skipping creation — not overwriting existing file.');
        console.log();
    } else if (jsonHasConfig || envHasConfig) {
        const legacyUrl   = jsonUrl   || envVars.url   || '';
        const legacyToken = jsonToken || envVars.token || '';
        const source      = jsonHasConfig ? 'settings.json' : 'environment variables';

        const txtContent = buildSettingsTxtEntry(legacyUrl, legacyToken, source);
        fs.writeFileSync(TXT_PATH, txtContent, 'utf-8');
        ok(`Legacy config extracted → settings.txt created: ${TXT_PATH}`);
        info(`  Source: ${source}`);
        info(`  Account: LegacyAccount / "Imported from ${source}"`);

        if (jsonHasConfig && jsonData) {
            const cleaned = clearEnvFromSettings(jsonData);
            fs.writeFileSync(JSON_PATH, JSON.stringify(cleaned, null, 2) + '\n', 'utf-8');
            ok('ANTHROPIC_BASE_URL and ANTHROPIC_AUTH_TOKEN removed from settings.json.');
            info('All other settings.json fields preserved.');
        }
        console.log();
    } else {
        fs.writeFileSync(TXT_PATH, '', 'utf-8');
        ok(`No legacy config found. Empty settings.txt created: ${TXT_PATH}`);
        info('Use `cchange` to add your first API account.');
        console.log();
    }

    console.log(`${BOLD}Summary${RESET}`);
    sep();

    const txtExistsNow = fs.existsSync(TXT_PATH);
    const jsonExistsNow = fs.existsSync(JSON_PATH);

    console.log(`  settings.txt  : ${txtExistsNow  ? GREEN + 'ready' + RESET : RED + 'missing' + RESET}  (${TXT_PATH})`);
    console.log(`  settings.json : ${jsonExistsNow ? GREEN + 'ready' + RESET : YELLOW + 'not found' + RESET}  (${JSON_PATH})`);

    if (envHasConfig) {
        console.log();
        warn('ACTION REQUIRED: ANTHROPIC_* env vars are still active in this shell.');
        info('Remove them from your shell profile to avoid conflicts with cc-switch-linux.');
    }

    console.log();
    console.log(`${GREEN}${BOLD}Setup check complete.${RESET}`);
    console.log(`${DIM}Next steps: copy claude_manager.js to ~/.claude/ and add aliases to ~/.bashrc${RESET}`);
    console.log();
}

main();
