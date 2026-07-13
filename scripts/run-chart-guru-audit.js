const fs = require('fs');
const path = require('path');
const {spawnSync} = require('child_process');
const {benchmarkCaseFromFolder} = require(path.join(__dirname, '..', 'tests', 'fixtures', 'chart-guru-benchmark-library.js'));

const root = path.resolve(__dirname, '..');
const artifactsDir = path.join(root, 'artifacts', 'chart-guru-live-narration');

function parseArgs(argv){
  const options = {
    tickers:[]
  };
  argv.forEach(arg => {
    if(arg.startsWith('--tickers=')){
      options.tickers = String(arg.slice('--tickers='.length) || '')
        .split(',')
        .map(value => String(value || '').trim().toUpperCase())
        .filter(Boolean);
      return;
    }
    throw new Error(`Unknown argument: ${arg}`);
  });
  return options;
}

function latestArtifactPath(){
  if(!fs.existsSync(artifactsDir)) return '';
  const candidates = fs.readdirSync(artifactsDir)
    .filter(name => /\.json$/i.test(name))
    .map(name => ({
      name,
      fullPath:path.join(artifactsDir, name),
      mtimeMs:fs.statSync(path.join(artifactsDir, name)).mtimeMs
    }))
    .sort((left, right) => right.mtimeMs - left.mtimeMs);
  return candidates[0] ? candidates[0].fullPath : '';
}

function preflightTicker(ticker){
  const folder = benchmarkCaseFromFolder(ticker);
  if(!folder.hasBenchmarkJson){
    return {
      ticker,
      runnable:false,
      blockedResult:{
        ticker,
        benchmark:{
          expectedDominantEvent:'',
          fixtureId:'',
          available:false
        },
        live:null,
        comparison:{
          dominantEventMatchesBenchmark:false,
          benchmarkSkippedReason:''
        },
        reviewRender:null,
        warnings:[],
        errors:[`Missing benchmark.json for ${ticker}. Expected ${path.relative(root, folder.benchmarkPath)}.`],
        status:'failed'
      }
    };
  }
  if(!folder.hasChart){
    return {
      ticker,
      runnable:false,
      blockedResult:{
        ticker,
        benchmark:{
          expectedDominantEvent:'',
          fixtureId:'',
          available:true
        },
        live:null,
        comparison:{
          dominantEventMatchesBenchmark:false,
          benchmarkSkippedReason:''
        },
        reviewRender:null,
        warnings:[],
        errors:[`Missing chart.png for ${ticker}. Expected ${path.relative(root, folder.chartPath)}.`],
        status:'failed'
      }
    };
  }
  return {ticker, runnable:true, blockedResult:null};
}

function writeMergedArtifact(requestedTickers, runnableTickers, blockedResults){
  const latestPath = latestArtifactPath();
  const base = latestPath && fs.existsSync(latestPath)
    ? JSON.parse(fs.readFileSync(latestPath, 'utf8'))
    : {generatedAt:new Date().toISOString(), tickers:[], results:[]};
  const liveResultsByTicker = new Map(
    (Array.isArray(base.results) ? base.results : []).map(result => [String(result && result.ticker || '').trim().toUpperCase(), result])
  );
  const mergedResults = requestedTickers.map(ticker => {
    const blocked = blockedResults.find(result => String(result && result.ticker || '').trim().toUpperCase() === ticker);
    return blocked || liveResultsByTicker.get(ticker) || {
      ticker,
      benchmark:{
        expectedDominantEvent:'',
        fixtureId:'',
        available:false
      },
      live:null,
      comparison:{
        dominantEventMatchesBenchmark:false,
        benchmarkSkippedReason:''
      },
      reviewRender:null,
      warnings:[`Ticker ${ticker} was requested but no runnable result was produced.`],
      errors:[],
      status:'unknown'
    };
  });
  const output = {
    generatedAt:new Date().toISOString(),
    tickers:requestedTickers,
    runnableTickers,
    blockedTickers:blockedResults.map(result => String(result && result.ticker || '').trim().toUpperCase()),
    results:mergedResults
  };
  const artifactPath = path.join(artifactsDir, `${output.generatedAt.replace(/[:.]/g, '-')}.json`);
  fs.mkdirSync(artifactsDir, {recursive:true});
  fs.writeFileSync(artifactPath, JSON.stringify(output, null, 2));
  return artifactPath;
}

function main(){
  const options = parseArgs(process.argv.slice(2));
  if(!options.tickers.length){
    throw new Error('Pass at least one ticker with --tickers=TICKER1,TICKER2');
  }
  const preflight = options.tickers.map(preflightTicker);
  const runnableTickers = preflight.filter(item => item.runnable).map(item => item.ticker);
  const blockedResults = preflight.filter(item => !item.runnable).map(item => item.blockedResult);
  const commandArgs = [
    path.join('node_modules', '@playwright', 'test', 'cli.js'),
    'test',
    'tests/ui/journeys/chart-guru-narration-journey.spec.js',
    '--workers',
    '1',
    '--reporter',
    'line',
    '--trace',
    'on'
  ];
  const env = {
    ...process.env,
    CI:'1',
    PLAYWRIGHT_HTML_OPEN:'never',
    PP_TICKERS:runnableTickers.join(',')
  };
  let result = {status:0, error:null};
  if(runnableTickers.length){
    result = spawnSync(process.execPath, commandArgs, {
      cwd:root,
      env,
      stdio:'inherit',
      timeout:120000
    });
  }
  const artifactPath = writeMergedArtifact(options.tickers, runnableTickers, blockedResults);
  process.stdout.write(`Latest Chart Guru audit artifact: ${artifactPath}\n`);
  if(result.error) throw result.error;
  if(result.signal === 'SIGTERM' && artifactPath){
    process.stdout.write('Playwright child timed out after producing an artifact; merged audit artifact retained.\n');
    return;
  }
  if(typeof result.status === 'number' && result.status !== 0){
    process.exit(result.status);
  }
}

main();
