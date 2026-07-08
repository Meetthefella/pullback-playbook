const net = require('net');
const {spawn} = require('child_process');
const path = require('path');

const DEFAULT_ARGS = [
  'test',
  'tests/ui/journeys/specified-ticker-journey.spec.js',
  '--workers',
  '1',
  '--trace',
  'on'
];

function printHelp(){
  process.stdout.write(
    [
      'Usage: node scripts/run-playwright-fresh-port.js [playwright args]',
      '',
      'Runs Playwright against a fresh static-server port so reuseExistingServer',
      'cannot serve stale JS from an older process.',
      '',
      'Examples:',
      '  node scripts/run-playwright-fresh-port.js',
      '  node scripts/run-playwright-fresh-port.js test "tests/ui/journeys/specified-ticker-journey.spec.js" --grep AXSM',
      '  node scripts/run-playwright-fresh-port.js test tests/ui/contracts'
    ].join('\n')
  );
}

function resolvePlaywrightArgs(inputArgs){
  if(!Array.isArray(inputArgs) || inputArgs.length === 0) return DEFAULT_ARGS.slice();
  const firstArg = String(inputArgs[0] || '').trim().toLowerCase();
  if(['test', 'show-report', 'merge-reports', 'install', 'codegen'].includes(firstArg)){
    return inputArgs.slice();
  }
  return DEFAULT_ARGS.concat(inputArgs);
}

function reservePort(){
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = address && typeof address === 'object' ? Number(address.port) : 0;
      server.close(error => {
        if(error) reject(error);
        else resolve(port);
      });
    });
  });
}

async function main(){
  const inputArgs = process.argv.slice(2);
  if(inputArgs.includes('--help') || inputArgs.includes('-h')){
    printHelp();
    return;
  }

  const playwrightArgs = resolvePlaywrightArgs(inputArgs);
  const port = await reservePort();
  if(!Number.isFinite(port) || port <= 0){
    throw new Error('Failed to reserve a fresh Playwright port.');
  }

  const baseUrl = `http://127.0.0.1:${port}`;
  const env = {
    ...process.env,
    PP_PLAYWRIGHT_PORT:String(port),
    PP_BASE_URL:baseUrl,
    PP_REUSE_EXISTING_SERVER:'false',
    PP_ALLOW_EXISTING_SERVER:'false'
  };
  const cliPath = path.join('node_modules', '@playwright', 'test', 'cli.js');
  process.stdout.write(`[fresh-port] ${baseUrl}\n`);
  process.stdout.write(`[fresh-port] node ${cliPath} ${playwrightArgs.join(' ')}\n`);

  const child = spawn(process.execPath, [cliPath, ...playwrightArgs], {
    env,
    stdio:'inherit',
    cwd:process.cwd()
  });

  child.on('exit', (code, signal) => {
    if(signal){
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code == null ? 1 : code);
  });
}

main().catch(error => {
  process.stderr.write(`${String(error && error.stack || error || 'Unknown error')}\n`);
  process.exit(1);
});
