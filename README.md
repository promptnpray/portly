# 🔍 portly

> A CLI tool to explore and manage open ports. Like `lsof`, but with style.

![Terminal](https://img.shields.io/badge/Terminal-macOS-green)
![Node](https://img.shields.io/badge/Node-16+-yellow)

## 🚀 Quick Start

### Install via npm
```bash
npm install -g portly-cli
```

### Run
```bash
portly
```

---

## ⌨️ Keyboard Shortcuts

### Navigation
| Key | Action |
|-----|--------|
| `↑` / `↓` | Navigate up/down through the port list |
| `Page Up` / `Page Down` | Jump 10 entries at a time |
| `Home` / `End` | Jump to first/last entry |

### Views
| Key | Action |
|-----|--------|
| `Enter` / `→` | Open detail view for selected port |
| `Escape` / `←` | Go back / close detail view |

### Actions
| Key | Action |
|-----|--------|
| `F` | Open filter / search |
| `F` (when filter active) | Clear filter |
| `A` | Toggle auto-refresh (2 second interval) |
| `R` | Manual refresh of port list |
| `K` | Kill the selected process (confirmation required) |
| `Q` | Quit portly |

---

## 🔍 Filter Syntax

The filter supports multiple search modes:

| Example | Result |
|---------|--------|
| `3000` | Show only port 3000 |
| `node` | Show all processes containing "node" |
| `Google` | Show all Google processes |
| `10-4000` | Show all ports between 10 and 4000 |

Press `Enter` to apply the filter, `Escape` to cancel, or `F` again to clear.

---

## 📋 Views

### List View (Default)
```
PORTLY - Port Explorer
-------------------------------------------
74 ports found | [AUTO-OFF]

PORT    PROTO  STATE  COMMAND          PID     USER
--------------------------------------------------------
> 9       TCP   [L]   identitys        643     promptnpray
  2738    TCP   [L]   identitys        643     promptnpray
  5000    TCP   [L]   ControlCe        602     promptnpray
  ...
--------------------------------------------------------
[UP/DOWN] Navigate  [ENTER] Details  [F] Filter  [A] Auto-Refresh  [R] Refresh  [Q] Quit

[1/74] 9 -> identitys | [K] Kill
```

### Detail View
```
PORTLY - Port Explorer
-------------------------------------------
74 ports found | [DETAIL] | [AUTO-OFF]

========================================
           PORT DETAILS
========================================
  Port:     5000
  Protocol: TCP6
  State:    LISTEN
  Category: Registered (1024-49151)
----------------------------------------
  Command:  ControlCe
  PID:      602
  User:     promptnpray
----------------------------------------
  Local:    *:5000
  Remote:   -
========================================

[K] Kill  [C] Copy Port  [P] Copy PID  [ESC] Back

[5/74] 5000 -> ControlCe (PID: 602)
```

---

## 🔴 Killing Processes

When you press `K` on a port, a confirmation dialog appears:

```
+----------------------------------+
|      WARNING: KILL PROCESS       |
+----------------------------------+
|                                  |
|  Process: ControlCe              |
|  PID:     602                   |
|  Port:    5000                   |
|                                  |
|  Are you sure you want to kill   |
|  this process?                   |
|                                  |
|        [Y] KILL    [N] CANCEL   |
|                                  |
+----------------------------------+
```

Press `Y` to kill, `N` or `Escape` to cancel.

---

## 🔄 Auto-Refresh

When auto-refresh is enabled (`[AUTO-ON]`), portly automatically scans every 2 seconds. Useful for monitoring ports that come and go.

---

## 🛠️ Requirements

- macOS or Linux
- Node.js 16 or higher
- `lsof` command (standard on macOS/Linux)

---

## 📦 Installation

```bash
# Install globally via npm
npm install -g portly-cli

# Run the app
portly
```

---

## 🎨 Port States

| State | Icon | Meaning |
|-------|------|---------|
| LISTEN | `[L]` | Port is listening for connections |
| ESTABLISHED | `[E]` | Active connection |
| TIME_WAIT | `[W]` | Connection closing |
| Other | `[-]` | Unknown state |

---

## 📝 License

MIT
