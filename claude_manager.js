const fs = require('fs');
const path = require('path');
const readline = require('readline');

const TXT_PATH = path.join(__dirname, 'settings.txt');
const JSON_PATH = path.join(__dirname, 'settings.json');

function loadAccounts() {
    if (!fs.existsSync(TXT_PATH)) return [];
    const content = fs.readFileSync(TXT_PATH, 'utf-8');
    const lines = content.split('\n');
    
    const accounts = [];
    let currentAccount = null;
    let currentApi = null;
    let jsonBuffer = [];

    const saveCurrentApi = () => {
        if (currentApi && jsonBuffer.length > 0) {
            try { currentApi.config = JSON.parse(jsonBuffer.join('\n')); } catch (e) {}
            jsonBuffer = [];
        }
    };

    for (let line of lines) {
        const tLine = line.trim();
        if (tLine.startsWith('##')) {
            saveCurrentApi();
            currentApi = { name: tLine.substring(2).trim(), config: {} };
            if (currentAccount) currentAccount.apis.push(currentApi);
        } else if (tLine.startsWith('#')) {
            saveCurrentApi();
            currentAccount = { name: tLine.substring(1).trim(), apis: [] };
            accounts.push(currentAccount);
            currentApi = null;
        } else if (tLine !== '') {
            if (currentApi) jsonBuffer.push(line);
        }
    }
    saveCurrentApi();
    return accounts;
}

function saveAccounts(accounts) {
    let out = '';
    accounts.forEach(acc => {
        out += `#${acc.name}\n`;
        acc.apis.forEach(api => {
            out += `##${api.name}\n`;
            out += JSON.stringify(api.config, null, 2) + '\n\n';
        });
    });
    fs.writeFileSync(TXT_PATH, out.trim() + '\n', 'utf-8');
}

function getAllUrls(accounts) {
    const urls = new Set();
    accounts.forEach(acc => acc.apis.forEach(api => {
        if (api.config?.env?.ANTHROPIC_BASE_URL) urls.add(api.config.env.ANTHROPIC_BASE_URL);
    }));
    return Array.from(urls);
}

function getActiveConfig() {
    let activeToken = null, activeUrl = null;
    if (fs.existsSync(JSON_PATH)) {
        try {
            const settings = JSON.parse(fs.readFileSync(JSON_PATH, 'utf-8'));
            activeToken = settings.env?.ANTHROPIC_AUTH_TOKEN;
            activeUrl = settings.env?.ANTHROPIC_BASE_URL;
        } catch(e) {}
    }
    
    if ((!activeToken || activeToken === "") && (!activeUrl || activeUrl === "")) {
        return { account: 'Claude OFF', api: null };
    }

    if (activeToken) {
        for (const acc of accounts) {
            for (const api of acc.apis) {
                if (api.config?.env?.ANTHROPIC_AUTH_TOKEN === activeToken &&
                    api.config?.env?.ANTHROPIC_BASE_URL === activeUrl) {
                    return { account: acc.name, api: api.name };
                }
            }
        }
    }
    return { account: null, api: null };
}

const MODE = process.argv[2] === 'change' ? 'CHANGE' : 'SWITCH';
let accounts = loadAccounts();
let urls = getAllUrls(accounts);

let state = {
    focus: 'LEFT',
    leftIdx: 0,
    rightIdx: 0,
    actionIdx: 0, 
    urlIdx: 0
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
    
    let tStr = item.text;
    if (textCol === 'cyan') tStr = `\x1b[36m${item.text}\x1b[0m`;
    if (textCol === 'yellow') tStr = `\x1b[93m${item.text}\x1b[0m`;
    if (textCol === 'green') tStr = `\x1b[32m${item.text}\x1b[0m`;
    if (textCol === 'red') tStr = `\x1b[31m${item.text}\x1b[0m`;
    if (textCol === 'white') tStr = `\x1b[0m${item.text}\x1b[0m`;
    
    const visualLength = getStrWidth(item.text);
    
    return { str: `${pStr}${sStr}${tStr}`, len: 4 + visualLength };
}

