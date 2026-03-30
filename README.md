<div align="center">

# cc-switch-linux

**A terminal UI (TUI) for managing multiple Claude API configurations on Linux**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D14-green.svg)](https://nodejs.org/)
[![Platform](https://img.shields.io/badge/Platform-Linux-blue.svg)](https://github.com/LiHang-CV/cc-switch-linux)

</div>

---

<p align="center">
  <a href="#english">English</a> &nbsp;|&nbsp;
  <a href="#中文">中文</a> &nbsp;|&nbsp;
  <a href="#changelog">Changelog</a>
</p>

---

<a id="english"></a>

## English

### What is this?

`cc-switch-linux` is an interactive terminal UI tool for Linux that lets you store multiple Claude API accounts and configurations in a plain-text file (`settings.txt`) and switch the active one into Claude Code's `settings.json` instantly — no manual editing required.

### Features

- **Switch Mode** (`ccswitch`) — quickly activate any stored API configuration
- **Change Mode** (`cchange`) — add / update / delete accounts and API entries
- **Show** (`ccshow`) — decrypt and display stored settings (machine-bound)
- **Encrypt** (`ccpasswd`) — encrypt `settings.txt` → `settings.enc`, then remove plaintext
- **Model List** — define a shared model list in `settings.txt`; select the active model directly from the TUI
- Keyboard-driven TUI: `↑ ↓ Enter Esc Ctrl+C`
- Multi-account support, each with multiple API entries
- AES-256-GCM encryption — settings encrypted at rest, key derived from machine identity

### Requirements

- Node.js ≥ 14
- Linux (uses terminal raw mode)
- [Claude Code CLI](https://claude.ai/code) (`settings.json` must exist in the same directory as the script)

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/realihang/cc-switch-linux.git
   ```

2. **Run the setup check** (first-time only)

   ```bash
   node cc-switch-linux/setup_check.js
   ```

   This script inspects your existing environment for any prior Claude configuration
   (`ANTHROPIC_*` env vars, `~/.claude/settings.json`) and handles it automatically:

   - If legacy config is found → extracts it into `~/.claude/settings.txt` and clears
     the API credentials from `settings.json` (all other settings are preserved)
   - If no legacy config → creates an empty `~/.claude/settings.txt` ready for use

3. **Copy the script to your Claude config directory**

   ```bash
   cp cc-switch-linux/claude_manager.js ~/.claude/
   ```

4. **Add aliases to `~/.bashrc`**

   ```bash
   alias ccswitch="node ~/.claude/claude_manager.js switch"
   alias cchange="node ~/.claude/claude_manager.js change"
   alias ccshow="node ~/.claude/claude_manager.js show"
   alias ccpasswd="node ~/.claude/claude_manager.js passwd"
   ```

5. **Reload your shell**

   ```bash
   source ~/.bashrc
   ```

### Usage

```bash
ccswitch   # Open Switch UI — pick the active API
cchange    # Open Change UI — manage accounts & APIs
ccshow     # Decrypt and print stored settings to stdout
ccpasswd   # Encrypt settings.txt → settings.enc (if .txt exists)
```

| Key | Action |
|-----|--------|
| `↑` / `↓` | Navigate |
| `Enter` | Select / Confirm |
| `Esc` | Go back / Cancel |
| `F2` | Rename (Change mode only) |
| `Ctrl+C` | Exit |

### `settings.txt` Format

```
@models
Claude Sonnet 4.5:claude-sonnet-4-5,Claude Haiku 4.5:claude-haiku-4-5

#AccountName
##API Entry Name (e.g. Claude 4.75x)
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://your-api-endpoint/v1",
    "ANTHROPIC_AUTH_TOKEN": "your-token-here"
  }
}
```

> **`@models`** *(optional)* — defines the selectable model list shown in the TUI.
> Format: comma-separated `DisplayName:model-value` pairs.
> Models can be switched independently of account credentials.

> ⚠️ **Never commit `settings.txt` or `settings.json`** — they contain your API tokens.
> Both files are already listed in `.gitignore`.

---

<a id="中文"></a>

## 中文

### 这是什么？

`cc-switch-linux` 是一个 Linux 终端 UI（TUI）工具，将多个 Claude API 账户和配置保存在纯文本文件（`settings.txt`）中，一键将选中的配置写入 Claude Code 的 `settings.json`，无需手动编辑。

### 功能特性

- **切换模式**（`ccswitch`）— 快速激活任意已存储的 API 配置
- **管理模式**（`cchange`）— 增加 / 更新 / 删除账户和 API 条目
- **查看**（`ccshow`）— 解密并显示已存储的配置明文
- **加密**（`ccpasswd`）— 将 `settings.txt` 加密为 `settings.enc` 并删除明文
- **模型列表** — 在 `settings.txt` 中定义共享模型列表；可直接在 TUI 中选择当前激活的模型
- 键盘驱动 TUI：`↑ ↓ Enter Esc Ctrl+C`
- 支持多账户，每个账户可配置多条 API
- AES-256-GCM 加密 — 配置静态加密，密钥绑定机器身份

### 环境要求

- Node.js ≥ 14
- Linux（使用终端 raw 模式）
- [Claude Code CLI](https://claude.ai/code)（`settings.json` 需与脚本在同一目录）

### 安装步骤

1. **克隆仓库**

   ```bash
   git clone https://github.com/realihang/cc-switch-linux.git
   ```

2. **运行自检脚本**（仅首次）

   ```bash
   node cc-switch-linux/setup_check.js
   ```

   该脚本会检查系统中是否存在旧的 Claude 配置（`ANTHROPIC_*` 环境变量、`~/.claude/settings.json`），并自动处理：

   - 若发现旧配置 → 提取至 `~/.claude/settings.txt`，并清除 `settings.json` 中的 API 凭据（其他配置保留）
   - 若无旧配置 → 创建空的 `~/.claude/settings.txt`，可直接使用

3. **将脚本复制到 Claude 配置目录**

   ```bash
   cp cc-switch-linux/claude_manager.js ~/.claude/
   ```

4. **在 `~/.bashrc` 添加别名**

   ```bash
   alias ccswitch="node ~/.claude/claude_manager.js switch"
   alias cchange="node ~/.claude/claude_manager.js change"
   alias ccshow="node ~/.claude/claude_manager.js show"
   alias ccpasswd="node ~/.claude/claude_manager.js passwd"
   ```

5. **重新加载 Shell**

   ```bash
   source ~/.bashrc
   ```

### 使用方法

```bash
ccswitch   # 打开切换 UI，选择当前激活的 API
cchange    # 打开管理 UI，管理账户和 API
ccshow     # 解密并打印已存储的配置明文
ccpasswd   # 将 settings.txt 加密为 settings.enc（如 .txt 存在）
```

| 按键 | 操作 |
|------|------|
| `↑` / `↓` | 上下导航 |
| `Enter` | 确认选择 |
| `Esc` | 返回 / 取消 |
| `F2` | 重命名（仅 Change 模式）|
| `Ctrl+C` | 退出 |

### `settings.txt` 格式

```
@models
模型显示名1:claude-sonnet-4-5,模型显示名2:claude-haiku-4-5

#账户名称
##API 条目名称（如 Claude 4.75x）
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://your-api-endpoint/v1",
    "ANTHROPIC_AUTH_TOKEN": "your-token-here"
  }
}
```

> **`@models`** *（可选）* — 定义 TUI 中可选的模型列表。
> 格式：逗号分隔的 `显示名称:模型字符串` 键値对。
> 模型可独立于账户凭据进行切换。

> ⚠️ **永远不要提交 `settings.txt` 或 `settings.json`** — 它们包含你的 API 令牌。
> 这两个文件已写入 `.gitignore`。

---

<a id="changelog"></a>

## Changelog

### v1.3.0 — 2026-03-29

- **Model List** — define a shared model list in `settings.txt`; select the active model directly from the TUI
- **AES-256-GCM encryption** — settings encrypted at rest; encrypted file is machine-bound
- **`ccshow`** — decrypt and display stored settings to stdout
- **`ccpasswd`** — manually encrypt `settings.txt` → `settings.enc` and remove plaintext
- **`setup_check.js`** — new `[4/4]` step: auto-encrypts `settings.txt` on first run

### v1.2.0 — 2026-03-28

- **setup_check.js** — First-run self-check script: detects legacy `ANTHROPIC_*` env vars and `settings.json` API credentials, migrates them into `settings.txt`, and clears conflicts automatically
- `claude_manager.js` no longer responsible for creating `settings.txt`
- `npm run setup` alias added to `package.json`

### v1.1.0 — 2026-03-28

- **F2 Rename** — Press `F2` in Change mode to rename accounts or API entries
- **CJK character width fix** — Proper visual alignment for Chinese/Japanese/Korean characters
- Dynamic help bar — Shows mode-specific keyboard shortcuts

### v1.0.0 — 2026-03-27

- Initial public release
- Interactive TUI for managing multiple Claude API configurations
- Switch mode (`ccswitch`) for instant API switching
- Change mode (`cchange`) for full CRUD on accounts and APIs
- Multi-account support with multiple API entries per account
- Keyboard navigation: `↑` / `↓` / `Enter` / `Esc` / `Ctrl+C`
- Human-readable `settings.txt` storage format
