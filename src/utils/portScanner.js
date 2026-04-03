const exec = require('child_process').exec;
const promisify = require('util').promisify;

const execAsync = promisify(exec);

const CATEGORY_LABELS = {
  system: 'System (0-1023)',
  registered: 'Registered (1024-49151)',
  dynamic: 'Dynamic (49152+)',
};

function getCategory(port) {
  if (port >= 0 && port <= 1023) return 'system';
  if (port >= 1024 && port <= 49151) return 'registered';
  return 'dynamic';
}

function getProtocolLabel(protocol) {
  return protocol.toUpperCase();
}

function getStateLabel(state) {
  const states = {
    LISTEN: '🟢',
    LISTENING: '🟢',
    ESTABLISHED: '🟡',
    TIME_WAIT: '⏳',
    CLOSE_WAIT: '⏳',
    SYN_SENT: '📡',
    SYN_RECV: '📡',
    LAST_ACK: '⏳',
    CLOSING: '🔄',
    CLOSED: '⚫',
  };
  return states[state] || '⚪';
}

function isWindows() {
  return process.platform === 'win32';
}

async function scanPortsMacLinux() {
  const ports = [];
  
  try {
    // Use lsof to get all listening ports with process info
    const { stdout } = await execAsync(
      'lsof -i -P -n 2>/dev/null || lsof -i -n 2>/dev/null',
      { maxBuffer: 1024 * 1024 * 10 }
    );

    const lines = stdout.split('\n').slice(1); // Skip header
    
    for (const line of lines) {
      if (!line.trim()) continue;
      
      // lsof output: COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME
      // NAME column contains things like "*:7000 (LISTEN)" or "*:5000 (LISTEN)"
      const nameMatch = line.match(/(\*|[\d.:a-f]+):(\d+)(?:\s*\((\w+)\))?/);
      if (!nameMatch) continue;

      const localAddr = nameMatch[1];
      const port = parseInt(nameMatch[2], 10);
      const state = nameMatch[3] || 'LISTEN';
      
      if (isNaN(port)) continue;

      // Extract fields from beginning of line
      const parts = line.split(/\s+/).filter(p => p.length > 0);
      if (parts.length < 4) continue;

      const command = parts[0];
      const pid = parseInt(parts[1], 10);
      const user = parts[2];
      const type = parts[4]; // IPv4, IPv6, etc.
      
      // Parse protocol from the line
      const isIPv6 = type === 'IPv6' || line.includes('IPv6');
      const protocol = isIPv6 ? 'TCP6' : 'TCP';
      
      // Parse remote address if present (format: *:7000->192.168.1.1:1234)
      const remoteMatch = line.match(/->([^\s]+)/);
      const remoteAddress = remoteMatch ? remoteMatch[1] : '';

      ports.push({
        command,
        pid,
        user,
        port,
        protocol: protocol.replace('6', ''),
        protocolFull: protocol,
        state: state || 'UNKNOWN',
        localAddress: localAddr.replace(/.*:/, '').replace(/^\*/, '0.0.0.0'),
        remoteAddress: remoteAddress,
        category: getCategory(port),
        stateIcon: getStateLabel(state),
      });
    }
  } catch (err) {
    console.error('Error running lsof:', err.message);
  }

  // Deduplicate by port+protocol
  const seen = new Map();
  for (const p of ports) {
    const key = `${p.port}-${p.protocol}`;
    if (!seen.has(key)) {
      seen.set(key, p);
    }
  }

  // Sort by port
  return Array.from(seen.values()).sort((a, b) => a.port - b.port);
}

async function scanPortsWindows() {
  const ports = [];
  
  try {
    // Get netstat output - parse in Node.js to handle locale differences
    const { stdout: netstatOut } = await execAsync(
      'netstat -ano',
      { maxBuffer: 1024 * 1024 * 10, encoding: 'utf8' }
    );
    
    // Get process list (name and PID)
    const { stdout: tasklistOut } = await execAsync(
      'tasklist /FO CSV /NH',
      { maxBuffer: 1024 * 1024 * 10, encoding: 'utf8' }
    );
    
    // Parse tasklist into a map: PID -> Command
    const pidToCmd = new Map();
    const tasklistLines = tasklistOut.split('\n');
    for (const line of tasklistLines) {
      const match = line.match(/"([^"]+)","(\d+)"/);
      if (match) {
        pidToCmd.set(match[2], match[1]);
      }
    }
    
    const lines = netstatOut.split('\n');
    
    for (const line of lines) {
      if (!line.trim()) continue;
      
      // Skip header lines and non-TCP lines
      if (!line.includes('TCP') || line.includes('Proto') || line.startsWith('Aktive') || line.startsWith('Active')) {
        continue;
      }
      
      const parts = line.trim().split(/\s+/);
      if (parts.length < 5) continue;
      
      const protocol = parts[0]; // TCP
      const localAddr = parts[1]; // 0.0.0.0:135 or [::]:5000
      const pid = parseInt(parts[4], 10);
      
      // Check if it's a listening state by foreign address (locale-independent)
      const foreignAddr = parts[2];
      const isListening = /^(0\.0\.0\.0:0|\[?::\]?:0)$/.test(foreignAddr);
      if (!isListening) continue;
      
      if (isNaN(pid)) continue;
      
      // Parse port from local address
      let port;
      let localAddress;
      
      if (localAddr.startsWith('[')) {
        // IPv6 format: [::]:5000
        const match = localAddr.match(/\[([^\]]+)\]:(\d+)/);
        if (!match) continue;
        localAddress = match[1];
        port = parseInt(match[2], 10);
      } else {
        // IPv4 format: 0.0.0.0:135
        const colonIdx = localAddr.lastIndexOf(':');
        if (colonIdx === -1) continue;
        localAddress = localAddr.substring(0, colonIdx);
        port = parseInt(localAddr.substring(colonIdx + 1), 10);
      }
      
      if (isNaN(port)) continue;
      
      const command = pidToCmd.get(String(pid)) || 'Unknown';
      
      // Determine protocol type (TCP4 or TCP6)
      const protocolFull = localAddr.startsWith('[') ? 'TCP6' : 'TCP';
      
      ports.push({
        command,
        pid,
        user: 'N/A', // Windows netstat doesn't provide user info like lsof on Unix
        port,
        protocol: protocol === 'TCP' ? 'TCP' : protocol,
        protocolFull,
        state: 'LISTEN',
        localAddress: localAddress === '0.0.0.0' || localAddress === '::' || localAddress === '[::]' ? '*' : localAddress,
        remoteAddress: '-',
        category: getCategory(port),
        stateIcon: getStateLabel('LISTEN'),
      });
    }
  } catch (err) {
    console.error('Error running netstat:', err.message);
  }

  // Deduplicate by port+protocol
  const seen = new Map();
  for (const p of ports) {
    const key = `${p.port}-${p.protocol}`;
    if (!seen.has(key)) {
      seen.set(key, p);
    }
  }

  // Sort by port
  return Array.from(seen.values()).sort((a, b) => a.port - b.port);
}

async function scanPorts() {
  if (isWindows()) {
    return scanPortsWindows();
  }
  return scanPortsMacLinux();
}

module.exports = { scanPorts, getCategory, getProtocolLabel, CATEGORY_LABELS };