const net = require('net');
const http = require('http');
const {spawnSync} = require('child_process');
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

function wait(ms){
  return new Promise(resolve => setTimeout(resolve, ms));
}

function probeServer(baseUrl){
  return new Promise(resolve => {
    const request = http.get(`${baseUrl}/index.html`, response => {
      response.resume();
      resolve(response.statusCode >= 200 && response.statusCode < 500);
    });
    request.on('error', () => resolve(false));
    request.setTimeout(1000, () => {
      request.destroy();
      resolve(false);
    });
  });
}

async function startServer(baseUrl, env){
  const child = require('child_process').spawn(process.execPath, ['scripts/playwright-static-server.js'], {
    cwd:process.cwd(),
    env,
    stdio:['ignore', 'pipe', 'pipe']
  });
  let ready = false;
  child.stdout.on('data', chunk => {
    const text = String(chunk || '');
    if(/Playwright static server listening|already listening/i.test(text)) ready = true;
    process.stdout.write(text);
  });
  child.stderr.on('data', chunk => {
    process.stderr.write(String(chunk || ''));
  });
  for(let attempt = 0; attempt < 50; attempt += 1){
    if(ready || await probeServer(baseUrl)) return child;
    if(child.exitCode != null) break;
    await wait(200);
  }
  throw new Error('Failed to start Playwright static server on a fresh port.');
}

function stopServer(server){
  if(!server || server.exitCode != null) return;
  try{
    server.kill();
  }catch(error){}
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
    PP_DISABLE_WEBSERVER:'true',
    PP_REUSE_EXISTING_SERVER:'false',
    PP_ALLOW_EXISTING_SERVER:'false'
  };
  const cliPath = path.join('node_modules', '@playwright', 'test', 'cli.js');
  process.stdout.write(`[fresh-port] ${baseUrl}\n`);
  process.stdout.write(`[fresh-port] node ${cliPath} ${playwrightArgs.join(' ')}\n`);
  const server = await startServer(baseUrl, env);
  try{
    const result = spawnSync(process.execPath, [cliPath, ...playwrightArgs], {
      env,
      stdio:'inherit',
      cwd:process.cwd()
    });
    if(result.error) throw result.error;
    if(result.signal){
      process.kill(process.pid, result.signal);
      return;
    }
    process.exit(result.status == null ? 1 : result.status);
  } finally {
    stopServer(server);
  }
}

main().catch(error => {
  process.stderr.write(`${String(error && error.stack || error || 'Unknown error')}\n`);
  process.exit(1);
});
