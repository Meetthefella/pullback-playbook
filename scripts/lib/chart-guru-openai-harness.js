const FINAL_REQUIRED_FIELDS = [
  'chartStory',
  'whyItMatters',
  'setupLocation',
  'learningPoint',
  'whatNext'
];

const INTERPRETATION_REQUIRED_FIELDS = [
  'dominantEvent',
  'whatChanged',
  'traderRead',
  'riskToWatch',
  'nextUsefulSignal'
];

const VARIANTS = [
  'one_step',
  'two_step'
];

const FINAL_RESPONSE_SCHEMA = {
  type:'object',
  additionalProperties:false,
  required:FINAL_REQUIRED_FIELDS,
  properties:{
    chartStory:{type:'string'},
    whyItMatters:{type:'string'},
    setupLocation:{type:'string'},
    learningPoint:{type:'string'},
    whatNext:{type:'string'}
  }
};

const TRADER_INTERPRETATION_SCHEMA = {
  type:'object',
  additionalProperties:false,
  required:INTERPRETATION_REQUIRED_FIELDS,
  properties:{
    dominantEvent:{type:'string'},
    whatChanged:{type:'string'},
    traderRead:{type:'string'},
    riskToWatch:{type:'string'},
    nextUsefulSignal:{type:'string'}
  }
};

const JUDGE_SCHEMA = {
  type:'object',
  additionalProperties:false,
  required:['winner', 'reason'],
  properties:{
    winner:{
      type:'string',
      enum:['one_step', 'two_step', 'tie']
    },
    reason:{type:'string'}
  }
};

const EVENT_RULES = {
  failed_first_bounce_from_20ma:{
    requiredPatterns:[
      /\b(failed|failure|could not hold|gave back|rejected)\b/i,
      /\b20(?:-day)?\b|\b20ma\b/i
    ],
    forbiddenPatterns:[
      /\bconfirmed bounce\b/i,
      /\bbuyers (are|were) clearly in control\b/i,
      /\bentry (is )?ready\b/i,
      /\bsupport (clearly )?held\b/i
    ],
    dominantLeadPatterns:[
      /\bfailed\b/i,
      /\bbounce\b/i
    ]
  },
  first_test_of_50ma_buyers_not_confirmed:{
    requiredPatterns:[
      /\b50(?:-day)?\b|\b50ma\b/i,
      /\b(not confirmed|still needs proof|still needs confirmation|buyers have not confirmed|buyers have not yet shown|waiting for buyers|no clear response from buyers|no clear buyer response|no decisive bounce|no clear bounce|no confirmed bounce|without buyer confirmation|without a clear response)\b/i
    ],
    forbiddenPatterns:[
      /\bconfirmed bounce\b/i,
      /\bbuyers defended\b/i,
      /\bsupport (clearly )?held\b/i,
      /\bentry (is )?ready\b/i
    ],
    dominantLeadPatterns:[
      /\b50(?:-day)?\b|\b50ma\b/i,
      /\b(first test|test)\b/i
    ]
  },
  constructive_pullback_no_confirmation:{
    requiredPatterns:[
      /\bconstructive\b/i,
      /\b(no confirmation|needs confirmation|waiting for confirmation|follow-through is still missing|still early|buyers have not followed through|without follow-through|not confirmed yet)\b/i
    ],
    forbiddenPatterns:[
      /\bconfirmed bounce\b/i,
      /\bentry (is )?ready\b/i,
      /\bbuy now\b/i
    ],
    dominantLeadPatterns:[
      /\bpullback\b/i,
      /\bconstructive\b/i
    ]
  },
  diminishing_quality:{
    requiredPatterns:[
      /\b(diminishing|less convincing|weakening|quality is slipping|quality is fading)\b/i
    ],
    forbiddenPatterns:[
      /\bquality is improving\b/i,
      /\bbuyers are clearly in control\b/i,
      /\bentry (is )?ready\b/i
    ],
    dominantLeadPatterns:[
      /\b(diminishing|less convincing|weakening|slipping|fading)\b/i
    ]
  },
  constructive_but_early_monitor_watch:{
    requiredPatterns:[
      /\bconstructive\b/i,
      /\b(early|monitor|watch|too early)\b/i
    ],
    forbiddenPatterns:[
      /\bconfirmed bounce\b/i,
      /\bentry (is )?ready\b/i,
      /\bready to enter\b/i
    ],
    dominantLeadPatterns:[
      /\b(early|monitor|constructive)\b/i
    ]
  }
};

const NEW_INDICATOR_PATTERNS = [
  /\brsi\b/i,
  /\bmacd\b/i,
  /\bstochastic\b/i,
  /\bfibonacci\b/i,
  /\banchored vwap\b/i,
  /\bvwap\b/i,
  /\batr\b/i,
  /\bbollinger\b/i
];

const HELPFUL_NEXT_PATTERNS = [
  /\bwatch\b/i,
  /\bwait\b/i,
  /\bfollow-?through\b/i,
  /\bbounce\b/i,
  /\bhold\b/i,
  /\breclaim\b/i,
  /\bbuyers\b/i,
  /\bsupport\b/i,
  /\bstrength\b/i
];

