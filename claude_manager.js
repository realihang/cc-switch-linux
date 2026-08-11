const fs = require('fs');
const path = require('path');
const readline = require('readline');

const TXT_PATH = path.join(__dirname, 'settings.txt');
const JSON_PATH = path.join(__dirname, 'settings.json');

// -- Plaintext storage (no encryption) --

function readPlaintext() {
    if (!fs.existsSync(TXT_PATH)) return null;
    return fs.readFileSync(TXT_PATH, 'utf-8');
}

function parseSettingsContent(content) {
    const lines = content.split('\n');
    const accounts = [];
    let currentAccount = null;
    let currentApi = null;
    let buffer = [];
    let loadedModels = [];
    let inModels = false;

    const flushBuffer = () => {
        if (currentApi && buffer.length > 0) {
            const joined = buffer.join('\n').trim();
            if (joined.startsWith('{')) {
                try {
                    const json = JSON.parse(joined);
                    const url = json.env?.ANTHROPIC_BASE_URL || '';
                    const token = json.env?.ANTHROPIC_AUTH_TOKEN || '';
                    currentApi.config = `${url},${token}`;
                } catch (e) {
                    currentApi.config = joined;
                }
            } else {
                currentApi.config = joined;
            }
            buffer = [];
        }
    };

    for (let line of lines) {
        const tLine = line.trim();
        if (tLine === '@models') { inModels = true; continue; }
        if (inModels) {
            if (tLine !== '') {
                loadedModels = tLine.split(',').map(m => {
                    const idx = m.indexOf(':');
                    if (idx === -1) return null;
                    return { key: m.substring(0, idx).trim(), value: m.substring(idx + 1).trim() };
                }).filter(m => m && m.key && m.value);
                inModels = false;
            }
            continue;
        }
        if (tLine.startsWith('##')) {
            flushBuffer();
            currentApi = { name: tLine.substring(2).trim(), config: '' };
            if (currentAccount) currentAccount.apis.push(currentApi);
        } else if (tLine.startsWith('#')) {
            flushBuffer();
            currentAccount = { name: tLine.substring(1).trim(), apis: [] };
            accounts.push(currentAccount);
            currentApi = null;
        } else if (tLine !== '' && currentApi) {
            buffer.push(line);
        }
    }
    flushBuffer();
    return { accounts, models: loadedModels };
}

function loadData() {
    const content = readPlaintext();
    if (content !== null) return parseSettingsContent(content);
    return { accounts: [], models: [] };
}

function saveData() {
    let out = '';

    if (models.length > 0) {
        out += '@models\n';
        out += models.map(m => `${m.key}:${m.value}`).join(',') + '\n\n';
    }

    accounts.forEach(acc => {
        out += `#${acc.name}\n`;
        acc.apis.forEach(api => {
            out += `##${api.name}\n`;
            out += api.config + '\n\n';
        });
    });

    const plaintext = out.trim() + '\n';
    fs.writeFileSync(TXT_PATH, plaintext, 'utf-8');
}

function parseConfig(config) {
    const idx = config.indexOf(',');
    if (idx === -1) return { url: config, token: '' };
    return { url: config.substring(0, idx), token: config.substring(idx + 1) };
}

function getAllUrls() {
    const urls = new Set();
    accounts.forEach(acc => acc.apis.forEach(api => {
        const { url } = parseConfig(api.config);
        if (url) urls.add(url);
    }));
    return Array.from(urls);
}

function getActiveConfig() {
    if (!fs.existsSync(JSON_PATH)) return { account: 'Claude OFF', api: null, model: null };
    try {
        const settings = JSON.parse(fs.readFileSync(JSON_PATH, 'utf-8'));
        const activeToken = settings.env?.ANTHROPIC_AUTH_TOKEN;
        const activeUrl = settings.env?.ANTHROPIC_BASE_URL;
        const activeModel = settings.model;

        if ((!activeToken || activeToken === '') && (!activeUrl || activeUrl === '')) {
            return { account: 'Claude OFF', api: null, model: activeModel };
        }

        for (const acc of accounts) {
            for (const api of acc.apis) {
                const { url, token } = parseConfig(api.config);
                if (token === activeToken && url === activeUrl) {
                    return { account: acc.name, api: api.name, model: activeModel };
                }
            }
        }
        return { account: null, api: null, model: activeModel };
    } catch (e) {
        return { account: 'Claude OFF', api: null, model: null };
    }
}

