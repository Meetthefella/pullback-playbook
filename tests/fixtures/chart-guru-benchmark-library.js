const fs = require('fs');
const path = require('path');

const BENCHMARK_ROOT = path.resolve(__dirname, 'chart-guru-cases');

function normalizeTicker(value){
  return String(value || '').trim().toUpperCase();
}

function cloneJson(value){
  return JSON.parse(JSON.stringify(value));
}

function benchmarkFolderPath(ticker){
  return path.join(BENCHMARK_ROOT, normalizeTicker(ticker));
}

function readBenchmarkJsonFile(filePath){
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizeBenchmarkCase(raw = {}, folderName = ''){
  const source = raw && typeof raw === 'object' ? raw : {};
  const benchmark = source.benchmark && typeof source.benchmark === 'object' ? source.benchmark : {};
  const interpreter = source.interpreterResponse && typeof source.interpreterResponse === 'object' ? source.interpreterResponse : {};
  const ticker = normalizeTicker(source.ticker || folderName);
  return {
    ...cloneJson(source),
    ticker,
    benchmark:{
      dominantEvent:String(
        benchmark.dominantEvent
        || interpreter.dominantEvent
        || ''
      ).trim(),
      eventSequence:Array.isArray(benchmark.eventSequence)
        ? benchmark.eventSequence.map(item => String(item || '').trim()).filter(Boolean)
        : (Array.isArray(interpreter.eventSequence)
          ? interpreter.eventSequence.map(item => String(item || '').trim()).filter(Boolean)
          : []),
      expectedTraderInterpretation:String(
        benchmark.expectedTraderInterpretation
        || interpreter.traderInterpretation
        || ''
      ).trim(),
      metadata:benchmark.metadata && typeof benchmark.metadata === 'object'
        ? cloneJson(benchmark.metadata)
        : {}
    }
  };
}

function benchmarkCaseFromFolder(folderName){
  const folderPath = path.join(BENCHMARK_ROOT, folderName);
  const benchmarkPath = path.join(folderPath, 'benchmark.json');
  const chartPath = path.join(folderPath, 'chart.png');
  const notesPath = path.join(folderPath, 'notes.md');
  return {
    ticker:normalizeTicker(folderName),
    folderName,
    folderPath,
    benchmarkPath,
    chartPath,
    notesPath,
    hasBenchmarkJson:fs.existsSync(benchmarkPath),
    hasChart:fs.existsSync(chartPath),
    hasNotes:fs.existsSync(notesPath)
  };
}

function listBenchmarkFolders(){
  if(!fs.existsSync(BENCHMARK_ROOT)) return [];
  return fs.readdirSync(BENCHMARK_ROOT, {withFileTypes:true})
    .filter(entry => entry.isDirectory())
    .map(entry => benchmarkCaseFromFolder(entry.name))
    .sort((left, right) => left.ticker.localeCompare(right.ticker));
}

function loadBenchmarkCases(){
  return listBenchmarkFolders()
    .filter(entry => entry.hasBenchmarkJson)
    .map(entry => normalizeBenchmarkCase(readBenchmarkJsonFile(entry.benchmarkPath), entry.folderName));
}

function loadBenchmarkCaseByTicker(ticker){
  const normalizedTicker = normalizeTicker(ticker);
  const folder = benchmarkCaseFromFolder(normalizedTicker);
  if(!folder.hasBenchmarkJson) return null;
  return normalizeBenchmarkCase(readBenchmarkJsonFile(folder.benchmarkPath), folder.folderName);
}

module.exports = {
  BENCHMARK_ROOT,
  normalizeTicker,
  benchmarkFolderPath,
  benchmarkCaseFromFolder,
  listBenchmarkFolders,
  loadBenchmarkCases,
  loadBenchmarkCaseByTicker
};
