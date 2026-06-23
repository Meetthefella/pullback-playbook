const {handleTradeExecution} = require('./lib/trade-execution-handler');

exports.handler = async function handler(event){
  return handleTradeExecution(event);
};