// -- Sub-commands: ccshow / ccpasswd --

const _cmd = process.argv[2];

if (_cmd === 'show') {
    if (!fs.existsSync(TXT_PATH)) {
        console.log('No settings found. (' + TXT_PATH + ')');
        process.exit(1);
    }
    try {
        var content = fs.readFileSync(TXT_PATH, 'utf-8');
        var parsed = parseSettingsContent(content);
        var out = {};
        if (parsed.models && parsed.models.length > 0) {
            out._models = {};
            parsed.models.forEach(function(m) {
                out._models[m.key] = m.value;
            });
        }
        parsed.accounts.forEach(function(acc) {
            var apis = {};
            acc.apis.forEach(function(api) {
                var cfg = parseConfig(api.config);
                apis[api.name] = {
                    ANTHROPIC_BASE_URL: cfg.url,
                    ANTHROPIC_AUTH_TOKEN: cfg.token
                };
            });
            out[acc.name] = apis;
        });
        var json = JSON.stringify(out, null, 2);
        console.log(json);
    } catch (e) {
        console.error('Read failed:', e.message);
        process.exit(1);
    }
    process.exit(0);
}

if (_cmd === 'passwd') {
    console.log('passwd is no longer needed - settings are stored in plaintext.');
    process.exit(0);
}

const MODE = process.argv[2] === 'change' ? 'CHANGE' : 'SWITCH';
const data = loadData();
let accounts = data.accounts;
let models = data.models;
let urls = getAllUrls();

let state = {
    focus: 'LEFT',
    leftIdx: 0,
    rightIdx: 0,
    actionIdx: 0,
    urlIdx: 0,
    // When in SWITCH mode and user selected an API, we store it here
    // and redirect to model list for user to pick a model
    pendingSwitch: null,
    reorderMode: false  // 'm' key toggles: reorder accounts/apis/models with arrow keys
};

const ACTIONS = ['Update', 'Delete'];

function getStrWidth(str) {
    let width = 0;
    for (let i = 0; i < str.length; i++) {
        width += str.charCodeAt(i) > 255 ? 2 : 1;
    }
    return width;
}

function buildItemStr(item, pointerCol, symbolType, textCol) {
    if (!item) return { str: '', len: 0 };

    let pStr = '  ';
    if (pointerCol === 'cyan') pStr = '\x1b[36m❯ \x1b[0m';

    let sStr = '  ';
    if (symbolType === 'check') sStr = '\x1b[93m✔ \x1b[0m';
    if (symbolType === 'plus') sStr = '\x1b[32m+ \x1b[0m';
    if (symbolType === 'minus') sStr = '\x1b[31m- \x1b[0m';
    if (symbolType === 'model') sStr = '\x1b[35m◆ \x1b[0m';

    let tStr = item.text;
    if (textCol === 'cyan') tStr = `\x1b[36m${item.text}\x1b[0m`;
    if (textCol === 'yellow') tStr = `\x1b[93m${item.text}\x1b[0m`;
    if (textCol === 'green') tStr = `\x1b[32m${item.text}\x1b[0m`;
    if (textCol === 'red') tStr = `\x1b[31m${item.text}\x1b[0m`;
    if (textCol === 'white') tStr = `\x1b[0m${item.text}\x1b[0m`;
    if (textCol === 'magenta') tStr = `\x1b[35m${item.text}\x1b[0m`;

    const visualLength = getStrWidth(item.text);
    return { str: `${pStr}${sStr}${tStr}`, len: 4 + visualLength };
}

function isModelListIdx() {
    return state.leftIdx === accounts.length;
}

