const fs     = require('fs');
const path   = require('path');
const os     = require('os');
const crypto = require('crypto');

const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const JSON_PATH  = path.join(CLAUDE_DIR, 'settings.json');
const TXT_PATH   = path.join(CLAUDE_DIR, 'settings.txt');
const ENC_PATH   = path.join(CLAUDE_DIR, 'settings.enc');

// ── Crypto: machine-bound AES-256-GCM ────────────────────────────────────────
function getMachineId() {
    try { return fs.readFileSync('/etc/machine-id', 'utf-8').trim(); }
    catch { try { return fs.readFileSync('/var/lib/dbus/machine-id', 'utf-8').trim(); }
    catch { return 'fallback-' + os.hostname(); } }
}
function deriveMachineKey() {
    return crypto.createHash('sha256')
        .update(`${getMachineId()}:${os.userInfo().username}:${os.homedir()}`).digest();
}
function encryptAesGcm(key, buf) {
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', key, iv);
    const enc = Buffer.concat([c.update(buf), c.final()]);
    return { iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: enc.toString('base64') };
}
function encryptToFile(plaintext, filePath) {
    const mk = deriveMachineKey();
    const dk = crypto.randomBytes(32);
    const bundle = { key: encryptAesGcm(mk, dk), settings: encryptAesGcm(dk, Buffer.from(plaintext, 'utf-8')) };
    fs.writeFileSync(filePath, JSON.stringify(bundle), { mode: 0o600 });
}

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
    console.log(`${BOLD}[1/4] Checking environment variables${RESET}`);
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

    console.log(`${BOLD}[2/4] Checking ~/.claude/settings.json${RESET}`);
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

    console.log(`${BOLD}[3/4] Preparing settings.txt${RESET}`);
    sep();

    const txtExists = fs.existsSync(TXT_PATH);

    if (txtExists) {
        ok(`settings.txt already exists: ${TXT_PATH}`);
        info('Skipping creation — not overwriting existing file.');
        console.log();
    } else if (fs.existsSync(ENC_PATH)) {
        ok('settings.enc already exists — skipping plaintext creation.');
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

    // ── Section 4: Encryption ──────────────────────────────────────────────
    console.log(`${BOLD}[4/4] Encrypting settings${RESET}`);
    sep();

    const encExists = fs.existsSync(ENC_PATH);
    const txtContent = fs.existsSync(TXT_PATH) ? fs.readFileSync(TXT_PATH, 'utf-8').trim() : '';
    const txtHasApi = txtContent.length > 0 && (txtContent.includes('sk-') || txtContent.includes('http'));

    if (encExists) {
        ok('settings.enc already exists. Encryption is active.');
        info('Skipping — not re-encrypting.');
        // Clean up old settings.key if present (migrated from two-file format)
        const oldKeyPath = path.join(CLAUDE_DIR, 'settings.key');
        if (fs.existsSync(oldKeyPath)) { fs.unlinkSync(oldKeyPath); info('Removed legacy settings.key (now bundled in settings.enc).'); }
    } else if (txtHasApi) {
        try {
            encryptToFile(txtContent, ENC_PATH);
            ok(`settings.txt encrypted → settings.enc: ${ENC_PATH}`);
            fs.unlinkSync(TXT_PATH);
            ok('settings.txt removed (migrated to encrypted storage).');
        } catch (e) {
            err(`Encryption failed: ${e.message}`);
            info('settings.txt left untouched. You can retry later.');
        }
    } else if (txtContent.length === 0 && !encExists) {
        info('settings.txt is empty — nothing to encrypt yet.');
        info('claude_manager.js will encrypt automatically when you add API configs.');
    } else {
        info('No API content detected in settings.txt. Encryption will activate on first save.');
    }
    // Clean up old settings.key if present
    const oldKeyPath2 = path.join(CLAUDE_DIR, 'settings.key');
    if (fs.existsSync(oldKeyPath2)) { fs.unlinkSync(oldKeyPath2); }
    console.log();


    console.log(`${BOLD}Summary${RESET}`);
    sep();

    const encExistsNow = fs.existsSync(ENC_PATH);
    const txtExistsNow = fs.existsSync(TXT_PATH);
    const jsonExistsNow = fs.existsSync(JSON_PATH);

    console.log(`  settings.enc  : ${encExistsNow  ? GREEN + 'ready' + RESET : YELLOW + 'pending' + RESET}  (${ENC_PATH})`);
    console.log(`  settings.txt  : ${txtExistsNow  ? YELLOW + 'unencrypted' + RESET : GREEN + 'migrated' + RESET}  (${TXT_PATH})`);
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
