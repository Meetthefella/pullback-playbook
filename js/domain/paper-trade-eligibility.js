(function(global){
  function createPaperTradeEligibility(deps = {}){
    const numericOrNull = typeof deps.numericOrNull === 'function'
      ? deps.numericOrNull
      : (value => {
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
      });

    function normalizeVerdictToken(verdict){
      return String(verdict || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
    }

    function isEntryReadyVerdict(verdict){
      return normalizeVerdictToken(verdict) === 'entry';
    }

    function isPaperTradeEligible({finalVerdict, plan} = {}){
      if(!plan || typeof plan !== 'object') return false;
      const entry = numericOrNull(plan.entry);
      const stop = numericOrNull(plan.stop);
      const target = numericOrNull(plan.target);
      const positionSize = numericOrNull(plan.positionSize);
      const maxLoss = numericOrNull(plan.maxLoss);
      return (
        isEntryReadyVerdict(finalVerdict)
        && plan.valid === true
        && Number.isFinite(entry)
        && Number.isFinite(stop)
        && Number.isFinite(target)
        && Number.isFinite(positionSize)
        && positionSize > 0
        && Number.isFinite(maxLoss)
        && maxLoss > 0
        && plan.riskTooWide !== true
        && plan.invalid !== true
      );
    }

    function evaluatePaperTradeEligibility(context = {}){
      const finalVerdict = String(context.finalVerdict || '').trim();
      const planStatus = String(context.planStatus || '').trim().toLowerCase();
      const primaryState = String(context.primaryState || '').trim().toLowerCase();
      const riskStatus = String(context.riskStatus || '').trim().toLowerCase();
      const tradeability = String(context.tradeability || '').trim().toLowerCase();
      const capitalFit = String(context.capitalFit || '').trim().toLowerCase();
      const hardBlocker = String(context.hardBlocker || '').trim();
      const entry = numericOrNull(context.entry);
      const stop = numericOrNull(context.stop);
      const target = numericOrNull(context.target);
      const positionSize = numericOrNull(context.positionSize);
      const maxLoss = numericOrNull(context.maxLoss);
      const rrRatio = numericOrNull(context.rrRatio);
      const reasons = [];

      if(!isEntryReadyVerdict(finalVerdict)) reasons.push('Not actionable - setup is not Entry-ready.');
      if(planStatus !== 'valid') reasons.push('Trade plan is not valid.');
      if(!Number.isFinite(entry)) reasons.push('Planned entry is missing.');
      if(!Number.isFinite(stop)) reasons.push('Planned stop is missing.');
      if(!Number.isFinite(target)) reasons.push('Planned first target is missing.');
      if(!Number.isFinite(positionSize) || positionSize < 1) reasons.push('Position size is missing or below 1 share.');
      if(!Number.isFinite(maxLoss) || maxLoss <= 0) reasons.push('Risk amount is missing.');
      if(riskStatus && riskStatus !== 'fits_risk') reasons.push(`Risk status is ${riskStatus}.`);
      if(tradeability && !['tradable', 'risk_only'].includes(tradeability)) reasons.push(`Tradeability is ${tradeability}.`);
      if(capitalFit && !['fits_capital', 'unknown'].includes(capitalFit)) reasons.push(`Capital fit is ${capitalFit}.`);
      if(primaryState === 'dead') reasons.push('Setup is in dead state.');
      if(hardBlocker) reasons.push(hardBlocker);

      const plan = {
        valid:planStatus === 'valid',
        entry,
        stop,
        target,
        positionSize,
        maxLoss,
        riskTooWide:Boolean(riskStatus && riskStatus !== 'fits_risk'),
        invalid:Boolean(
          (tradeability && !['tradable', 'risk_only'].includes(tradeability))
          || (capitalFit && !['fits_capital', 'unknown'].includes(capitalFit))
          || primaryState === 'dead'
          || !!hardBlocker
        )
      };

      return {
        eligible:isPaperTradeEligible({finalVerdict, plan}) && reasons.length === 0,
        reasons,
        preview:{
          entry,
          stop,
          target,
          positionSize:Number.isFinite(positionSize) ? Math.max(1, Math.floor(positionSize)) : null,
          maxLoss,
          rrRatio
        }
      };
    }

    return {
      evaluatePaperTradeEligibility,
      isPaperTradeEligible
    };
  }

  global.PaperTradeEligibility = Object.assign({}, global.PaperTradeEligibility, {
    createPaperTradeEligibility
  });
})(window);