const LOCATION_SPECIFICITY_PATTERNS = [
  /\b20(?:-day)?\b|\b20ma\b/i,
  /\b50(?:-day)?\b|\b50ma\b/i,
  /\bbetween\b/i,
  /\baround\b/i,
  /\bnear\b/i,
  /\bsupport\b/i,
  /\bpullback\b/i
];

const BANNED_ABSTRACTION_PATTERNS = [
  /\bthis situation indicates\b/i,
  /\bpotential opportunity\b/i,
  /\bfavourable position\b/i,
  /\bbuyer commitment\b/i,
  /\bwaiting phase\b/i,
  /\bconstructive backdrop\b/i,
  /\bmarket participants\b/i,
  /\bquality environment\b/i,
  /\bdemonstrates\b/i,
  /\bfacilitates\b/i,
  /\bin order to\b/i
];

function eventLeadPatternsForCase(testCase){
  switch(String(testCase?.primaryRecentEvent || '').trim()){
    case 'failed_first_bounce_from_20ma':
      return [/\bfailed\b/i, /\bbounce\b/i, /\bfaded quickly\b/i, /\bcould not hold\b/i];
    case 'first_test_of_50ma_buyers_not_confirmed':
      return [/\b50(?:-day)?\b/i, /\btest\b/i, /\bsupport\b/i];
    case 'constructive_pullback_no_confirmation':
      return [/\bpullback\b/i, /\bpulled back\b/i, /\bpulling back\b/i, /\b20(?:-day)?\b/i, /\bcontrolled\b/i, /\borderly\b/i];
    case 'diminishing_quality':
      return [/\blosing quality\b/i, /\bmessier\b/i, /\bless clean\b/i, /\bfading\b/i, /\bweakening\b/i, /\btired\b/i];
    case 'constructive_but_early_monitor_watch':
      return [/\bearly\b/i, /\bpullback\b/i, /\bpulling back\b/i, /\bsupport\b/i, /\bmoving toward\b/i];
    case 'support_breakdown_stabilisation_attempt':
      return [/\bsupport\b/i, /\bfailed\b/i, /\blost\b/i, /\bbreakdown\b/i];
    default:
      return [];
  }
}

function learningPointPatternsForCase(testCase){
  switch(String(testCase?.primaryRecentEvent || '').trim()){
    case 'failed_first_bounce_from_20ma':
      return [/\bsupport touch\b/i, /\bresponse that follows\b/i, /\bfirst bounce\b/i, /\bfailed bounce\b/i, /\bbuyers have not defended\b/i, /\brebound\b/i, /\bstay patient\b/i];
    case 'first_test_of_50ma_buyers_not_confirmed':
      return [/\breaching support\b/i, /\bfirst step\b/i, /\bsupport area\b/i, /\bstarting point\b/i, /\b50(?:-day)?\b/i, /\bbuyer response\b/i, /\bholding\b/i, /\bdefend\b/i];
    case 'constructive_pullback_no_confirmation':
      return [/\bcontrolled pullback\b/i, /\bhealthy pullback\b/i, /\bgood location\b/i, /\bbuyers need to follow through\b/i, /\bbounce\b/i, /\bsupport\b/i, /\btoo early\b/i, /\bstronger setup\b/i];
    case 'constructive_but_early_monitor_watch':
      return [/\bright area\b/i, /\btoo early\b/i, /\blocation\b/i, /\bbuyer response\b/i, /\bnot be ready\b/i, /\bsupport\b/i];
    case 'diminishing_quality':
      return [/\bmessier pullbacks\b/i, /\bharder to trade\b/i, /\bharder to time\b/i, /\bquality\b/i, /\btiming\b/i, /\bclean pullbacks\b/i, /\bless reliable timing\b/i];
    case 'support_breakdown_stabilisation_attempt':
      return [/\bbounce before it is fixed\b/i, /\bbuild a base\b/i, /\breclaim lost support\b/i, /\bdamaged chart\b/i];
    default:
      return [];
  }
}

function hasRepeatedSemanticState(sentences){
  const semanticBuckets = [
    {key:'response_absent', patterns:[/\bnot shown enough\b/i, /\bneeds proof\b/i, /\bneeds confirmation\b/i, /\bnot confirmed\b/i]},
    {key:'response_present', patterns:[/\bbuyers (?:stepped in|responded|started to respond|are trying to)\b/i, /\bbounce has started\b/i, /\brebound has started\b/i]},
    {key:'support_failed', patterns:[/\bsupport (?:failed|gave way|broke)\b/i, /\blost support\b/i, /\bbreakdown\b/i]}
  ];
  const sentenceBuckets = sentences.map(sentence => semanticBuckets.filter(bucket => bucket.patterns.some(pattern => pattern.test(sentence))).map(bucket => bucket.key));
  return semanticBuckets.some(bucket => sentenceBuckets.filter(keys => keys.includes(bucket.key)).length > 1);
}