function render() {
    console.clear();
    const reorderTag = state.reorderMode ? ' \x1b[93m[REORDER]\x1b[0m' : '';
    console.log(`=========== Claude API Manager [Mode: ${MODE === 'SWITCH' ? 'Switch' : 'Change'}]${reorderTag} ===========`);
    const helpText = MODE === 'CHANGE'
        ? (state.reorderMode
            ? '[↑/↓]Swap [Enter/Esc] Done [Ctrl+C] Exit'
            : '[↑/↓]Move [Enter/Esc/F2/m] Select/Back/Rename/Reorder [Ctrl+C] Exit')
        : '[↑/↓]Move [Enter] Select [Esc] Back/Cancel [Ctrl+C] Exit';
    console.log(`${helpText}\n`);

    // Show hint when user needs to pick a model after API switch
    if (state.pendingSwitch) {
        console.log('\x1b[93m>> API selected! Now choose a model from the Model List below.\x1b[0m\n');
    }

    const activeStatus = getActiveConfig();
    const inModelList = isModelListIdx();

    const leftItems = accounts.map(a => ({ text: a.name, type: 'normal' }));
    leftItems.push({ text: 'Model List', type: 'model' });
    if (MODE === 'CHANGE') leftItems.push({ text: 'New User', type: 'add' });
    else leftItems.push({ text: 'Claude OFF', type: 'off' });

    let rightItems = [];
    if (inModelList) {
        rightItems = models.map(m => ({ text: m.key, type: 'normal' }));
        if (MODE === 'CHANGE') rightItems.push({ text: 'New Model', type: 'add' });
    } else if (state.leftIdx < accounts.length && accounts[state.leftIdx]) {
        rightItems = accounts[state.leftIdx].apis.map(a => ({ text: a.name, type: 'normal' }));
        if (MODE === 'CHANGE') {
            rightItems.push({ text: 'New API', type: 'add' });
            rightItems.push({ text: 'Delete User', type: 'delete' });
        }
    }

    const rightHeader = inModelList ? 'Models' : 'APIs';
    console.log('    Accounts' + ' '.repeat(28) + rightHeader);
    console.log('---------------------------------------------------------');

    const maxRows = Math.max(leftItems.length, rightItems.length);
    for (let i = 0; i < maxRows; i++) {
        const leftItem = leftItems[i];
        const rightItem = rightItems[i];

        // --- Left column ---
        let leftData = { str: '', len: 0 };
        if (leftItem) {
            const isHovered = (i === state.leftIdx);
            const isLeftApplied = MODE === 'SWITCH' && (
                (leftItem.type === 'normal' && leftItem.text === activeStatus.account) ||
                (leftItem.type === 'off' && activeStatus.account === 'Claude OFF')
            );

            let pCol = 'none';
            let sType = 'none';
            let tCol = 'white';

            if (isHovered && state.focus === 'LEFT') pCol = 'cyan';

            let isYellowCheck = false;
            if (MODE === 'SWITCH') {
                if (state.focus === 'RIGHT' || state.focus === 'ACTION') {
                    isYellowCheck = isHovered;
                } else {
                    isYellowCheck = isLeftApplied;
                }
            } else if (MODE === 'CHANGE') {
                if (state.focus !== 'LEFT' && isHovered) isYellowCheck = true;
            }

            if (leftItem.type === 'model') {
                if (isYellowCheck) {
                    sType = 'check';
                    tCol = 'yellow';
                } else {
                    sType = 'model';
                    if (isHovered && state.focus === 'LEFT') tCol = 'cyan';
                    else tCol = 'magenta';
                }
            } else if (isYellowCheck) {
                sType = 'check';
                tCol = 'yellow';
            } else if (leftItem.type === 'add') {
                sType = 'plus';
                tCol = 'green';
            } else if (leftItem.type === 'off') {
                sType = 'minus';
                tCol = 'red';
            } else {
                if (isHovered && state.focus === 'LEFT') tCol = 'cyan';
            }

            leftData = buildItemStr(leftItem, pCol, sType, tCol);
        }

        let rightData = { str: '', len: 0 };
        if (rightItem) {
            const isHovered = (i === state.rightIdx);

            let pCol = 'none';
            let sType = 'none';
            let tCol = 'white';

            if (isHovered && state.focus === 'RIGHT') pCol = 'cyan';

            let isYellowCheck = false;
            if (inModelList) {
                if (MODE === 'SWITCH' && rightItem.type === 'normal') {
                    const modelObj = models[i];
                    if (modelObj && modelObj.value === activeStatus.model) isYellowCheck = true;
                } else if (MODE === 'CHANGE') {
                    if (state.focus === 'ACTION' && isHovered) isYellowCheck = true;
                }
            } else {
                if (MODE === 'SWITCH') {
                    const isRightApplied = rightItem.type === 'normal' &&
                        accounts[state.leftIdx]?.name === activeStatus.account &&
                        rightItem.text === activeStatus.api;
                    isYellowCheck = isRightApplied;
                } else if (MODE === 'CHANGE') {
                    if ((state.focus === 'ACTION' || state.focus === 'URL') && isHovered) isYellowCheck = true;
                }
            }

            if (isYellowCheck) {
                sType = 'check';
                tCol = 'yellow';
            } else if (rightItem.type === 'add') {
                sType = 'plus';
                tCol = 'green';
            } else if (rightItem.type === 'delete') {
                sType = 'minus';
                tCol = 'red';
            } else {
                if (isHovered && state.focus === 'RIGHT') tCol = 'cyan';
            }

            rightData = buildItemStr(rightItem, pCol, sType, tCol);
        }

        const padLen = Math.max(0, 36 - leftData.len);
        console.log(`${leftData.str}${' '.repeat(padLen)}${rightData.str}`);
    }

    if (state.focus === 'URL') {
        console.log('\n---------------------------------------------------------');
        console.log('Select ANTHROPIC_BASE_URL:');
        const urlList = [...urls, '+ New URL'];
        urlList.forEach((u, i) => {
            console.log(i === state.urlIdx ? `\x1b[36m  ❯ ${u}\x1b[0m` : `    ${u}`);
        });
    } else if (state.focus === 'ACTION') {
        console.log('\n---------------------------------------------------------');
        if (inModelList) {
            const modelName = models[state.rightIdx]?.key || '';
            console.log(`Action for Model [\x1b[36m${modelName}\x1b[0m]:`);
        } else {
            const apiName = accounts[state.leftIdx]?.apis[state.rightIdx]?.name || '';
            console.log(`Action for API [\x1b[36m${apiName}\x1b[0m]:`);
        }
        ACTIONS.forEach((a, i) => {
            const displayColor = (a === 'Delete' && i === state.actionIdx) ? '\x1b[31m' : '\x1b[36m';
            console.log(i === state.actionIdx ? `${displayColor}  ❯ ${a}\x1b[0m` : `    ${a}`);
        });
    }
}

