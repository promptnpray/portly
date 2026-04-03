const blessed = require('blessed');
const { CATEGORY_LABELS } = require('../utils/portScanner');

// Cross-platform clipboard copy
function copyToClipboard(text) {
  const exec = require('child_process').exec;
  const isMac = process.platform === 'darwin';
  const isWindows = process.platform === 'win32';
  
  let cmd;
  if (isWindows) {
    // Windows: use clip command
    cmd = `echo ${text}| clip`;
  } else if (isMac) {
    cmd = `echo "${text}" | pbcopy`;
  } else {
    // Linux
    cmd = `echo "${text}" | xclip -selection clipboard 2>/dev/null || echo "${text}" | xsel --clipboard 2>/dev/null || echo "Clipboard not available (install xclip)"`;
  }
  exec(cmd, () => {});
}

const STATUS_ICONS = {
  LISTEN: '[L]',
  ESTABLISHED: '[E]',
  TIME_WAIT: '[W]',
  CLOSE_WAIT: '[W]',
  SYN_SENT: '[S]',
  SYN_RECV: '[S]',
  UNKNOWN: '[-]',
};

class MainScreen {
  constructor(screen, app) {
    this.screen = screen;
    this.app = app;
    this.ports = [];
    this.selectedIndex = 0;
    this.view = 'table';
    this.selectedPort = null;
    this.filterText = '';
    this.autoRefresh = false;
    this.scrollTop = 0;
    this.visibleRows = 20;
    this.confirmingKill = false;
    this.filterMode = false;
    
    this.createUI();
    this.bindKeys();
  }

  createUI() {
    // Main container
    this.mainBox = blessed.box({
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      style: { bg: 'black' },
    });
    this.screen.append(this.mainBox);

    // Header
    this.header = blessed.box({
      top: 0,
      left: 0,
      width: '100%',
      height: 3,
      style: { fg: 'cyan' },
    });
    this.mainBox.append(this.header);

    // Fixed column headers (not scrollable)
    this.columnHeader = blessed.box({
      top: 3,
      left: 0,
      width: '100%',
      height: 2,
      style: { fg: 'cyan', bold: true },
    });
    this.mainBox.append(this.columnHeader);

    // Table content (scrollable)
    this.tableContent = blessed.box({
      top: 5,
      left: 0,
      width: '100%',
      height: '100%-10',
      style: { fg: 'white' },
      scrollable: true,
      focusable: true,
      keys: true,
      vi: true,
      alwaysScroll: true,
    });
    this.mainBox.append(this.tableContent);

    // Help bar
    this.helpBar = blessed.box({
      bottom: 0,
      left: 0,
      width: '100%',
      height: 3,
      content: '[UP/DOWN] Navigate  [ENTER] Details  [/] Filter  [A] Auto  [K] Kill  [R] Refresh  [Q] Quit',
      style: { border: { fg: 'magenta' }, fg: 'white' },
    });
    this.mainBox.append(this.helpBar);

    // Status bar
    this.statusBar = blessed.box({
      bottom: 3,
      left: 0,
      width: '100%',
      height: 1,
      style: { fg: 'blue' },
    });
    this.mainBox.append(this.statusBar);

    // Initial focus
    this.tableContent.focus();
  }

