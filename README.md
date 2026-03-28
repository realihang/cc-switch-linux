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
- Keyboard-driven TUI: `↑ ↓ Enter Esc Ctrl+C`
- Multi-account support, each with multiple API entries
- Human-readable `settings.txt` storage; `settings.json` is never touched by hand

### Requirements

- Node.js ≥ 14
- Linux (uses terminal raw mode)
- [Claude Code CLI](https://claude.ai/code) (`settings.json` must exist in the same directory as the script)

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/realihang/cc-switch-linux.git
   ```

2. **Copy the script to your Claude config directory**

   ```bash
   cp cc-switch-linux/claude_manager.js ~/.claude/
   ```

3. **Create your `settings.txt`** in `~/.claude/`
   See [`settings.txt.example`](settings.txt.example) for the format.

4. **Add aliases to `~/.bashrc`**

   ```bash
   alias ccswitch="node ~/.claude/claude_manager.js switch"
   alias cchange="node ~/.claude/claude_manager.js change"
   ```

5. **Reload your shell**

   ```bash
   source ~/.bashrc
   ```

### Usage

```bash
ccswitch   # Open Switch UI — pick the active API
cchange    # Open Change UI — manage accounts & APIs
```

| Key | Action |
|-----|--------|
| `↑` / `↓` | Navigate |
| `Enter` | Select / Confirm |
| `Esc` | Go back / Cancel |
| `Ctrl+C` | Exit |

### `settings.txt` Format

```
#AccountName
##Model Name & Rate (e.g. Claude 4.75x)
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://your-api-endpoint/v1",
    "ANTHROPIC_AUTH_TOKEN": "your-token-here"
  },
  "model": "sonnet[1m]"
}
```

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
- 键盘驱动 TUI：`↑ ↓ Enter Esc Ctrl+C`
- 支持多账户，每个账户可配置多条 API
- `settings.txt` 以人类可读格式存储；`settings.json` 无需手动修改

### 环境要求

- Node.js ≥ 14
- Linux（使用终端 raw 模式）
- [Claude Code CLI](https://claude.ai/code)（`settings.json` 需与脚本在同一目录）

### 安装步骤

1. **克隆仓库**

   ```bash
   git clone https://github.com/realihang/cc-switch-linux.git
   ```

2. **将脚本复制到 Claude 配置目录**

   ```bash
   cp cc-switch-linux/claude_manager.js ~/.claude/
   ```

3. **在 `~/.claude/` 创建 `settings.txt`**
   格式参见 [`settings.txt.example`](settings.txt.example)。

4. **在 `~/.bashrc` 添加别名**

   ```bash
   alias ccswitch="node ~/.claude/claude_manager.js switch"
   alias cchange="node ~/.claude/claude_manager.js change"
   ```

5. **重新加载 Shell**

   ```bash
   source ~/.bashrc
   ```

### 使用方法

```bash
ccswitch   # 打开切换 UI，选择当前激活的 API
cchange    # 打开管理 UI，管理账户和 API
```

| 按键 | 操作 |
|------|------|
| `↑` / `↓` | 上下导航 |
| `Enter` | 确认选择 |
| `Esc` | 返回 / 取消 |
| `Ctrl+C` | 退出 |

### `settings.txt` 格式

```
#账户名称
##模型名称与倍率（如 Claude 4.75x）
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://your-api-endpoint/v1",
    "ANTHROPIC_AUTH_TOKEN": "your-token-here"
  },
  "model": "sonnet[1m]"
}
```

> ⚠️ **永远不要提交 `settings.txt` 或 `settings.json`** — 它们包含你的 API 令牌。
> 这两个文件已写入 `.gitignore`。

---

<a id="changelog"></a>

## Changelog

### v1.0.0 — 2026-03-27

- Initial public release
- Interactive TUI for managing multiple Claude API configurations
- Switch mode (`ccswitch`) for instant API switching
- Change mode (`cchange`) for full CRUD on accounts and APIs
- Multi-account support with multiple API entries per account
- Keyboard navigation: `↑` / `↓` / `Enter` / `Esc` / `Ctrl+C`
- Human-readable `settings.txt` storage format