function promptText(query) {
    return new Promise(resolve => {
        process.stdin.removeListener('keypress', handleKeypress);
        setTimeout(() => {
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });

            let isCancelled = false;

            const escapeListener = (str, key) => {
                if (key && key.name === 'escape') {
                    isCancelled = true;
                    rl.close();
                    process.stdin.removeListener('keypress', escapeListener);
                    process.stdin.resume();
                    process.stdin.setRawMode(true);
                    process.stdin.on('keypress', handleKeypress);
                    resolve(null);
                }
            };

            process.stdin.on('keypress', escapeListener);

            rl.question(`\n\x1b[36m? \x1b[0m${query}`, ans => {
                if (isCancelled) return;
                process.stdin.removeListener('keypress', escapeListener);
                rl.close();
                process.stdin.resume();
                process.stdin.setRawMode(true);
                process.stdin.on('keypress', handleKeypress);
                resolve(ans.trim());
            });
        }, 50);
    });
}

async function confirmAction(message) {
    const ans = await promptText(`\x1b[31m⚠️  ${message}\x1b[0m `);
    if (ans === null) return false;
    const lowerAns = ans.toLowerCase();
    return ['y', 'yes'].includes(lowerAns);
}

async function handleApiConfig(isNew = true) {
    let apiName = isNew
        ? await promptText('Enter Model Name & Rate (e.g., Claude 4.75x): ')
        : accounts[state.leftIdx].apis[state.rightIdx].name;

    if (apiName === null || (isNew && !apiName)) {
        state.focus = 'RIGHT';
        render();
        return;
    }

    state.focus = 'URL';
    state.urlIdx = 0;
    urls = getAllUrls();
    render();

    state.tempApiName = apiName;
    state.isNewApi = isNew;
}