function render() {
    console.clear();
    console.log(`=========== Claude API Manager [Mode: ${MODE === 'SWITCH' ? 'Switch' : 'Change'}] ===========`);
    const helpText = MODE === 'CHANGE' 
        ? '[\u2191/\u2193]Move [Enter/Esc/F2] Select/Back/Rename [Ctrl+C] Exit' 
        : '[\u2191/\u2193]Move [Enter] Select [Esc] Back/Cancel [Ctrl+C] Exit';
    console.log(`${helpText}\n`);

    const activeStatus = getActiveConfig();

    const leftItems = accounts.map(a => ({ text: a.name, type: 'normal' }));
    if (MODE === 'CHANGE') leftItems.push({ text: 'New User', type: 'add' });
    else if (MODE === 'SWITCH') leftItems.push({ text: 'Claude OFF', type: 'off' });

    const rightItems = accounts[state.leftIdx] ? accounts[state.leftIdx].apis.map(a => ({ text: a.name, type: 'normal' })) : [];
    if (MODE === 'CHANGE' && accounts[state.leftIdx]) {
        rightItems.push({ text: 'New API', type: 'add' });
        rightItems.push({ text: 'Delete User', type: 'delete' });
    }

    console.log('    Accounts' + ' '.repeat(28) + 'APIs');
    console.log('---------------------------------------------------------');
    
    const maxRows = Math.max(leftItems.length, rightItems.length);
    for (let i = 0; i < maxRows; i++) {
        const leftItem = leftItems[i];
        const rightItem = rightItems[i];

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
                if (state.focus === 'RIGHT') {
                    isYellowCheck = isHovered; 
                } else {
                    isYellowCheck = isLeftApplied; 
                }
            } else if (MODE === 'CHANGE') {
                if (state.focus !== 'LEFT' && isHovered) isYellowCheck = true; 
            }

            if (isYellowCheck) {
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
            const isRightApplied = MODE === 'SWITCH' && rightItem.type === 'normal' && 
                                   accounts[state.leftIdx]?.name === activeStatus.account && 
                                   rightItem.text === activeStatus.api;

            let pCol = 'none';
            let sType = 'none';
            let tCol = 'white';

            if (isHovered && state.focus === 'RIGHT') pCol = 'cyan';

            let isYellowCheck = false;
            if (MODE === 'SWITCH') {
                isYellowCheck = isRightApplied; 
            } else if (MODE === 'CHANGE') {
                if ((state.focus === 'ACTION' || state.focus === 'URL') && isHovered) isYellowCheck = true; 
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
        const apiName = accounts[state.leftIdx].apis[state.rightIdx].name;
        console.log(`Action for API [\x1b[36m${apiName}\x1b[0m]:`);
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
    urls = getAllUrls(accounts);
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

    const newConfig = {
        env: {
            ANTHROPIC_BASE_URL: selectedUrl,
            ANTHROPIC_AUTH_TOKEN: token
        },
        model: "sonnet[1m]"
    };

    if (state.isNewApi) {
        accounts[state.leftIdx].apis.push({ name: state.tempApiName, config: newConfig });
    } else {
        accounts[state.leftIdx].apis[state.rightIdx].config = newConfig;
    }

    saveAccounts(accounts);

    process.stdin.removeListener('keypress', handleKeypress);
    
    state.focus = 'RIGHT';
    if (state.isNewApi) state.rightIdx = accounts[state.leftIdx].apis.length - 1; 
    
    render();
    console.log('\n✅ Configuration saved to settings.txt!');
    
    setTimeout(() => {
        process.stdin.on('keypress', handleKeypress);
    }, 600);
}

async function handleKeypress(str, key) {
    if (key.ctrl && key.name === 'c') process.exit();
    if (key.name === 'f2') {
        if (MODE !== 'CHANGE') return;

        if (state.focus === 'LEFT') {
            if (state.leftIdx < accounts.length) {
                const oldName = accounts[state.leftIdx].name;
                const newName = await promptText(`Rename user [\x1b[36m${oldName}\x1b[0m] to: `);
                if (newName) {
                    accounts[state.leftIdx].name = newName;
                    saveAccounts(accounts);
                }
                render();
            }
        } else if (state.focus === 'RIGHT') {
            if (accounts[state.leftIdx] && state.rightIdx < accounts[state.leftIdx].apis.length) {
                const oldName = accounts[state.leftIdx].apis[state.rightIdx].name;
                const newName = await promptText(`Rename API [\x1b[36m${oldName}\x1b[0m] to: `);
                if (newName) {
                    accounts[state.leftIdx].apis[state.rightIdx].name = newName;
                    saveAccounts(accounts);
                }
                render();
            }
        }
        return;
    }

    const isChange = MODE === 'CHANGE';
    const leftCount = accounts.length + (isChange ? 1 : 1); 
    const rightCount = accounts[state.leftIdx] ? accounts[state.leftIdx].apis.length + (isChange ? 2 : 0) : 0;
    const urlCount = urls.length + 1;

    if (key.name === 'up' || key.name === 'down') {
        const dir = key.name === 'up' ? -1 : 1;
        if (state.focus === 'LEFT') state.leftIdx = Math.max(0, Math.min(leftCount - 1, state.leftIdx + dir));
        if (state.focus === 'RIGHT') state.rightIdx = Math.max(0, Math.min(rightCount - 1, state.rightIdx + dir));
        if (state.focus === 'ACTION') state.actionIdx = Math.max(0, Math.min(ACTIONS.length - 1, state.actionIdx + dir));
        if (state.focus === 'URL') state.urlIdx = Math.max(0, Math.min(urlCount - 1, state.urlIdx + dir));
        render();
        return;
    }

    if (key.name === 'escape') {
        if (state.focus === 'RIGHT') state.focus = 'LEFT';
        else if (state.focus === 'ACTION' || state.focus === 'URL') state.focus = 'RIGHT';
        render();
        return;
    }

    if (key.name === 'return') {
        if (state.focus === 'LEFT') {
            if (state.leftIdx === accounts.length) {
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
                    settings.env.ANTHROPIC_BASE_URL = "";
                    settings.env.ANTHROPIC_AUTH_TOKEN = "";
                    
                    fs.writeFileSync(JSON_PATH, JSON.stringify(settings, null, 2), 'utf-8');
                    render();
                    setTimeout(() => {
                        console.log(`\n✅ Claude OFF: Config cleared.`);
                        process.exit(0);
                    }, 500);
                }
            } else if (accounts[state.leftIdx]?.apis.length > 0 || isChange) {
                state.focus = 'RIGHT';
                state.rightIdx = 0;
                render();
            }
            
        } else if (state.focus === 'RIGHT') {
            const apisLen = accounts[state.leftIdx].apis.length;
            const isNewApiOption = isChange && state.rightIdx === apisLen;
            const isDeleteUserOption = isChange && state.rightIdx === apisLen + 1;
            
            if (!isChange) {
                process.stdin.removeListener('keypress', handleKeypress);
                const targetApi = accounts[state.leftIdx].apis[state.rightIdx];
                const userName = accounts[state.leftIdx].name; 
                let settings = {};
                try { if (fs.existsSync(JSON_PATH)) settings = JSON.parse(fs.readFileSync(JSON_PATH, 'utf-8')); } catch (e) {}
                
                settings.env = targetApi.config.env || settings.env;
                settings.model = targetApi.config.model || settings.model;
                
                fs.writeFileSync(JSON_PATH, JSON.stringify(settings, null, 2), 'utf-8');
                
                render(); 
                setTimeout(() => {
                    console.log(`\n✅ Successfully switched to: \x1b[93m[${userName}] ${targetApi.name}\x1b[0m`);
                    process.exit(0);
                }, 500); 

            } else {
                if (isNewApiOption) {
                    await handleApiConfig(true);
                } else if (isDeleteUserOption) {
                    const userName = accounts[state.leftIdx].name;
                    const confirmed = await confirmAction(`Delete user [${userName}] and all APIs? (y/n)`);
                    if (confirmed) {
                        accounts.splice(state.leftIdx, 1);
                        saveAccounts(accounts);
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
        } else if (state.focus === 'ACTION') {
            if (ACTIONS[state.actionIdx] === 'Update') {
                await handleApiConfig(false);
            } else if (ACTIONS[state.actionIdx] === 'Delete') {
                const apiName = accounts[state.leftIdx].apis[state.rightIdx].name;
                const confirmed = await confirmAction(`Delete API [${apiName}]? (y/n)`);
                if (confirmed) {
                    accounts[state.leftIdx].apis.splice(state.rightIdx, 1);
                    saveAccounts(accounts);
                    state.rightIdx = Math.max(0, state.rightIdx - 1);
                } else {
                    console.log('\n❌ Deletion cancelled.');
                    await new Promise(r => setTimeout(r, 800));
                }
                state.focus = 'RIGHT';
                render();
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