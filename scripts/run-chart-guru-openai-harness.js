const fs = require('fs');
const path = require('path');

const {
  VARIANTS,
  FINAL_RESPONSE_SCHEMA,
  TRADER_INTERPRETATION_SCHEMA,
  JUDGE_SCHEMA,
  buildComparisonRubric,
  buildTutorVoiceJudge,
  buildJudgeInstructions,
  buildJudgePrompt,
  buildOneStepInstructions,
  buildOneStepPrompt,
  buildStructuredFacts,
  buildTwoStepFinalInstructions,
  buildTwoStepFinalPrompt,
  buildTwoStepInterpretationInstructions,
  buildTwoStepInterpretationPrompt,
  extractOutputText,
  validateFinalResponse,
  validateTraderInterpretationResponse
} = require('./lib/chart-guru-openai-harness');

const rootDir = path.resolve(__dirname, '..');
const fixturePath = path.join(rootDir, 'tests', 'fixtures', 'chart-guru-openai-cases.json');
const artifactDir = path.join(rootDir, 'artifacts', 'chart-guru-openai');
const apiUrl = 'https://api.openai.com/v1/responses';

function timestampToken(){
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function ensureDir(dir){
  fs.mkdirSync(dir, {recursive:true});
}

function parseArgs(argv){
  const options = {
    caseFilter:'',
    dryRun:false,
    judge:false,
    strict:false
  };
  for(const arg of argv){
    if(arg === '--dry-run'){
      options.dryRun = true;
      continue;
    }
    if(arg === '--judge'){
      options.judge = true;
      continue;
    }
    if(arg === '--strict'){
      options.strict = true;
      continue;
    }
    if(arg.startsWith('--case=')){
      options.caseFilter = String(arg.slice('--case='.length) || '').trim();
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function loadFixtures(){
  return JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
}

function selectCases(fixtures, filterValue){
  if(!filterValue) return fixtures.slice();
  const target = filterValue.trim().toLowerCase();
  return fixtures.filter(item => {
    const ticker = String(item && item.ticker || '').trim().toLowerCase();
    const id = String(item && item.id || '').trim().toLowerCase();
    return ticker === target || id === target;
  });
}

function buildRequestBody(model, instructions, prompt, schema, name, maxOutputTokens = 500){
  return {
    model,
    instructions,
    input:[{
      role:'user',
      content:[{
        type:'input_text',
        text:prompt
      }]
    }],
    text:{
      format:{
        type:'json_schema',
        name,
        strict:true,
        schema
      }
    },
    temperature:0.2,
    max_output_tokens:maxOutputTokens
  };
}

async function sendRequest(apiKey, requestBody){
  const response = await fetch(apiUrl, {
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      Authorization:`Bearer ${apiKey}`
    },
    body:JSON.stringify(requestBody)
  });
  const payload = await response.json().catch(() => ({}));
  return {response, payload};
}

function parseStrictJsonOutput(payload){
  const outputText = extractOutputText(payload);
  if(!outputText) throw new Error('No output_text returned from Responses API.');
  try{
    return {
      outputText,
      parsed:JSON.parse(outputText)
    };
  }catch(error){
    throw new Error(`Structured output was not valid JSON: ${error.message}`);
  }
}

function escapeMdCell(value){
  return String(value || '').replace(/\|/g, '\\|').replace(/\n/g, '<br>');
}

function variantByName(caseResult, name){
  return caseResult.variants.find(item => item.variant === name) || null;
}

function determineWinner(caseResult){
  const judgeWinner = caseResult.judgeResult && !caseResult.judgeResult.error && caseResult.judgeResult.winner && caseResult.judgeResult.winner !== 'tie'
    ? caseResult.judgeResult.winner
    : '';
  const rubricWinner = caseResult.comparisonRubric && caseResult.comparisonRubric.comparison
    ? String(caseResult.comparisonRubric.comparison.preferredVariant || '')
    : '';
  const winner = judgeWinner || rubricWinner || 'unavailable';
  return {
    winner,
    source:judgeWinner ? 'judge' : 'rubric'
  };
}

function formatMarkdown(run){
  const lines = [];
  lines.push('# Chart Guru OpenAI Harness');
  lines.push('');
  lines.push(`- Generated: ${run.generatedAt}`);
  lines.push(`- Model: ${run.model}`);
  lines.push(`- Dry run: ${run.dryRun ? 'yes' : 'no'}`);
  lines.push(`- Judge: ${run.judge ? 'yes' : 'no'}`);
  lines.push(`- Strict: ${run.strict ? 'yes' : 'no'}`);
  lines.push(`- Cases: ${run.results.length}`);
  lines.push('');

  for(const result of run.results){
    const oneStep = variantByName(result, 'one_step');
    const twoStep = variantByName(result, 'two_step');
    const winner = determineWinner(result);

    lines.push(`## ${result.ticker} - ${result.id}`);
    lines.push('');
    lines.push(`Primary recent event: \`${result.primaryRecentEvent}\``);
    lines.push(`Declared winner: \`${winner.winner}\` via \`${winner.source}\``);
    lines.push('');
    lines.push('### Comparison Rubric');
    lines.push('');
    lines.push(`- Outcome: ${result.comparisonRubric.comparison.outcome}`);
    lines.push(`- Preferred variant: ${result.comparisonRubric.comparison.preferredVariant}`);
    lines.push(`- Summary: ${result.comparisonRubric.comparison.summary}`);
    for(const variantName of VARIANTS){
      const rubric = result.comparisonRubric.scoresByVariant[variantName];
      if(!rubric) continue;
      lines.push(`- ${variantName} total: ${rubric.totalScore}/${rubric.maxScore}`);
      if(rubric.available && rubric.dimensions){
        lines.push(`- ${variantName} event fidelity: ${rubric.dimensions.eventFidelity.score}/${rubric.dimensions.eventFidelity.maxScore}`);
        lines.push(`- ${variantName} beginner clarity: ${rubric.dimensions.beginnerClarity.score}/${rubric.dimensions.beginnerClarity.maxScore}`);
        lines.push(`- ${variantName} setup specificity: ${rubric.dimensions.setupSpecificity.score}/${rubric.dimensions.setupSpecificity.maxScore}`);
        lines.push(`- ${variantName} what next usefulness: ${rubric.dimensions.whatNextUsefulness.score}/${rubric.dimensions.whatNextUsefulness.maxScore}`);
        lines.push(`- ${variantName} dominant lead: ${rubric.dimensions.dominantLead.score}/${rubric.dimensions.dominantLead.maxScore}`);
        lines.push(`- ${variantName} validation bonus: ${rubric.dimensions.validationBonus.score}/${rubric.dimensions.validationBonus.maxScore}`);
      }
    }
    lines.push('');

    if(result.tutorVoiceJudge){
      lines.push('### Tutor Voice Judge');
      lines.push('');
      lines.push(`- Score: ${result.tutorVoiceJudge.totalScore}/${result.tutorVoiceJudge.maxScore}`);
      lines.push(`- Summary: ${result.tutorVoiceJudge.summary}`);
      for(const failure of result.tutorVoiceJudge.failures || []){
        lines.push(`- Failure: ${failure}`);
      }
      lines.push('');
    }

    if(result.judgeResult){
      lines.push('### Judge');
      lines.push('');
      lines.push(`- Winner: ${result.judgeResult.winner}`);
      lines.push(`- Reason: ${result.judgeResult.reason}`);
      if(result.judgeResult.error){
        lines.push(`- Error: ${result.judgeResult.error}`);
      }
      lines.push('');
    }

    lines.push('### Side By Side');
    lines.push('');
    lines.push('| Section | one_step | two_step |');
    lines.push('| --- | --- | --- |');
    lines.push(`| Validation | ${escapeMdCell(oneStep ? (oneStep.validation.ok ? 'pass' : 'fail') : 'n/a')} | ${escapeMdCell(twoStep ? (twoStep.validation.ok ? 'pass' : 'fail') : 'n/a')} |`);
    lines.push(`| Validation Errors | ${escapeMdCell(oneStep && oneStep.validation.errors.length ? oneStep.validation.errors.join(' | ') : '')} | ${escapeMdCell(twoStep && twoStep.validation.errors.length ? twoStep.validation.errors.join(' | ') : '')} |`);
    lines.push(`| Validation Warnings | ${escapeMdCell(oneStep && oneStep.validation.warnings && oneStep.validation.warnings.length ? oneStep.validation.warnings.join(' | ') : '')} | ${escapeMdCell(twoStep && twoStep.validation.warnings && twoStep.validation.warnings.length ? twoStep.validation.warnings.join(' | ') : '')} |`);
    lines.push(`| Chart Story | ${escapeMdCell(oneStep && oneStep.response ? oneStep.response.chartStory : '')} | ${escapeMdCell(twoStep && twoStep.response ? twoStep.response.chartStory : '')} |`);
    lines.push(`| Why It Matters | ${escapeMdCell(oneStep && oneStep.response ? oneStep.response.whyItMatters : '')} | ${escapeMdCell(twoStep && twoStep.response ? twoStep.response.whyItMatters : '')} |`);
    lines.push(`| Setup Location | ${escapeMdCell(oneStep && oneStep.response ? oneStep.response.setupLocation : '')} | ${escapeMdCell(twoStep && twoStep.response ? twoStep.response.setupLocation : '')} |`);
    lines.push(`| Learning Point | ${escapeMdCell(oneStep && oneStep.response ? oneStep.response.learningPoint : '')} | ${escapeMdCell(twoStep && twoStep.response ? twoStep.response.learningPoint : '')} |`);
    lines.push(`| What Next | ${escapeMdCell(oneStep && oneStep.response ? oneStep.response.whatNext : '')} | ${escapeMdCell(twoStep && twoStep.response ? twoStep.response.whatNext : '')} |`);
    lines.push('');

    if(twoStep && twoStep.traderInterpretation){
      lines.push('### two_step traderInterpretation');
      lines.push('');
      lines.push(`- dominantEvent: ${twoStep.traderInterpretation.dominantEvent}`);
      lines.push(`- whatChanged: ${twoStep.traderInterpretation.whatChanged}`);
      lines.push(`- traderRead: ${twoStep.traderInterpretation.traderRead}`);
      lines.push(`- riskToWatch: ${twoStep.traderInterpretation.riskToWatch}`);
      lines.push(`- nextUsefulSignal: ${twoStep.traderInterpretation.nextUsefulSignal}`);
      lines.push('');
    }
  }

  return lines.join('\n').trim() + '\n';
}

async function callStructuredOutput(apiKey, model, instructions, prompt, schema, schemaName, maxOutputTokens){
  const requestBody = buildRequestBody(model, instructions, prompt, schema, schemaName, maxOutputTokens);
  const {response, payload} = await sendRequest(apiKey, requestBody);
  if(!response.ok){
    const message = String(payload?.error?.message || payload?.error || `Responses API error ${response.status}`).trim();
    return {
      ok:false,
      requestBody,
      upstreamStatus:response.status,
      upstreamPayload:payload,
      error:message,
      parsed:null,
      rawOutputText:''
    };
  }
  try{
    const parsedOutput = parseStrictJsonOutput(payload);
    return {
      ok:true,
      requestBody,
      upstreamStatus:response.status,
      upstreamPayload:payload,
      error:'',
      parsed:parsedOutput.parsed,
      rawOutputText:parsedOutput.outputText
    };
  }catch(error){
    return {
      ok:false,
      requestBody,
      upstreamStatus:response.status,
      upstreamPayload:payload,
      error:error.message,
      parsed:null,
      rawOutputText:''
    };
  }
}

async function runOneStep(testCase, options){
  const prompt = buildOneStepPrompt(testCase);
  const baseResult = {
    variant:'one_step',
    promptMode:'one_step',
    prompt,
    requestBody:buildRequestBody(options.model, buildOneStepInstructions(), prompt, FINAL_RESPONSE_SCHEMA, 'chart_guru_one_step_response', 500),
    validation:{ok:false, errors:[]},
    warnings:[],
    response:null,
    rawOutputText:'',
    error:''
  };

  if(options.dryRun){
    return {
      ...baseResult,
      validation:{ok:true, errors:[], warnings:[]}
    };
  }

  const result = await callStructuredOutput(
    options.apiKey,
    options.model,
    buildOneStepInstructions(),
    prompt,
    FINAL_RESPONSE_SCHEMA,
    'chart_guru_one_step_response',
    500
  );

  if(!result.ok){
    return {
      ...baseResult,
      requestBody:result.requestBody,
      upstreamStatus:result.upstreamStatus,
      upstreamPayload:result.upstreamPayload,
      error:result.error
    };
  }

  return {
    ...baseResult,
    requestBody:result.requestBody,
    upstreamStatus:result.upstreamStatus,
    upstreamPayload:result.upstreamPayload,
    response:result.parsed,
    rawOutputText:result.rawOutputText,
    validation:validateFinalResponse({...testCase, __strict:options.strict === true}, result.parsed)
  };
}

async function runTwoStep(testCase, options){
  const interpretationPrompt = buildTwoStepInterpretationPrompt(testCase);
  const finalPromptPlaceholder = buildTwoStepFinalPrompt(testCase, {
    dominantEvent:'',
    whatChanged:'',
    traderRead:'',
    riskToWatch:'',
    nextUsefulSignal:''
  });
  const baseResult = {
    variant:'two_step',
    promptMode:'two_step',
    interpretationPrompt,
    prompt:finalPromptPlaceholder,
    interpretationRequestBody:buildRequestBody(options.model, buildTwoStepInterpretationInstructions(), interpretationPrompt, TRADER_INTERPRETATION_SCHEMA, 'chart_guru_trader_interpretation', 250),
    requestBody:buildRequestBody(options.model, buildTwoStepFinalInstructions(), finalPromptPlaceholder, FINAL_RESPONSE_SCHEMA, 'chart_guru_two_step_response', 500),
    traderInterpretation:null,
    traderInterpretationValidation:{ok:false, errors:[]},
    validation:{ok:false, errors:[]},
    response:null,
    rawOutputText:'',
    error:''
  };

  if(options.dryRun){
    return {
      ...baseResult,
      traderInterpretationValidation:{ok:true, errors:[], warnings:[]},
      validation:{ok:true, errors:[], warnings:[]}
    };
  }

  const interpretationResult = await callStructuredOutput(
    options.apiKey,
    options.model,
    buildTwoStepInterpretationInstructions(),
    interpretationPrompt,
    TRADER_INTERPRETATION_SCHEMA,
    'chart_guru_trader_interpretation',
    250
  );

  if(!interpretationResult.ok){
    return {
      ...baseResult,
      interpretationRequestBody:interpretationResult.requestBody,
      interpretationUpstreamStatus:interpretationResult.upstreamStatus,
      interpretationUpstreamPayload:interpretationResult.upstreamPayload,
      error:`Interpretation step failed: ${interpretationResult.error}`
    };
  }

  const traderInterpretation = interpretationResult.parsed;
  const traderInterpretationValidation = validateTraderInterpretationResponse(traderInterpretation);
  const finalPrompt = buildTwoStepFinalPrompt(testCase, traderInterpretation);
  const finalResult = await callStructuredOutput(
    options.apiKey,
    options.model,
    buildTwoStepFinalInstructions(),
    finalPrompt,
    FINAL_RESPONSE_SCHEMA,
    'chart_guru_two_step_response',
    500
  );

  if(!finalResult.ok){
    return {
      ...baseResult,
      interpretationRequestBody:interpretationResult.requestBody,
      interpretationUpstreamStatus:interpretationResult.upstreamStatus,
      interpretationUpstreamPayload:interpretationResult.upstreamPayload,
      traderInterpretation,
      traderInterpretationValidation,
      prompt:finalPrompt,
      requestBody:finalResult.requestBody,
      upstreamStatus:finalResult.upstreamStatus,
      upstreamPayload:finalResult.upstreamPayload,
      error:`Final prose step failed: ${finalResult.error}`
    };
  }

  return {
    ...baseResult,
    interpretationRequestBody:interpretationResult.requestBody,
    interpretationUpstreamStatus:interpretationResult.upstreamStatus,
    interpretationUpstreamPayload:interpretationResult.upstreamPayload,
    traderInterpretation,
    traderInterpretationValidation,
    prompt:finalPrompt,
    requestBody:finalResult.requestBody,
    upstreamStatus:finalResult.upstreamStatus,
    upstreamPayload:finalResult.upstreamPayload,
    response:finalResult.parsed,
    rawOutputText:finalResult.rawOutputText,
    validation:validateFinalResponse({...testCase, __strict:options.strict === true}, finalResult.parsed)
  };
}

async function runJudge(testCase, caseResult, options){
  const prompt = buildJudgePrompt(testCase, caseResult);
  const base = {
    winner:'unavailable',
    reason:'',
    prompt,
    requestBody:buildRequestBody(options.model, buildJudgeInstructions(), prompt, JUDGE_SCHEMA, 'chart_guru_case_judge', 180),
    error:''
  };

  if(options.dryRun || !options.judge){
    return null;
  }

  const result = await callStructuredOutput(
    options.apiKey,
    options.model,
    buildJudgeInstructions(),
    prompt,
    JUDGE_SCHEMA,
    'chart_guru_case_judge',
    180
  );

  if(!result.ok){
    return {
      ...base,
      upstreamStatus:result.upstreamStatus,
      upstreamPayload:result.upstreamPayload,
      error:result.error
    };
  }

  return {
    ...base,
    winner:String(result.parsed.winner || 'tie'),
    reason:String(result.parsed.reason || ''),
    requestBody:result.requestBody,
    upstreamStatus:result.upstreamStatus,
    upstreamPayload:result.upstreamPayload
  };
}

function hasStrictFailure(caseResult){
  const oneStep = variantByName(caseResult, 'one_step');
  const twoStep = variantByName(caseResult, 'two_step');
  const winner = determineWinner(caseResult);
  const variantFailures = [oneStep, twoStep].some(item => !item || item.error || !item.validation.ok);
  const interpretationFailure = !!(twoStep && twoStep.traderInterpretationValidation && !twoStep.traderInterpretationValidation.ok);
  const noWinner = !winner.winner || winner.winner === 'tie' || winner.winner === 'unavailable';
  return variantFailures || interpretationFailure || noWinner;
}

async function main(){
  const args = parseArgs(process.argv.slice(2));
  const fixtures = loadFixtures();
  const selectedCases = selectCases(fixtures, args.caseFilter);
  if(!selectedCases.length){
    throw new Error(args.caseFilter
      ? `No fixture matched --case=${args.caseFilter}.`
      : 'No chart guru harness fixtures found.');
  }

  const apiKey = process.env.OPENAI_API_KEY || '';
  if(!args.dryRun && !apiKey.trim()){
    throw new Error('OPENAI_API_KEY is required unless --dry-run is used.');
  }

  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const generatedAt = new Date().toISOString();
  const run = {
    generatedAt,
    dryRun:args.dryRun,
    judge:args.judge,
    strict:args.strict,
    model,
    fixturePath,
    results:[]
  };

  for(const testCase of selectedCases){
    const caseResult = {
      id:String(testCase.id || ''),
      ticker:String(testCase.ticker || ''),
      primaryRecentEvent:String(testCase.primaryRecentEvent || ''),
      verdict:String(testCase.verdict || ''),
      setupScore:Number(testCase.setupScore),
      structuredFacts:buildStructuredFacts(testCase),
      variants:[],
      comparisonRubric:null,
      tutorVoiceJudge:null,
      judgeResult:null
    };

    caseResult.variants.push(await runOneStep(testCase, {
      dryRun:args.dryRun,
      apiKey,
      model
    }));
    caseResult.variants.push(await runTwoStep(testCase, {
      dryRun:args.dryRun,
      apiKey,
      model
    }));
    caseResult.comparisonRubric = buildComparisonRubric(testCase, caseResult.variants);
    caseResult.tutorVoiceJudge = buildTutorVoiceJudge(testCase, variantByName(caseResult, 'two_step'));
    caseResult.judgeResult = await runJudge(testCase, caseResult, {
      dryRun:args.dryRun,
      judge:args.judge,
      apiKey,
      model
    });

    run.results.push(caseResult);
  }

  ensureDir(artifactDir);
  const stamp = timestampToken();
  const jsonPath = path.join(artifactDir, `${stamp}.json`);
  const markdownPath = path.join(artifactDir, `${stamp}.md`);
  fs.writeFileSync(jsonPath, JSON.stringify(run, null, 2));
  fs.writeFileSync(markdownPath, formatMarkdown(run));

  const failedVariants = run.results.flatMap(result => result.variants.filter(variant => variant.error || !variant.validation.ok));
  const strictFailures = args.strict ? run.results.filter(hasStrictFailure) : [];
  process.stdout.write(`Wrote ${jsonPath}\n`);
  process.stdout.write(`Wrote ${markdownPath}\n`);
  process.stdout.write(`Processed ${run.results.length} case(s) across ${run.results.length * VARIANTS.length} variant run(s).\n`);
  if(failedVariants.length || strictFailures.length){
    process.exitCode = 1;
  }
}

main().catch(error => {
  process.stderr.write(`${String(error && error.stack || error || 'Unknown error')}\n`);
  process.exit(1);
});