async function finishApiConfig(selectedUrl) {
    if (selectedUrl === '+ New URL') {
        const newUrl = await promptText('Enter new ANTHROPIC_BASE_URL: ');
        if (newUrl === null) {
            state.focus = 'URL';
            render();
            return;
        }
        selectedUrl = newUrl;
    }
    const token = await promptText('Enter ANTHROPIC_AUTH_TOKEN: ');
    if (token === null) {
        state.focus = 'URL';
        render();
        return;
    }

    const newConfig = `${selectedUrl},${token}`;

    if (state.isNewApi) {
        accounts[state.leftIdx].apis.push({ name: state.tempApiName, config: newConfig });
    } else {
        accounts[state.leftIdx].apis[state.rightIdx].config = newConfig;
    }

    saveData();

    process.stdin.removeListener('keypress', handleKeypress);

    state.focus = 'RIGHT';
    if (state.isNewApi) state.rightIdx = accounts[state.leftIdx].apis.length - 1;

    render();
    console.log('\n✅ Configuration saved to settings.txt!');

    setTimeout(() => {
        process.stdin.on('keypress', handleKeypress);
    }, 600);
}

// Complete a pending SWITCH: write settings with chosen model and exit
function completeSwitch(modelValue, modelKey) {
    process.stdin.removeListener('keypress', handleKeypress);
    const ps = state.pendingSwitch;
    let settings = {};
    try { if (fs.existsSync(JSON_PATH)) settings = JSON.parse(fs.readFileSync(JSON_PATH, 'utf-8')); } catch (e) {}
    if (!settings.env) settings.env = {};
    settings.env.ANTHROPIC_BASE_URL = ps.url;
    settings.env.ANTHROPIC_AUTH_TOKEN = ps.token;
    settings.model = modelValue;
    fs.writeFileSync(JSON_PATH, JSON.stringify(settings, null, 2), 'utf-8');
    render();
    setTimeout(() => {
        console.log(`\n✅ Switched to: \x1b[93m[${ps.userName}] ${ps.apiName}\x1b[0m  Model: \x1b[93m${modelKey} (${modelValue})\x1b[0m  \x1b[90m${ps.url}\x1b[0m`);
        process.exit(0);
    }, 500);
}

