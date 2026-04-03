#!/usr/bin/env node

const blessed = require('blessed');
const MainScreen = require('./ui/mainScreen');
const { scanPorts } = require('./utils/portScanner');

class Portly {
  constructor() {
    this.screen = null;
    this.mainScreen = null;
    this.ports = [];
    this.refreshInterval = null;
  }

  init() {
    // Create the screen
    this.screen = blessed.screen({
      smartCSR: true,
      title: 'portly - port explorer',
      warnings: true,
    });

    // Create main screen (binds keys internally)
    this.mainScreen = new MainScreen(this.screen, this);
    
    // Initial scan
    this.refreshPorts();

    // Render
    this.screen.render();
  }

  async refreshPorts() {
    try {
      this.ports = await scanPorts();
      if (this.mainScreen) {
        this.mainScreen.update(this.ports);
      }
    } catch (err) {
      console.error('Error scanning ports:', err);
    }
  }

  startAutoRefresh(interval = 2000) {
    this.stopAutoRefresh();
    this.refreshInterval = setInterval(() => this.refreshPorts(), interval);
  }

  stopAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  quit() {
    this.stopAutoRefresh();
    process.exit(0);
  }
}

// Start
const app = new Portly();
app.init();