function safeObject(value){
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeStringArray(value){
  return Array.isArray(value) ? value.map(item => String(item || '').trim()).filter(Boolean) : [];
}

function combinedTextFromFields(response, fields){
  return fields.map(field => String(response?.[field] || '').trim()).join('\n').trim();
}

function splitIntoSentences(text){
  return String(text || '')
    .trim()
    .split(/(?<=[.!?])\s+/)
    .map(part => part.trim())
    .filter(Boolean);
}

function buildStructuredFacts(testCase){
  const caseData = safeObject(testCase);
  return {
    ticker:String(caseData.ticker || '').trim(),
    verdict:String(caseData.verdict || '').trim(),
    setupScore:Number(caseData.setupScore),
    primaryRecentEvent:String(caseData.primaryRecentEvent || '').trim(),
    supportLabel:String(caseData.supportLabel || '').trim(),
    trendLabel:String(caseData.trendLabel || '').trim(),
    supportSemantic:String(caseData.supportSemantic || '').trim(),
    buyerResponseSemantic:String(caseData.buyerResponseSemantic || '').trim(),
    confirmationSemantic:String(caseData.confirmationSemantic || '').trim(),
    eventSequence:normalizeStringArray(caseData.eventSequence),
    technicalContext:normalizeStringArray(caseData.technicalContext)
  };
}

function buildOneStepInstructions(){
  return [
    'You are Chart Guru, a calm beginner-friendly chart narrator for a Quality Pullback workflow.',
    'Turn structured recent-event facts directly into final novice prose.',
    'Explain what happened, not just what is visible.',
    'Lead with the dominant recent event, not with generic framing.',
    'Use plain English for a novice retail trader.',
    'Do not invent prices, indicators, confirmations, or extra chart facts.',
    'Do not say "the chart shows".',
    'Avoid repeating "wait for confirmation".',
    'Each section must do a different job: story, significance, location, teaching point, next watch signal.',
    'Return only the JSON fields defined by the schema.'
  ].join('\n');
}

function buildTwoStepInterpretationInstructions(){
  return [
    'You are an experienced discretionary trader writing an internal read, not user-facing prose.',
    'Read the structured recent-event facts and summarize the actual trader interpretation.',
    'Be concise, factual, and sequence-aware.',
    'Do not invent prices, indicators, or unsupported chart facts.',
    'Return only the JSON fields defined by the schema.'
  ].join('\n');
}

function buildTwoStepFinalInstructions(){
  return [
    'You are Chart Guru, a calm beginner-friendly chart narrator for a Quality Pullback workflow.',
    'Use the structured facts plus the internal trader interpretation to write final novice prose.',
    'Explain what happened, not just what is visible.',
    'Lead with the dominant recent event from the interpretation.',
    'Use plain English for a novice retail trader.',
    'Sound like an experienced swing trader quietly explaining the chart to someone buying their first stock.',
    'Start chartStory with visible buyer, seller, or price behaviour before explaining what it means.',
    'Keep sentences short and spoken. One idea per sentence.',
    'Section jobs are fixed: chartStory = observable behaviour then meaning; whyItMatters = why traders care now; setupLocation = factual support/resistance location; learningPoint = one practical lesson; whatNext = one concrete signal to watch.',
    'chartStory should usually be two short sentences. Sentence 1 = what just happened. Sentence 2 = what that means now. Use a third short sentence only when it is essential.',
    'chartStory first sentence must lead with the dominant event itself rather than generic trend recap.',
    'learningPoint should be one or two short sentences. Teach one practical lesson tied directly to the current event. Do not give generic advice.',
    'Do not start learningPoint with "watch", "look for", or "wait for". That belongs in whatNext.',
    'Avoid vague chartStory wording like "potential setup", "useful area", or "promising chart" when a more concrete event is available.',
    'Use chartStory formulas like: "Buyers tried to bounce from support, but the move faded quickly. That means support has not proved itself yet." "The stock has reached its first proper test of support. That means traders are watching for a buyer response, not assuming support is already holding." "The stock is pulling back in a controlled way toward support. That means the trend is still intact, but buyers still need to follow through." "The pullbacks are getting messier. That tells traders the setup is losing quality."',
    'Use learningPoint formulas like: "A good support area is only a starting point. Traders still need to see buyers defend it." "The first reaction from support is encouraging, but one response is not enough on its own." "A damaged chart can bounce before it is fixed." "A trend can stay up while the setup gets harder to trade."',
    'Avoid generic lesson wording like "it is important to", "it is crucial to", "always look for", "be cautious", or "before making any decisions".',
    'If buyers have not shown enough yet, say that clearly and do not imply a confirmed bounce.',
    'If buyers are responding but follow-through is not confirmed, acknowledge the response without implying control has been regained.',
    'For constructive pullback cases near support with buyers still absent or weak and follow-through unconfirmed, prefer phrases like "buyers still need to step in", "buyers have not followed through yet", "the bounce still needs proof", or "the pullback is worth watching, but it is not ready yet".',
    'For failed-bounce cases, whatNext must ask for a new stronger buyer response or a stronger reclaim. Do not say "confirmed bounce" or "confirmation of the bounce" because the earlier bounce already failed.',
    'Avoid abstract phrasing like "this situation indicates", "potential opportunity", "favourable position", "buyer commitment", "waiting phase", or "constructive backdrop".',
    'Do not invent prices, indicators, confirmations, or extra chart facts.',
    'Do not say "the chart shows".',
    'Avoid repeating "wait for confirmation".',
    'Each section must do a different job: story, significance, location, teaching point, next watch signal.',
    'Return only the JSON fields defined by the schema.'
  ].join('\n');
}

function buildJudgeInstructions(){
  return [
    'You are evaluating two Chart Guru prose variants for a beginner trader.',
    'Prefer the variant that better leads with the dominant recent event, explains what changed, stays faithful to the supplied facts, avoids generic filler, and gives a more useful next signal.',
    'Do not reward extra verbosity by itself.',
    'Return only the JSON fields defined by the schema.'
  ].join('\n');
}

function buildOneStepPrompt(testCase){
  return buildOneStepPromptFromStructuredFacts(buildStructuredFacts(testCase));
}

function buildTwoStepInterpretationPrompt(testCase){
  return buildTwoStepInterpretationPromptFromStructuredFacts(buildStructuredFacts(testCase));
}

function buildOneStepPromptFromStructuredFacts(structuredFacts){
  return [
    'Produce final novice Chart Guru prose from these structured recent-event facts.',
    '',
    JSON.stringify(safeObject(structuredFacts), null, 2)
  ].join('\n');
}

function buildTwoStepInterpretationPromptFromStructuredFacts(structuredFacts){
  return [
    'Produce the internal trader interpretation from these structured recent-event facts.',
    '',
    JSON.stringify(safeObject(structuredFacts), null, 2)
  ].join('\n');
}

function buildTwoStepFinalPrompt(testCase, traderInterpretation){
  return buildTwoStepFinalPromptFromStructuredFacts(buildStructuredFacts(testCase), traderInterpretation);
}

function buildTwoStepFinalPromptFromStructuredFacts(structuredFacts, traderInterpretation){
  return [
    'Use the structured facts and internal trader interpretation to produce final novice Chart Guru prose.',
    '',
    JSON.stringify({
      structuredFacts:safeObject(structuredFacts),
      traderInterpretation:safeObject(traderInterpretation)
    }, null, 2)
  ].join('\n');
}

function buildJudgePrompt(testCase, caseResult){
  const oneStep = caseResult.variants.find(item => item.variant === 'one_step');
  const twoStep = caseResult.variants.find(item => item.variant === 'two_step');
  return [
    'Compare these two Chart Guru prose variants and choose the better one for a beginner trader.',
    'Prefer the variant that better explains the dominant recent event and avoids generic wording.',
    '',
    JSON.stringify({
      structuredFacts:buildStructuredFacts(testCase),
      one_step:oneStep && oneStep.response ? oneStep.response : null,
      two_step:{
        traderInterpretation:twoStep && twoStep.traderInterpretation ? twoStep.traderInterpretation : null,
        finalProse:twoStep && twoStep.response ? twoStep.response : null
      }
    }, null, 2)
  ].join('\n');
}

function extractOutputText(payload){
  if(typeof payload?.output_text === 'string' && payload.output_text.trim()){
    return payload.output_text.trim();
  }
  const output = Array.isArray(payload?.output) ? payload.output : [];
  for(const item of output){
    const content = Array.isArray(item?.content) ? item.content : [];
    for(const part of content){
      if(typeof part?.text === 'string' && part.text.trim()){
        return part.text.trim();
      }
      if(typeof part?.text?.value === 'string' && part.text.value.trim()){
        return part.text.value.trim();
      }
    }
  }
  return '';
}

function detectUnexpectedPriceMentions(response, fields, allowedPrices = []){
  const text = combinedTextFromFields(response, fields);
  const errors = [];
  const allowed = new Set(normalizeStringArray(allowedPrices));
  const numericMatches = text.matchAll(/\b\d+(?:\.\d+)?\b/g);

  for(const match of numericMatches){
    const value = String(match[0]);
    const index = Number(match.index || 0);
    const start = Math.max(0, index - 12);
    const end = Math.min(text.length, index + value.length + 12);
    const context = text.slice(start, end);
    if(allowed.has(value)) continue;
    if(/\b(20|50|200)(?:-day|\s*day|\s*ma)\b/i.test(context)) continue;
    if(/\bma\s*(20|50|200)\b/i.test(context)) continue;
    if(/[£$€]/.test(context) || value.includes('.') || Number(value) >= 100){
      errors.push(`Unexpected price-like number "${value}" in "${context.trim()}".`);
    }
  }

  return errors;
}

function validateRequiredFields(response, fields){
  const errors = [];
  for(const field of fields){
    if(typeof response?.[field] !== 'string' || !response[field].trim()){
      errors.push(`Missing required field: ${field}.`);
    }
  }
  return errors;
}

function validatePrimaryRecentEvent(testCase, response){
  const eventKey = String(testCase?.primaryRecentEvent || '').trim();
  const rules = EVENT_RULES[eventKey];
  if(!rules) return [];
  const text = combinedTextFromFields(response, FINAL_REQUIRED_FIELDS);
  const errors = [];
  for(const pattern of rules.requiredPatterns || []){
    if(!pattern.test(text)){
      errors.push(`Output did not reflect primaryRecentEvent ${eventKey}. Missing pattern ${pattern}.`);
    }
  }
  for(const pattern of rules.forbiddenPatterns || []){
    if(pattern.test(text)){
      errors.push(`Output contradicted primaryRecentEvent ${eventKey}. Matched forbidden pattern ${pattern}.`);
    }
  }
  return errors;
}

function validatePrimaryRecentEventWarnings(testCase, response){
  return validatePrimaryRecentEvent(testCase, response);
}

function validateDominantLead(testCase, response){
  const eventKey = String(testCase?.primaryRecentEvent || '').trim();
  const rules = EVENT_RULES[eventKey];
  if(!rules) return [];
  const chartStory = String(response?.chartStory || '').trim();
  if(!chartStory) return [];
  const opening = chartStory
    .split(/(?<=[.!?])\s+/)
    .slice(0, 2)
    .join(' ')
    .slice(0, 260);
  const leadPatterns = Array.isArray(rules.dominantLeadPatterns) ? rules.dominantLeadPatterns : [];
  const matched = leadPatterns.some(pattern => pattern.test(opening));
  return matched ? [] : [`Chart story did not lead with the dominant recent event for ${eventKey}.`];
}

function validateForbiddenPhrases(response){
  const text = combinedTextFromFields(response, FINAL_REQUIRED_FIELDS);
  const errors = [];
  if(/\bthe chart shows\b/i.test(text)){
    errors.push('Output used forbidden phrase "the chart shows".');
  }
  const repeatedConfirmation = text.match(/\bwait for confirmation\b/gi) || [];
  if(repeatedConfirmation.length > 1){
    errors.push('Output repeated "wait for confirmation" too often.');
  }
  return errors;
}

function validateNoNewIndicators(response){
  const text = combinedTextFromFields(response, FINAL_REQUIRED_FIELDS);
  const matches = NEW_INDICATOR_PATTERNS.filter(pattern => pattern.test(text));
  return matches.map(pattern => `Output introduced unsupported indicator reference ${pattern}.`);
}

function validateDistinctSectionJobs(response){
  const normalized = FINAL_REQUIRED_FIELDS
    .map(field => ({
      field,
      value:String(response?.[field] || '').trim().toLowerCase().replace(/[^\w\s]/g, '')
    }))
    .filter(item => item.value);
  const errors = [];
  for(let i = 0; i < normalized.length; i += 1){
    for(let j = i + 1; j < normalized.length; j += 1){
      if(normalized[i].value === normalized[j].value){
        errors.push(`Sections ${normalized[i].field} and ${normalized[j].field} are duplicated.`);
      }
    }
  }
  return errors;
}

function validateSectionRoleDiscipline(testCase, response){
  const errors = [];
  const chartStory = String(response?.chartStory || '').trim();
  const whyItMatters = String(response?.whyItMatters || '').trim();
  const setupLocation = String(response?.setupLocation || '').trim();
  const learningPoint = String(response?.learningPoint || '').trim();
  const whatNext = String(response?.whatNext || '').trim();
  const chartStorySentences = splitIntoSentences(chartStory);
  const chartStoryOpening = chartStorySentences.slice(0, 2).join(' ');
  const learningPointSentences = splitIntoSentences(learningPoint);

  if(/^this situation\b/i.test(chartStoryOpening) || /^the trend\b/i.test(chartStoryOpening)){
    errors.push('chartStory started with generic framing instead of visible behaviour.');
  }
  if(!/\b(buyers?|sellers?|price|stock|bounce|pullback|rebound|green day|red day|drifting|pushed|faded)\b/i.test(chartStoryOpening)){
    errors.push('chartStory did not begin with observable behaviour.');
  }
  const eventLeadPatterns = eventLeadPatternsForCase(testCase);
  if(eventLeadPatterns.length && !eventLeadPatterns.some(pattern => pattern.test(chartStorySentences[0] || ''))){
    errors.push('chartStory first sentence did not lead with the dominant event.');
  }
  if(hasRepeatedSemanticState(chartStorySentences)){
    errors.push('chartStory repeated the same semantic state across multiple sentences.');
  }
  if(/^recently\b/i.test(whyItMatters) || /^currently\b/i.test(whyItMatters)){
    errors.push('whyItMatters repeated story/location framing instead of why traders care now.');
  }
  const specificLocationPresent = /\b(support|resistance|20(?:-day)?|50(?:-day)?|near|at|around|between)\b/i.test(setupLocation);
  const honestNonSpecificLocation = String(testCase?.primaryRecentEvent || '') === 'diminishing_quality'
    && /\b(trend has not fully broken|trend is still partly intact|current timing|harder to trust|less orderly|pullbacks)\b/i.test(setupLocation);
  if(!specificLocationPresent && !honestNonSpecificLocation){
    errors.push('setupLocation was not factual enough about support or resistance.');
  }
  if(/\balways be cautious\b/i.test(learningPoint)){
    errors.push('learningPoint used generic advice.');
  }
  if(!/\b(need to see|good area|before trusting|traders|reduce the risk|can bounce before it is fixed|starting point|too early|harder to time|harder to trade|build a base|what buyers do next|stay patient|buyer response|follow through|holding|defended|location|timing)\b/i.test(learningPoint)){
    errors.push('learningPoint did not read like one practical lesson.');
  }
  if(/\b(always|every time|never)\b/i.test(learningPoint) || /\bassess the setup carefully\b/i.test(learningPoint) || /\bclear signals\b/i.test(learningPoint) || /\bdecision-making process\b/i.test(learningPoint) || /\bbe cautious\b/i.test(learningPoint) || /\bpatience is important\b/i.test(learningPoint)){
    errors.push('learningPoint fell back to generic advice instead of teaching the current event.');
  }
  const learningPatterns = learningPointPatternsForCase(testCase);
  if(learningPatterns.length && !learningPatterns.some(pattern => pattern.test(learningPoint))){
    errors.push('learningPoint was not practical enough for the current dominant event.');
  }
  if(learningPointSentences.length > 2){
    errors.push('learningPoint exceeded the one-to-two sentence target.');
  }
  if(/^(watch|look for|wait for)\b/i.test(learningPoint)){
    errors.push('learningPoint repeated whatNext instead of teaching the lesson.');
  }
  if(!/\b(watch|look for|wait for|need to see|hold|reclaim|another strong)\b/i.test(whatNext)){
    errors.push('whatNext did not give a concrete observable signal.');
  }
  if(/\bconfirmed bounce\b/i.test(whatNext) && String(testCase?.primaryRecentEvent || '') !== 'failed_first_bounce_from_20ma'){
    errors.push('whatNext implied confirmation had already happened.');
  }
  if(String(testCase?.primaryRecentEvent || '') === 'failed_first_bounce_from_20ma' && /\b(confirmed bounce|confirmation of the bounce)\b/i.test(whatNext)){
    errors.push('whatNext for a failed-bounce case must ask for a new stronger buyer response, not a "confirmed bounce".');
  }
  return errors;
}

function validateTutorVoice(response){
  const errors = [];
  for(const field of FINAL_REQUIRED_FIELDS){
    const text = String(response?.[field] || '').trim();
    if(BANNED_ABSTRACTION_PATTERNS.some(pattern => pattern.test(text))){
      errors.push(`${field} used banned abstract wording.`);
    }
    const sentences = splitIntoSentences(text);
    if(sentences.length > 3){
      errors.push(`${field} exceeded the 1-3 sentence rhythm target.`);
    }
    for(const sentence of sentences){
      const words = sentence.split(/\s+/).filter(Boolean);
      if(words.length > 28){
        errors.push(`${field} contained a long sentence that did not sound spoken.`);
        break;
      }
    }
  }
  return errors;
}

function validateSemanticDisciplineByFixture(testCase, response){
  const text = combinedTextFromFields(response, FINAL_REQUIRED_FIELDS);
  const chartStoryOpening = splitIntoSentences(String(response?.chartStory || '')).slice(0, 2).join(' ');
  const errors = [];
  switch(String(testCase?.primaryRecentEvent || '')){
    case 'first_test_of_50ma_buyers_not_confirmed':
      if(/\bconfirmed bounce\b/i.test(text)){
        errors.push('ALLY: implied a bounce or confirmation that had not happened.');
      }
      if(!/\b(no clear bounce|not yet|have not shown enough|have not yet shown|without a clear response|still needs proof|still needs confirmation|no strong response)\b/i.test(text)){
        errors.push('ALLY: did not make the missing buyer confirmation clear enough.');
      }
      break;
    case 'failed_first_bounce_from_20ma':
      if(/\b(confirmed bounce|confirmation of the bounce)\b/i.test(String(response?.whatNext || ''))){
        errors.push('CAT: whatNext treated the failed bounce as if it only needed confirmation instead of a new stronger response.');
      }
      if(!/\b(failed|bounce failed|could not hold|rebound faded)\b/i.test(chartStoryOpening)){
        errors.push('CAT: failed bounce was no longer the clear lead.');
      }
      break;
    case 'constructive_pullback_no_confirmation':
      if(BANNED_ABSTRACTION_PATTERNS.some(pattern => pattern.test(text))){
        errors.push('UPS: wording became abstract or over-explained.');
      }
      break;
    case 'diminishing_quality':
      if(!/\b(losing quality|quality is slipping|quality is fading|messier|less clean|less convincing|weakening)\b/i.test(chartStoryOpening)){
        errors.push('VRT: deterioration did not lead the story.');
      }
      break;
    case 'constructive_but_early_monitor_watch':
      if(/\b(useful area|promising|potential)\b/i.test(chartStoryOpening) && !/\bearly\b/i.test(chartStoryOpening)){
        errors.push('GEV: used vague setup language instead of visible early behaviour.');
      }
      break;
    default:
      break;
  }
  return errors;
}

function validateFixtureSpecificPhrases(testCase, response){
  const text = combinedTextFromFields(response, FINAL_REQUIRED_FIELDS).toLowerCase();
  const errors = [];
  const forbidden = normalizeStringArray(testCase?.forbiddenPhrases);
  for(const phrase of forbidden){
    if(text.includes(phrase.toLowerCase())){
      errors.push(`Output used forbidden phrase "${phrase}".`);
    }
  }
  return errors;
}

function validateFinalResponse(testCase, response){
  const strict = testCase && testCase.__strict === true;
  const errors = [];
  const warnings = [];
  errors.push(...validateRequiredFields(response, FINAL_REQUIRED_FIELDS));
  errors.push(...detectUnexpectedPriceMentions(response, FINAL_REQUIRED_FIELDS, testCase?.allowedPriceMentions));
  errors.push(...validateNoNewIndicators(response));
  errors.push(...validateFixtureSpecificPhrases(testCase, response));
  const proseWarnings = []
    .concat(validatePrimaryRecentEventWarnings(testCase, response))
    .concat(validateDominantLead(testCase, response))
    .concat(validateForbiddenPhrases(response))
    .concat(validateDistinctSectionJobs(response))
    .concat(validateSectionRoleDiscipline(testCase, response))
    .concat(validateTutorVoice(response))
    .concat(validateSemanticDisciplineByFixture(testCase, response));
  if(strict){
    errors.push(...proseWarnings);
  }else{
    warnings.push(...proseWarnings);
  }
  return {
    ok:errors.length === 0,
    errors,
    warnings
  };
}

function buildTutorVoiceJudge(testCase, variantResult){
  if(!variantResult || variantResult.error || !variantResult.response){
    return {
      available:false,
      totalScore:0,
      maxScore:14,
      summary:'No response available for tutor-voice judging.',
      failures:['No response available.']
    };
  }
  const response = variantResult.response;
  const chartStory = String(response.chartStory || '');
  const whatNext = String(response.whatNext || '');
  const voiceErrors = validateTutorVoice(response);
  const sectionErrors = validateSectionRoleDiscipline(testCase, response);
  const semanticWarnings = validateSemanticDisciplineByFixture(testCase, response);
  let totalScore = 14;
  if(!/\b(buyers?|sellers?|price|stock|bounce|pullback|rebound|green day|red day|drifting|pushed|faded)\b/i.test(splitIntoSentences(chartStory).slice(0, 2).join(' '))){
    totalScore -= 2;
  }
  if(!/\b(watch|look for|wait for|need to see|hold|reclaim|another strong)\b/i.test(whatNext)){
    totalScore -= 2;
  }
  const chartStorySentences = splitIntoSentences(chartStory);
  if(chartStorySentences.length === 0 || chartStorySentences.length > 3){
    totalScore -= 1;
  }
  totalScore -= Math.min(4, voiceErrors.length);
  totalScore -= Math.min(4, sectionErrors.length);
  totalScore -= Math.min(2, semanticWarnings.length);
  return {
    available:true,
    totalScore:Math.max(0, totalScore),
    maxScore:14,
    summary:voiceErrors.length || sectionErrors.length || semanticWarnings.length
      ? 'Tutor voice showed drift from the spoken, observable, section-disciplined target.'
      : 'Tutor voice stayed spoken, concrete, and section-disciplined.',
    failures:[].concat(voiceErrors).concat(sectionErrors).concat(semanticWarnings)
  };
}

function validateTraderInterpretationResponse(response){
  const errors = [];
  errors.push(...validateRequiredFields(response, INTERPRETATION_REQUIRED_FIELDS));
  errors.push(...detectUnexpectedPriceMentions(response, INTERPRETATION_REQUIRED_FIELDS, []));
  const text = combinedTextFromFields(response, INTERPRETATION_REQUIRED_FIELDS);
  const matches = NEW_INDICATOR_PATTERNS.filter(pattern => pattern.test(text));
  errors.push(...matches.map(pattern => `Trader interpretation introduced unsupported indicator reference ${pattern}.`));
  return {
    ok:errors.length === 0,
    errors,
    warnings:[]
  };
}

function scoreEventFidelity(testCase, response){
  const rules = EVENT_RULES[String(testCase?.primaryRecentEvent || '').trim()];
  const text = combinedTextFromFields(response, FINAL_REQUIRED_FIELDS);
  if(!rules) return {score:2, maxScore:2, notes:['No event-specific rubric rules configured.']};
  let score = 0;
  const notes = [];
  const required = Array.isArray(rules.requiredPatterns) ? rules.requiredPatterns : [];
  const forbidden = Array.isArray(rules.forbiddenPatterns) ? rules.forbiddenPatterns : [];
  const matchedRequired = required.filter(pattern => pattern.test(text)).length;
  if(matchedRequired === required.length && required.length > 0){
    score += 2;
    notes.push('Matched all required event cues.');
  }else if(matchedRequired > 0){
    score += 1;
    notes.push(`Matched ${matchedRequired}/${required.length} required event cues.`);
  }else{
    notes.push('Did not clearly anchor to the primary recent event.');
  }
  const matchedForbidden = forbidden.filter(pattern => pattern.test(text)).length;
  if(matchedForbidden > 0){
    score -= 2;
    notes.push(`Hit ${matchedForbidden} forbidden contradiction cue(s).`);
  }else{
    notes.push('Did not contradict the event framing.');
  }
  return {
    score:Math.max(0, Math.min(4, score + 2)),
    maxScore:4,
    notes
  };
}

function scoreBeginnerClarity(response){
  const text = combinedTextFromFields(response, FINAL_REQUIRED_FIELDS);
  const notes = [];
  let score = 2;
  const jargonHits = NEW_INDICATOR_PATTERNS.filter(pattern => pattern.test(text)).length;
  if(jargonHits === 0){
    score += 1;
    notes.push('Avoided advanced indicator jargon.');
  }else{
    score -= Math.min(2, jargonHits);
    notes.push(`Used ${jargonHits} advanced indicator cue(s).`);
  }
  if(!/\bthe chart shows\b/i.test(text)){
    score += 1;
    notes.push('Avoided generic "the chart shows" framing.');
  }else{
    notes.push('Used generic framing.');
  }
  return {
    score:Math.max(0, Math.min(4, score)),
    maxScore:4,
    notes
  };
}

function scoreSetupSpecificity(response){
  const location = String(response?.setupLocation || '').trim();
  const notes = [];
  let score = 1;
  const matched = LOCATION_SPECIFICITY_PATTERNS.filter(pattern => pattern.test(location)).length;
  if(matched >= 2){
    score = 4;
    notes.push('Setup location is concrete and chart-specific.');
  }else if(matched === 1){
    score = 3;
    notes.push('Setup location is moderately specific.');
  }else if(location){
    score = 2;
    notes.push('Setup location is present but generic.');
  }else{
    notes.push('Setup location is missing.');
  }
  return {score, maxScore:4, notes};
}

function scoreWhatNextUsefulness(response){
  const text = String(response?.whatNext || '').trim();
  const notes = [];
  let score = 1;
  const helpfulHits = HELPFUL_NEXT_PATTERNS.filter(pattern => pattern.test(text)).length;
  if(helpfulHits >= 2){
    score = 4;
    notes.push('What next gives a concrete watch condition.');
  }else if(helpfulHits === 1){
    score = 3;
    notes.push('What next gives some usable direction.');
  }else if(text){
    score = 2;
    notes.push('What next is present but vague.');
  }else{
    notes.push('What next is missing.');
  }
  return {score, maxScore:4, notes};
}

function scoreDominantLead(testCase, response){
  const leadErrors = validateDominantLead(testCase, response);
  return {
    score:leadErrors.length ? 1 : 4,
    maxScore:4,
    notes:leadErrors.length ? leadErrors : ['Chart story leads with the dominant recent event.']
  };
}

function buildRubricScore(testCase, variantResult){
  if(!variantResult || variantResult.error || !variantResult.response){
    return {
      variant:String(variantResult?.variant || ''),
      available:false,
      totalScore:0,
      maxScore:21,
      dimensions:{},
      notes:[variantResult?.error ? `Variant error: ${variantResult.error}` : 'No response available for rubric scoring.']
    };
  }

  const eventFidelity = scoreEventFidelity(testCase, variantResult.response);
  const beginnerClarity = scoreBeginnerClarity(variantResult.response);
  const setupSpecificity = scoreSetupSpecificity(variantResult.response);
  const whatNextUsefulness = scoreWhatNextUsefulness(variantResult.response);
  const dominantLead = scoreDominantLead(testCase, variantResult.response);
  const validationBonus = variantResult.validation && variantResult.validation.ok ? 1 : 0;
  const totalScore = eventFidelity.score + beginnerClarity.score + setupSpecificity.score + whatNextUsefulness.score + dominantLead.score + validationBonus;

  return {
    variant:String(variantResult.variant || ''),
    available:true,
    totalScore,
    maxScore:21,
    dimensions:{
      eventFidelity,
      beginnerClarity,
      setupSpecificity,
      whatNextUsefulness,
      dominantLead,
      validationBonus:{
        score:validationBonus,
        maxScore:1,
        notes:[validationBonus ? 'Passed harness validation.' : 'Failed harness validation.']
      }
    },
    notes:[]
  };
}

function compareVariantScores(scoresByVariant = {}){
  const oneStep = safeObject(scoresByVariant.one_step);
  const twoStep = safeObject(scoresByVariant.two_step);
  if(oneStep.available !== true || twoStep.available !== true){
    return {
      preferredVariant:'unavailable',
      outcome:'rubric_unavailable',
      summary:'Comparison rubric unavailable because one or both variants did not produce a scoreable response.'
    };
  }
  const delta = Number(twoStep.totalScore || 0) - Number(oneStep.totalScore || 0);
  if(delta > 0){
    return {
      preferredVariant:'two_step',
      outcome:'two_step_better',
      summary:'Two-step interpretation plus novice prose produced the stronger Chart Guru explanation in this case.'
    };
  }
  if(delta < 0){
    return {
      preferredVariant:'one_step',
      outcome:'one_step_better',
      summary:'One-step structured facts to novice prose produced the stronger Chart Guru explanation in this case.'
    };
  }
  return {
    preferredVariant:'tie',
    outcome:'no_clear_winner',
    summary:'The two prompt modes scored equally in this case, so the rubric alone could not separate them.'
  };
}

function buildComparisonRubric(testCase, variants = []){
  const scoresByVariant = {};
  for(const variant of variants){
    scoresByVariant[String(variant && variant.variant || '')] = buildRubricScore(testCase, variant);
  }
  return {
    criteria:[
      'eventFidelity',
      'beginnerClarity',
      'setupSpecificity',
      'whatNextUsefulness',
      'dominantLead',
      'validationBonus'
    ],
    scoresByVariant,
    comparison:compareVariantScores(scoresByVariant)
  };
}

module.exports = {
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
  buildOneStepPromptFromStructuredFacts,
  buildStructuredFacts,
  buildTwoStepFinalInstructions,
  buildTwoStepFinalPrompt,
  buildTwoStepFinalPromptFromStructuredFacts,
  buildTwoStepInterpretationInstructions,
  buildTwoStepInterpretationPrompt,
  buildTwoStepInterpretationPromptFromStructuredFacts,
  extractOutputText,
  validateFinalResponse,
  validateTraderInterpretationResponse
};