async function handleKeypress(str, key) {
    if (key.ctrl && key.name === 'c') process.exit();

    const isChange = MODE === 'CHANGE';
    const inModelList = isModelListIdx();

    // F2 - Rename
    if (key.name === 'f2') {
        if (!isChange) return;

        if (state.focus === 'LEFT') {
            if (state.leftIdx < accounts.length) {
                const oldName = accounts[state.leftIdx].name;
                const newName = await promptText(`Rename user [\x1b[36m${oldName}\x1b[0m] to: `);
                if (newName) {
                    accounts[state.leftIdx].name = newName;
                    saveData();
                }
                render();
            }
        } else if (state.focus === 'RIGHT') {
            if (inModelList) {
                if (state.rightIdx < models.length) {
                    const oldKey = models[state.rightIdx].key;
                    const newKey = await promptText(`Rename model [\x1b[36m${oldKey}\x1b[0m] to: `);
                    if (newKey) {
                        models[state.rightIdx].key = newKey;
                        saveData();
                    }
                    render();
                }
            } else if (accounts[state.leftIdx] && state.rightIdx < accounts[state.leftIdx].apis.length) {
                const oldName = accounts[state.leftIdx].apis[state.rightIdx].name;
                const newName = await promptText(`Rename API [\x1b[36m${oldName}\x1b[0m] to: `);
                if (newName) {
                    accounts[state.leftIdx].apis[state.rightIdx].name = newName;
                    saveData();
                }
                render();
            }
        }
        return;
    }

    // m - Toggle reorder mode (CHANGE mode only)
    if (key.name === 'm' && !key.ctrl && isChange && !state.pendingSwitch) {
        state.reorderMode = !state.reorderMode;
        if (!state.reorderMode) saveData();
        render();
        return;
    }

    // Calculate item counts
    const leftCount = accounts.length + 2;
    let rightCount = 0;
    if (inModelList) {
        rightCount = models.length + (isChange ? 1 : 0);
    } else if (accounts[state.leftIdx]) {
        rightCount = accounts[state.leftIdx].apis.length + (isChange ? 2 : 0);
    }
    const urlCount = urls.length + 1;

    // Up/Down
    if (key.name === 'up' || key.name === 'down') {
        const dir = key.name === 'up' ? -1 : 1;

        // In reorder mode: swap items instead of just moving cursor
        if (state.reorderMode) {
            if (state.focus === 'LEFT' && state.leftIdx < accounts.length) {
                const newIdx = state.leftIdx + dir;
                if (newIdx >= 0 && newIdx < accounts.length) {
                    [accounts[state.leftIdx], accounts[newIdx]] = [accounts[newIdx], accounts[state.leftIdx]];
                    state.leftIdx = newIdx;
                }
            } else if (state.focus === 'RIGHT' && inModelList) {
                const newIdx = state.rightIdx + dir;
                if (newIdx >= 0 && newIdx < models.length) {
                    [models[state.rightIdx], models[newIdx]] = [models[newIdx], models[state.rightIdx]];
                    state.rightIdx = newIdx;
                }
            } else if (state.focus === 'RIGHT' && accounts[state.leftIdx]) {
                const apis = accounts[state.leftIdx].apis;
                const newIdx = state.rightIdx + dir;
                if (newIdx >= 0 && newIdx < apis.length) {
                    [apis[state.rightIdx], apis[newIdx]] = [apis[newIdx], apis[state.rightIdx]];
                    state.rightIdx = newIdx;
                }
            }
            render();
            return;
        }

        if (state.focus === 'LEFT') state.leftIdx = Math.max(0, Math.min(leftCount - 1, state.leftIdx + dir));
        if (state.focus === 'RIGHT') state.rightIdx = Math.max(0, Math.min(rightCount - 1, state.rightIdx + dir));
        if (state.focus === 'ACTION') state.actionIdx = Math.max(0, Math.min(ACTIONS.length - 1, state.actionIdx + dir));
        if (state.focus === 'URL') state.urlIdx = Math.max(0, Math.min(urlCount - 1, state.urlIdx + dir));
        render();
        return;
    }

    if (key.name === 'escape') {
        // If reorder mode, exit and save
        if (state.reorderMode) {
            state.reorderMode = false;
            saveData();
            render();
            return;
        }
        // If pending switch, Esc returns to API selection
        if (state.pendingSwitch && state.focus === 'RIGHT' && inModelList) {
            state.pendingSwitch = null;
            state.focus = 'LEFT';
            state.leftIdx = 0;
            render();
            return;
        }
        if (state.focus === 'RIGHT') state.focus = 'LEFT';
        else if (state.focus === 'ACTION' || state.focus === 'URL') state.focus = 'RIGHT';
        render();
        return;
    }

    if (key.name === 'return') {
        // In reorder mode, Enter exits and saves
        if (state.reorderMode) {
            state.reorderMode = false;
            saveData();
            render();
            return;
        }

        if (state.focus === 'LEFT') {
            const modelListIdx = accounts.length;
            const lastIdx = accounts.length + 1;

            if (state.leftIdx === lastIdx) {
                if (isChange) {
                    const name = await promptText('Enter new username: ');
                    if (name === null || !name) {
                        state.focus = 'LEFT';
                        render();
                        return;
                    }
                    accounts.push({ name, apis: [] });
                    state.leftIdx = accounts.length - 1;
                    state.focus = 'RIGHT';
                    state.rightIdx = 0;
                    render();
                } else {
                    process.stdin.removeListener('keypress', handleKeypress);
                    let settings = {};
                    try { if (fs.existsSync(JSON_PATH)) settings = JSON.parse(fs.readFileSync(JSON_PATH, 'utf-8')); } catch (e) {}
                    if (!settings.env) settings.env = {};
                    settings.env.ANTHROPIC_BASE_URL = '';
                    settings.env.ANTHROPIC_AUTH_TOKEN = '';
                    fs.writeFileSync(JSON_PATH, JSON.stringify(settings, null, 2), 'utf-8');
                    render();
                    setTimeout(() => {
                        console.log(`\n✅ Claude OFF: Config cleared.`);
                        process.exit(0);
                    }, 500);
                }
            } else if (state.leftIdx === modelListIdx) {
                // Auto-select (SWITCH only): if only 1 model, skip directly
                if (!isChange && models.length === 1) {
                    if (state.pendingSwitch) {
                        completeSwitch(models[0].value, models[0].key);
                        return;
                    }
                    // Standalone model switch
                    process.stdin.removeListener('keypress', handleKeypress);
                    let settings = {};
                    try { if (fs.existsSync(JSON_PATH)) settings = JSON.parse(fs.readFileSync(JSON_PATH, 'utf-8')); } catch (e) {}
                    const autoUrl = settings.env?.ANTHROPIC_BASE_URL || '';
                    settings.model = models[0].value;
                    fs.writeFileSync(JSON_PATH, JSON.stringify(settings, null, 2), 'utf-8');
                    render();
                    setTimeout(() => {
                        console.log(`\n✅ Model switched to: \x1b[93m${models[0].key} (${models[0].value})\x1b[0m  \x1b[90m${autoUrl}\x1b[0m`);
                        process.exit(0);
                    }, 500);
                    return;
                }
                if (models.length > 0 || isChange) {
                    state.focus = 'RIGHT';
                    state.rightIdx = 0;
                    render();
                }
            } else if (accounts[state.leftIdx]?.apis.length > 0 || isChange) {
                // Auto-select (SWITCH only): if only 1 API, skip to model list
                if (!isChange && accounts[state.leftIdx].apis.length === 1) {
                    const targetApi = accounts[state.leftIdx].apis[0];
                    const { url, token } = parseConfig(targetApi.config);
                    state.pendingSwitch = {
                        url, token,
                        userName: accounts[state.leftIdx].name,
                        apiName: targetApi.name
                    };
                    // If only 1 model too, auto-complete
                    if (models.length === 1) {
                        completeSwitch(models[0].value, models[0].key);
                        return;
                    }
                    // Go to Model List
                    state.leftIdx = accounts.length;
                    state.focus = 'RIGHT';
                    state.rightIdx = 0;
                    render();
                    return;
                }
                // Account (multiple APIs - normal flow)
                state.focus = 'RIGHT';
                state.rightIdx = 0;
                render();
            }

        } else if (state.focus === 'RIGHT') {
            if (inModelList) {
                const isNewModelOption = isChange && state.rightIdx === models.length;

                if (isNewModelOption) {
                    const key = await promptText('Enter model name: ');
                    if (key === null || !key) { render(); return; }
                    const value = await promptText('Enter model value: ');
                    if (value === null || !value) { render(); return; }
                    models.push({ key, value });
                    saveData();
                    process.stdin.removeListener('keypress', handleKeypress);
                    state.rightIdx = models.length - 1;
                    render();
                    console.log('\n✅ Model added!');
                    setTimeout(() => {
                        process.stdin.on('keypress', handleKeypress);
                    }, 600);
                } else if (!isChange) {
                    // SWITCH mode: model selected
                    const selectedModel = models[state.rightIdx];

                    if (state.pendingSwitch) {
                        // Completing a pending API switch: write both API + model
                        completeSwitch(selectedModel.value, selectedModel.key);
                        return;
                    }

                    // Standalone model switch (no pending API change)
                    process.stdin.removeListener('keypress', handleKeypress);
                    let settings = {};
                    try { if (fs.existsSync(JSON_PATH)) settings = JSON.parse(fs.readFileSync(JSON_PATH, 'utf-8')); } catch (e) {}
                    const currentUrl = settings.env?.ANTHROPIC_BASE_URL || '';
                    settings.model = selectedModel.value;
                    fs.writeFileSync(JSON_PATH, JSON.stringify(settings, null, 2), 'utf-8');
                    render();
                    setTimeout(() => {
                        console.log(`\n✅ Model switched to: \x1b[93m${selectedModel.key} (${selectedModel.value})\x1b[0m  \x1b[90m${currentUrl}\x1b[0m`);
                        process.exit(0);
                    }, 500);
                } else {
                    state.focus = 'ACTION';
                    state.actionIdx = 0;
                    render();
                }
            } else {
                const apisLen = accounts[state.leftIdx].apis.length;
                const isNewApiOption = isChange && state.rightIdx === apisLen;
                const isDeleteUserOption = isChange && state.rightIdx === apisLen + 1;

                if (!isChange) {
                    // SWITCH mode: API selected - save pending info, then go to model list
                    const targetApi = accounts[state.leftIdx].apis[state.rightIdx];
                    const userName = accounts[state.leftIdx].name;
                    const { url, token } = parseConfig(targetApi.config);

                    state.pendingSwitch = {
                        url: url,
                        token: token,
                        userName: userName,
                        apiName: targetApi.name
                    };

                    // Navigate to Model List
                    state.leftIdx = accounts.length;  // Model List row
                    state.focus = 'RIGHT';
                    state.rightIdx = 0;
                    render();
                } else {
                    if (isNewApiOption) {
                        await handleApiConfig(true);
                    } else if (isDeleteUserOption) {
                        const userName = accounts[state.leftIdx].name;
                        const confirmed = await confirmAction(`Delete user [${userName}] and all APIs? (y/n)`);
                        if (confirmed) {
                            accounts.splice(state.leftIdx, 1);
                            saveData();
                            state.focus = 'LEFT';
                            state.leftIdx = Math.max(0, state.leftIdx - 1);
                        } else {
                            console.log('\n❌ Deletion cancelled.');
                            await new Promise(r => setTimeout(r, 800));
                        }
                        render();
                    } else {
                        state.focus = 'ACTION';
                        state.actionIdx = 0;
                        render();
                    }
                }
            }
        } else if (state.focus === 'ACTION') {
            if (inModelList) {
                if (ACTIONS[state.actionIdx] === 'Update') {
                    const oldValue = models[state.rightIdx].value;
                    const newValue = await promptText(`New value for [\x1b[36m${models[state.rightIdx].key}\x1b[0m] (current: ${oldValue}): `);
                    if (newValue) {
                        models[state.rightIdx].value = newValue;
                        saveData();
                    }
                    state.focus = 'RIGHT';
                    render();
                } else if (ACTIONS[state.actionIdx] === 'Delete') {
                    const modelKey = models[state.rightIdx].key;
                    const confirmed = await confirmAction(`Delete model [${modelKey}]? (y/n)`);
                    if (confirmed) {
                        models.splice(state.rightIdx, 1);
                        saveData();
                        state.rightIdx = Math.max(0, state.rightIdx - 1);
                    } else {
                        console.log('\n❌ Deletion cancelled.');
                        await new Promise(r => setTimeout(r, 800));
                    }
                    state.focus = 'RIGHT';
                    render();
                }
            } else {
                if (ACTIONS[state.actionIdx] === 'Update') {
                    await handleApiConfig(false);
                } else if (ACTIONS[state.actionIdx] === 'Delete') {
                    const apiName = accounts[state.leftIdx].apis[state.rightIdx].name;
                    const confirmed = await confirmAction(`Delete API [${apiName}]? (y/n)`);
                    if (confirmed) {
                        accounts[state.leftIdx].apis.splice(state.rightIdx, 1);
                        saveData();
                        state.rightIdx = Math.max(0, state.rightIdx - 1);
                    } else {
                        console.log('\n❌ Deletion cancelled.');
                        await new Promise(r => setTimeout(r, 800));
                    }
                    state.focus = 'RIGHT';
                    render();
                }
            }
        } else if (state.focus === 'URL') {
            const selectedUrl = state.urlIdx === urls.length ? '+ New URL' : urls[state.urlIdx];
            await finishApiConfig(selectedUrl);
        }
    }
}

readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) process.stdin.setRawMode(true);
process.stdin.on('keypress', handleKeypress);

render();