  bindKeys() {
    // Navigation with scrolling - works in both table AND detail view
    this.tableContent.key('up', () => this.navigate(-1));
    this.tableContent.key('down', () => this.navigate(1));
    this.tableContent.key('page up', () => {
      if (this.confirmingKill || this.filterMode) return;
      this.selectedIndex = Math.max(0, this.selectedIndex - 10);
      this.scrollTop = Math.max(0, this.scrollTop - 10);
      if (this.view === 'detail' && this.selectedPort !== this.ports[this.selectedIndex]) {
        this.selectedPort = this.ports[this.selectedIndex];
      }
      this.render();
    });
    this.tableContent.key('page down', () => {
      if (this.confirmingKill || this.filterMode) return;
      this.selectedIndex = Math.min(this.ports.length - 1, this.selectedIndex + 10);
      this.scrollTop = Math.min(this.scrollTop, Math.max(0, this.selectedIndex - this.visibleRows + 1));
      if (this.view === 'detail' && this.selectedPort !== this.ports[this.selectedIndex]) {
        this.selectedPort = this.ports[this.selectedIndex];
      }
      this.render();
    });
    this.tableContent.key('home', () => {
      if (this.confirmingKill || this.filterMode) return;
      this.selectedIndex = 0;
      this.scrollTop = 0;
      if (this.view === 'detail') {
        this.selectedPort = this.ports[0];
      }
      this.render();
    });
    this.tableContent.key('end', () => {
      if (this.confirmingKill || this.filterMode) return;
      this.selectedIndex = Math.max(0, this.ports.length - 1);
      this.scrollTop = Math.max(0, this.ports.length - this.visibleRows);
      if (this.view === 'detail') {
        this.selectedPort = this.ports[this.selectedIndex];
      }
      this.render();
    });

    // Enter to open detail (table view only)
    this.tableContent.key('enter', () => { if (!this.filterMode) this.openDetail(); });
    this.tableContent.key('right', () => { if (!this.filterMode) this.openDetail(); });

    // Escape/Left to go back or cancel dialog
    this.tableContent.key('escape', () => this.handleEscape());
    this.tableContent.key('left', () => this.handleEscape());

    // Single character keys
    this.tableContent.key('r', () => { if (!this.confirmingKill && !this.filterMode) this.app.refreshPorts(); });
    this.tableContent.key('a', () => { if (!this.confirmingKill && !this.filterMode) this.toggleAutoRefresh(); });
    this.tableContent.key('k', () => { if (!this.confirmingKill && !this.filterMode && this.ports[this.selectedIndex]) this.showKillConfirm(); });
    this.tableContent.key('c', () => { if (!this.confirmingKill && !this.filterMode && this.view === 'detail') this.copyPort(); });
    this.tableContent.key('p', () => { if (!this.confirmingKill && !this.filterMode && this.view === 'detail') this.copyPid(); });
    this.tableContent.key('f', () => { if (!this.confirmingKill && !this.filterMode) this.startFilter(); });
    this.tableContent.key('q', () => { if (!this.confirmingKill && !this.filterMode) this.app.quit(); });
  }

  navigate(direction) {
    if (this.confirmingKill || this.filterMode) return;
    
    const newIndex = this.selectedIndex + direction;
    if (newIndex < 0 || newIndex >= this.ports.length) return;
    
    this.selectedIndex = newIndex;
    
    // Auto-scroll logic
    if (direction < 0 && this.selectedIndex < this.scrollTop) {
      this.scrollTop = this.selectedIndex;
    } else if (direction > 0) {
      const visibleBottom = this.scrollTop + this.visibleRows - 1;
      if (this.selectedIndex > visibleBottom) {
        this.scrollTop = this.selectedIndex - this.visibleRows + 1;
      }
    }
    
    // In detail view, update the selected port to match
    if (this.view === 'detail') {
      this.selectedPort = this.ports[this.selectedIndex];
    }
    
    this.render();
  }

  handleEscape() {
    if (this.confirmingKill || this.filterMode) return;
    this.closeDetail();
  }

  update(ports) {
    this.ports = this.filterText ? this.getFilteredPorts(ports) : ports;
    
    if (this.ports.length === 0) {
      this.selectedIndex = 0;
    } else if (this.selectedIndex >= this.ports.length) {
      this.selectedIndex = this.ports.length - 1;
    }
    
    // Ensure scroll position is valid
    if (this.scrollTop > Math.max(0, this.ports.length - this.visibleRows)) {
      this.scrollTop = Math.max(0, this.ports.length - this.visibleRows);
    }
    
    this.render();
  }

  getFilteredPorts(ports) {
    const filter = this.filterText.toLowerCase().trim();
    
    // Check for port range (e.g., "10-4000")
    const rangeMatch = filter.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const minPort = parseInt(rangeMatch[1], 10);
      const maxPort = parseInt(rangeMatch[2], 10);
      return ports.filter(p => p.port >= minPort && p.port <= maxPort);
    }
    
    // Regular text filter
    return ports.filter(p => 
      p.port.toString().includes(filter) ||
      (p.command && p.command.toLowerCase().includes(filter)) ||
      (p.user && p.user.toLowerCase().includes(filter))
    );
  }

  render() {
    this.renderHeader();
    
    if (this.view === 'detail') {
      this.renderDetail();
    } else {
      this.renderTable();
    }
    
    this.renderStatusBar();
    this.renderHelpBar();
    this.screen.render();
  }

  renderHeader() {
    const count = this.ports.length;
    const total = this.app.ports.length;
    const refreshStatus = this.autoRefresh ? '[AUTO-ON]' : '[AUTO-OFF]';
    const filterInfo = this.filterText ? ` | Filter: "${this.filterText}"` : '';
    const showingInfo = count !== total ? ` (showing ${count} of ${total})` : '';
    
    let viewInfo = '';
    if (this.confirmingKill) viewInfo = ' | [KILL CONFIRM]';
    else if (this.view === 'detail') viewInfo = ' | [DETAIL]';
    
    this.header.setContent(
      'PORTLY - Port Explorer\n' +
      '-------------------------------------------\n' +
      `${count} ports found${showingInfo}${filterInfo}${viewInfo} | ${refreshStatus}`
    );
  }

  renderTable() {
    // Fixed column headers
    this.columnHeader.setContent(
      'PORT    PROTO  STATE  COMMAND          PID     USER\n' +
      '--------------------------------------------------------'
    );
    
    // Calculate visible rows based on available space
    this.visibleRows = Math.max(5, (this.tableContent.height || 15));
    
    // Build content - only data rows
    const lines = [];
    
    // Render only visible portion
    const endIndex = Math.min(this.scrollTop + this.visibleRows, this.ports.length);
    
    for (let i = this.scrollTop; i < endIndex; i++) {
      const port = this.ports[i];
      const icon = STATUS_ICONS[port.state] || '[-]';
      const prefix = i === this.selectedIndex ? '> ' : '  ';
      
      const row = 
        prefix +
        String(port.port).padEnd(6) + '  ' +
        String(port.protocol).padEnd(5) + '  ' +
        icon.padEnd(7) + '  ' +
        String(port.command || '').substring(0, 15).padEnd(16) + '  ' +
        String(port.pid || '').padEnd(7) + '  ' +
        String(port.user || '').substring(0, 10);
      
      lines.push(row);
    }
    
    // Add empty lines to fill visible area if needed
    while (lines.length < this.visibleRows) {
      lines.push('');
    }
    
    // Add scroll indicator
    if (this.ports.length > this.visibleRows) {
      const start = this.scrollTop + 1;
      const end = Math.min(this.scrollTop + this.visibleRows, this.ports.length);
      lines.push('');
      lines.push(`--- [${start}-${end}] of ${this.ports.length} ports ---`);
    }
    
    this.tableContent.setContent(lines.join('\n'));
  }

  renderDetail() {
    // Hide column headers when in detail view
    this.columnHeader.setContent('');
    
    const port = this.selectedPort;
    if (!port) return;
    
    const content = [
      '========================================',
      '           PORT DETAILS',
      '========================================',
      `  Port:     ${port.port}`,
      `  Protocol: ${port.protocolFull || port.protocol}`,
      `  State:    ${port.state}`,
      `  Category: ${CATEGORY_LABELS[port.category] || ''}`,
      '----------------------------------------',
      `  Command:  ${port.command}`,
      `  PID:      ${port.pid}`,
      `  User:     ${port.user}`,
      '----------------------------------------',
      `  Local:    *:${port.port}`,
      `  Remote:   ${port.remoteAddress || '-'}`,
      '========================================',
      '',
      '[K] Kill  [C] Copy Port  [P] Copy PID  [ESC] Back',
    ].join('\n');
    
    this.tableContent.setContent(content);
  }

  renderHelpBar() {
    if (this.confirmingKill) {
      this.helpBar.setContent('[Y] KILL  [N/ESC] Cancel');
    } else if (this.view === 'detail') {
      this.helpBar.setContent('[UP/DOWN] Switch  [K] Kill  [C] Copy  [P] PID  [ESC] Back');
    } else {
      this.helpBar.setContent('[UP/DOWN] Navigate  [ENTER] Details  [F] Filter  [A] Auto-Refresh  [R] Refresh  [Q] Quit');
    }
  }

  renderStatusBar() {
    const port = this.ports[this.selectedIndex];
    if (port) {
      const pos = `[${this.selectedIndex + 1}/${this.ports.length}]`;
      if (this.confirmingKill) {
        this.statusBar.setContent(`${pos} ${port.port} -> ${port.command} | [Y] Confirm  [N/ESC] Cancel`);
      } else if (this.view === 'detail') {
        this.statusBar.setContent(`${pos} ${port.port} -> ${port.command} (PID: ${port.pid})`);
      } else {
        this.statusBar.setContent(`${pos} ${port.port} -> ${port.command} | [K] Kill`);
      }
    } else {
      this.statusBar.setContent('');
    }
  }

  openDetail() {
    if (this.ports[this.selectedIndex]) {
      this.selectedPort = this.ports[this.selectedIndex];
      this.view = 'detail';
      this.render();
    }
  }

  closeDetail() {
    if (this.view === 'detail') {
      this.view = 'table';
      this.selectedPort = null;
      this.render();
    }
  }

  toggleAutoRefresh() {
    this.autoRefresh = !this.autoRefresh;
    if (this.autoRefresh) {
      this.app.startAutoRefresh();
    } else {
      this.app.stopAutoRefresh();
    }
    this.render();
  }

  startFilter() {
    // If filter is already active, clear it
    if (this.filterText) {
      this.filterText = '';
      this.scrollTop = 0;
      this.selectedIndex = 0;
      this.update(this.app.ports);
      return;
    }
    
    this.filterMode = true;
    
    // Create a simple input prompt
    const input = blessed.textbox({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width: '40%',
      height: 3,
      border: { type: 'line' },
      style: { border: { fg: 'yellow' }, fg: 'white', bg: 'black' },
      inputOnFocus: true,
    });
    
    this.screen.append(input);
    this.screen.render();
    input.focus();
    
    // Listen for input completion
    input.key('enter', () => {
      const value = input.getValue();
      this.screen.remove(input);
      input.destroy();
      this.filterMode = false;
      
      if (value && value.trim()) {
        this.filterText = value.trim();
        this.scrollTop = 0;
        this.selectedIndex = 0;
        this.update(this.app.ports);
      } else {
        this.render();
      }
    });
    
    // Listen for escape to cancel
    input.key('escape', () => {
      this.screen.remove(input);
      input.destroy();
      this.filterMode = false;
      this.render();
    });
  }

  showKillConfirm() {
    // Get port from detail view or current selection
    const port = this.selectedPort || this.ports[this.selectedIndex];
    if (!port) return;
    
    this.confirmingKill = true;
    
    const dialog = blessed.box({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width: 49,
      height: 13,
      border: { type: 'line' },
      style: { border: { fg: 'red' }, bg: 'black', fg: 'white' },
      content: [
        '',
        '              WARNING: KILL PROCESS',
        '',
        '  Process: ' + String(port.command || '?'),
        '  PID:     ' + String(port.pid || ''),
        '  Port:    ' + String(port.port || ''),
        '',
        '  Are you sure you want to kill this process?',
        '',
        '        [Y] KILL    [N] CANCEL    [ESC]',
        '',
      ].join('\n'),
    });
    
    this.screen.append(dialog);
    this.render();
    
    const handler = (ch, key) => {
      this.screen.off('keypress', handler);
      dialog.destroy();
      this.confirmingKill = false;
      
      const char = (ch || '').toLowerCase();
      if (char === 'y') {
        this.killProcess(port.pid);
      } else {
        this.render();
      }
    };
    
    this.screen.on('keypress', handler);
  }

  killProcess(pid) {
    const exec = require('child_process').exec;
    const isWindows = process.platform === 'win32';
    
    const killCmd = isWindows 
      ? `taskkill /F /PID ${pid}` 
      : `kill ${pid}`;
    
    exec(killCmd, (err) => {
      if (err) {
        this.statusBar.setContent(`Failed to kill PID ${pid}: ${err.message}`);
      } else {
        this.statusBar.setContent(`Killed PID ${pid}`);
        setTimeout(() => {
          this.app.refreshPorts();
          this.view = 'table';
          this.selectedPort = null;
        }, 500);
      }
      this.renderStatusBar();
    });
  }

  copyPort() {
    const port = this.selectedPort.port;
    copyToClipboard(port);
    this.statusBar.setContent(`Copied port ${port} to clipboard!`);
    this.renderStatusBar();
  }

  copyPid() {
    const pid = this.selectedPort.pid;
    copyToClipboard(pid);
    this.statusBar.setContent(`Copied PID ${pid} to clipboard!`);
    this.renderStatusBar();
  }
}

module.exports = MainScreen;