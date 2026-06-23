const assert = require('assert');

const handlerModule = require('../netlify/functions/lib/trade-execution-handler.js');

async function withEnv(overrides, run){
  const original = {};
  Object.keys(overrides).forEach(key => {
    original[key] = process.env[key];
    if(overrides[key] === null){
      delete process.env[key];
    }else{
      process.env[key] = String(overrides[key]);
    }
  });
  try{
    return await run();
  }finally{
    Object.keys(overrides).forEach(key => {
      if(original[key] === undefined){
        delete process.env[key];
      }else{
        process.env[key] = original[key];
      }
    });
  }
}

async function withMockFetch(mockImpl, run){
  const originalFetch = global.fetch;
  global.fetch = mockImpl;
  try{
    return await run();
  }finally{
    global.fetch = originalFetch;
  }
}

function parseJsonResponse(response){
  assert(response && typeof response === 'object', 'Handler must return a response object.');
  assert.strictEqual(typeof response.statusCode, 'number', 'Handler must return a numeric statusCode.');
  return {
    ...response,
    json:JSON.parse(String(response.body || '{}'))
  };
}

async function testOptionsPreflight(){
  const result = parseJsonResponse(await handlerModule.handleTradeExecution({
    httpMethod:'OPTIONS',
    headers:{},
    body:''
  }));
  assert.strictEqual(result.statusCode, 200);
  assert.strictEqual(result.json.ok, true);
}

async function testMethodNotAllowed(){
  const result = parseJsonResponse(await handlerModule.handleTradeExecution({
    httpMethod:'GET',
    headers:{},
    body:''
  }));
  assert.strictEqual(result.statusCode, 405);
  assert.strictEqual(result.json.code, 'method_not_allowed');
}

async function testUnauthorized(){
  await withEnv({
    PAPER_TRADE_REQUIRE_AUTH:'true',
    PAPER_TRADE_SECRET:'topsecret'
  }, async () => {
    const result = parseJsonResponse(await handlerModule.handleTradeExecution({
      httpMethod:'POST',
      headers:{},
      body:JSON.stringify({action:'test_connection', broker:'trading212', mode:'paper'})
    }));
    assert.strictEqual(result.statusCode, 401);
    assert.strictEqual(result.json.code, 'unauthorized');
  });
}

async function testInvalidJson(){
  const result = parseJsonResponse(await handlerModule.handleTradeExecution({
    httpMethod:'POST',
    headers:{},
    body:'{bad json'
  }));
  assert.strictEqual(result.statusCode, 400);
  assert.strictEqual(result.json.code, 'invalid_json');
}

async function testLiveTradingLocked(){
  const result = parseJsonResponse(await handlerModule.handleTradeExecution({
    httpMethod:'POST',
    headers:{},
    body:JSON.stringify({action:'submit_order', broker:'trading212', mode:'live'})
  }));
  assert.strictEqual(result.statusCode, 403);
  assert.strictEqual(result.json.code, 'live_trading_locked');
}

async function testConnectionMockReady(){
  await withEnv({
    T212_PAPER_MOCK:'true',
    T212_PAPER_API_KEY:null,
    T212_PAPER_BASE_URL:null
  }, async () => {
    const result = parseJsonResponse(await handlerModule.handleTradeExecution({
      httpMethod:'POST',
      headers:{},
      body:JSON.stringify({action:'test_connection', broker:'trading212', mode:'paper'})
    }));
    assert.strictEqual(result.statusCode, 200);
    assert.strictEqual(result.json.ok, true);
    assert.strictEqual(result.json.status, 'mock_ready');
  });
}

async function testConnectionConfiguredReady(){
  await withEnv({
    T212_PAPER_MOCK:'false',
    T212_PAPER_API_KEY:'api-key',
    T212_PAPER_API_SECRET:'api-secret',
    T212_PAPER_BASE_URL:'https://demo.trading212.com'
  }, async () => {
    await withMockFetch(async (url, options) => {
      assert.strictEqual(url, 'https://demo.trading212.com/api/v0/equity/account/summary');
      assert.strictEqual(options.method, 'GET');
      assert.strictEqual(options.headers.Authorization, `Basic ${Buffer.from('api-key:api-secret', 'utf8').toString('base64')}`);
      return {
        ok:true,
        json:async () => ({currencyCode:'GBP', id:12345})
      };
    }, async () => {
      const result = parseJsonResponse(await handlerModule.handleTradeExecution({
        httpMethod:'POST',
        headers:{},
        body:JSON.stringify({action:'test_connection', broker:'trading212', mode:'paper'})
      }));
      assert.strictEqual(result.statusCode, 200);
      assert.strictEqual(result.json.ok, true);
      assert.strictEqual(result.json.status, 'ready');
    });
  });
}

async function testConnectionLocalTesterKeyReady(){
  await withEnv({
    T212_PAPER_MOCK:'false',
    T212_PAPER_API_KEY:null,
    T212_PAPER_API_SECRET:null,
    T212_PAPER_BASE_URL:null
  }, async () => {
    await withMockFetch(async (url, options) => {
      assert.strictEqual(url, 'https://demo.trading212.com/api/v0/equity/account/summary');
      assert.strictEqual(options.method, 'GET');
      assert.strictEqual(options.headers.Authorization, `Basic ${Buffer.from('tester-local-key:tester-local-secret', 'utf8').toString('base64')}`);
      return {
        ok:true,
        json:async () => ({currencyCode:'GBP', id:67890})
      };
    }, async () => {
      const result = parseJsonResponse(await handlerModule.handleTradeExecution({
        httpMethod:'POST',
        headers:{
          'x-trading212-paper-api-key':'tester-local-key',
          'x-trading212-paper-api-secret':'tester-local-secret'
        },
        body:JSON.stringify({action:'test_connection', broker:'trading212', mode:'paper'})
      }));
      assert.strictEqual(result.statusCode, 200);
      assert.strictEqual(result.json.ok, true);
      assert.strictEqual(result.json.status, 'ready');
    });
  });
}

async function testConnectionNotConfigured(){
  await withEnv({
    T212_PAPER_MOCK:'false',
    T212_PAPER_API_KEY:null,
    T212_PAPER_API_SECRET:null,
    T212_PAPER_BASE_URL:null
  }, async () => {
    const result = parseJsonResponse(await handlerModule.handleTradeExecution({
      httpMethod:'POST',
      headers:{},
      body:JSON.stringify({action:'test_connection', broker:'trading212', mode:'paper'})
    }));
    assert.strictEqual(result.statusCode, 503);
    assert.strictEqual(result.json.code, 'paper_trade_not_configured');
  });
}

async function testConnectionInvalidUpstreamAuth(){
  await withEnv({
    T212_PAPER_MOCK:'false',
    T212_PAPER_API_KEY:null,
    T212_PAPER_API_SECRET:null,
    T212_PAPER_BASE_URL:null
  }, async () => {
    await withMockFetch(async (url) => {
      assert.strictEqual(url, 'https://demo.trading212.com/api/v0/equity/account/summary');
      return {
        ok:false,
        status:401,
        json:async () => ({error:'Unauthorized'})
      };
    }, async () => {
      const result = parseJsonResponse(await handlerModule.handleTradeExecution({
        httpMethod:'POST',
        headers:{
          'x-trading212-paper-api-key':'tester-local-key',
          'x-trading212-paper-api-secret':'tester-local-secret'
        },
        body:JSON.stringify({action:'test_connection', broker:'trading212', mode:'paper'})
      }));
      assert.strictEqual(result.statusCode, 401);
      assert.strictEqual(result.json.code, 'paper_trade_auth_failed');
    });
  });
}

async function testConnectionUpstreamNetworkFailure(){
  await withEnv({
    T212_PAPER_MOCK:'false',
    T212_PAPER_API_KEY:null,
    T212_PAPER_API_SECRET:null,
    T212_PAPER_BASE_URL:null
  }, async () => {
    await withMockFetch(async (url) => {
      assert.strictEqual(url, 'https://demo.trading212.com/api/v0/equity/account/summary');
      throw new Error('network down');
    }, async () => {
      const result = parseJsonResponse(await handlerModule.handleTradeExecution({
        httpMethod:'POST',
        headers:{
          'x-trading212-paper-api-key':'tester-local-key',
          'x-trading212-paper-api-secret':'tester-local-secret'
        },
        body:JSON.stringify({action:'test_connection', broker:'trading212', mode:'paper'})
      }));
      assert.strictEqual(result.statusCode, 502);
      assert.strictEqual(result.json.code, 'paper_trade_unreachable');
    });
  });
}

async function testRejectClientCredentialsApiKeyOverride(){
  const result = parseJsonResponse(await handlerModule.handleTradeExecution({
    httpMethod:'POST',
    headers:{},
    body:JSON.stringify({
      action:'test_connection',
      broker:'trading212',
      mode:'paper',
      credentials:{apiKey:'attacker-key'}
    })
  }));
  assert.strictEqual(result.statusCode, 400);
  assert.strictEqual(result.json.code, 'invalid_request');
}

async function testRejectClientCredentialsApiSecretOverride(){
  const result = parseJsonResponse(await handlerModule.handleTradeExecution({
    httpMethod:'POST',
    headers:{},
    body:JSON.stringify({
      action:'test_connection',
      broker:'trading212',
      mode:'paper',
      credentials:{apiSecret:'attacker-secret'}
    })
  }));
  assert.strictEqual(result.statusCode, 400);
  assert.strictEqual(result.json.code, 'invalid_request');
}

async function testRejectClientCredentialsBaseUrlOverride(){
  const result = parseJsonResponse(await handlerModule.handleTradeExecution({
    httpMethod:'POST',
    headers:{
      'x-trading212-paper-api-key':'tester-local-key',
      'x-trading212-paper-api-secret':'tester-local-secret'
    },
    body:JSON.stringify({
      action:'submit_order',
      broker:'trading212',
      mode:'paper',
      credentials:{baseUrl:'https://evil.test'},
      request:{symbol:'AAPL', quantity:1, limitPrice:200}
    })
  }));
  assert.strictEqual(result.statusCode, 400);
  assert.strictEqual(result.json.code, 'invalid_request');
}

async function testRejectClientCredentialsOrderPathOverride(){
  const result = parseJsonResponse(await handlerModule.handleTradeExecution({
    httpMethod:'POST',
    headers:{
      'x-trading212-paper-api-key':'tester-local-key',
      'x-trading212-paper-api-secret':'tester-local-secret'
    },
    body:JSON.stringify({
      action:'submit_order',
      broker:'trading212',
      mode:'paper',
      credentials:{orderPath:'/evil'},
      request:{symbol:'AAPL', quantity:1, limitPrice:200}
    })
  }));
  assert.strictEqual(result.statusCode, 400);
  assert.strictEqual(result.json.code, 'invalid_request');
}

async function testUnsupportedBroker(){
  const result = parseJsonResponse(await handlerModule.handleTradeExecution({
    httpMethod:'POST',
    headers:{},
    body:JSON.stringify({action:'submit_order', broker:'unknown', mode:'paper'})
  }));
  assert.strictEqual(result.statusCode, 400);
  assert.strictEqual(result.json.code, 'unsupported_broker');
}

async function testMockPaperOrder(){
  await withEnv({
    T212_PAPER_MOCK:'true'
  }, async () => {
    const result = parseJsonResponse(await handlerModule.handleTradeExecution({
      httpMethod:'POST',
      headers:{},
      body:JSON.stringify({
        action:'submit_order',
        broker:'trading212',
        mode:'paper',
        request:{
          symbol:'NVDA',
          quantity:10,
          limitPrice:123.45,
          stopLoss:119.8,
          takeProfit:130
        }
      })
    }));
    assert.strictEqual(result.statusCode, 200);
    assert.strictEqual(result.json.result.symbol, 'NVDA');
    assert.strictEqual(result.json.result.broker, 'trading212');
    assert.strictEqual(result.json.result.mode, 'paper');
  });
}

async function testConfiguredUpstreamSubmit(){
  await withEnv({
    T212_PAPER_MOCK:'false',
    T212_PAPER_API_KEY:'api-key',
    T212_PAPER_API_SECRET:'api-secret',
    T212_PAPER_BASE_URL:'https://demo.trading212.com',
    T212_PAPER_ORDER_PATH:'/api/v0/equity/orders/limit'
  }, async () => {
    await withMockFetch(async (url, options) => {
      assert.strictEqual(url, 'https://demo.trading212.com/api/v0/equity/orders/limit');
      assert.strictEqual(options.headers.Authorization, `Basic ${Buffer.from('api-key:api-secret', 'utf8').toString('base64')}`);
      const payload = JSON.parse(String(options.body || '{}'));
      assert.strictEqual(payload.instrument, 'AAPL');
      assert.strictEqual(payload.quantity, 5);
      assert.ok(!Object.prototype.hasOwnProperty.call(payload, 'side'));
      return {
        ok:true,
        json:async () => ({
          id:'upstream-123',
          status:'submitted',
          submittedAt:'2026-06-23T10:00:00.000Z'
        })
      };
    }, async () => {
      const result = parseJsonResponse(await handlerModule.handleTradeExecution({
        httpMethod:'POST',
        headers:{},
        body:JSON.stringify({
          action:'submit_order',
          broker:'trading212',
          mode:'paper',
          request:{
            symbol:'AAPL',
            quantity:5,
            limitPrice:210.5
          }
        })
      }));
      assert.strictEqual(result.statusCode, 200);
      assert.strictEqual(result.json.result.orderId, 'upstream-123');
      assert.strictEqual(result.json.result.symbol, 'AAPL');
    });
  });
}

async function testLocalTesterKeyUpstreamSubmit(){
  await withEnv({
    T212_PAPER_MOCK:'false',
    T212_PAPER_API_KEY:null,
    T212_PAPER_API_SECRET:null,
    T212_PAPER_BASE_URL:null,
    T212_PAPER_ORDER_PATH:null
  }, async () => {
    await withMockFetch(async (url, options) => {
      assert.strictEqual(url, 'https://demo.trading212.com/api/v0/equity/orders/limit');
      assert.strictEqual(options.headers.Authorization, `Basic ${Buffer.from('tester-local-key:tester-local-secret', 'utf8').toString('base64')}`);
      const payload = JSON.parse(String(options.body || '{}'));
      assert.strictEqual(payload.instrument, 'TSLA');
      assert.strictEqual(payload.quantity, 3);
      return {
        ok:true,
        json:async () => ({
          id:'local-upstream-456',
          status:'submitted',
          submittedAt:'2026-06-23T10:30:00.000Z'
        })
      };
    }, async () => {
      const result = parseJsonResponse(await handlerModule.handleTradeExecution({
        httpMethod:'POST',
        headers:{
          'x-trading212-paper-api-key':'tester-local-key',
          'x-trading212-paper-api-secret':'tester-local-secret'
        },
        body:JSON.stringify({
          action:'submit_order',
          broker:'trading212',
          mode:'paper',
          request:{
            symbol:'TSLA',
            quantity:3,
            limitPrice:300.25
          }
        })
      }));
      assert.strictEqual(result.statusCode, 200);
      assert.strictEqual(result.json.result.orderId, 'local-upstream-456');
      assert.strictEqual(result.json.result.symbol, 'TSLA');
    });
  });
}

async function testEnvOverrideOutsideAllowlistFallsBackToDefaultEndpoint(){
  await withEnv({
    T212_PAPER_MOCK:'false',
    T212_PAPER_API_KEY:'api-key',
    T212_PAPER_API_SECRET:'api-secret',
    T212_PAPER_BASE_URL:'https://evil.test',
    T212_PAPER_ORDER_PATH:'/malicious'
  }, async () => {
    await withMockFetch(async (url) => {
      assert.strictEqual(url, 'https://demo.trading212.com/api/v0/equity/orders/limit');
      return {
        ok:true,
        json:async () => ({
          id:'allowlist-fallback-789',
          status:'submitted',
          submittedAt:'2026-06-23T11:00:00.000Z'
        })
      };
    }, async () => {
      const result = parseJsonResponse(await handlerModule.handleTradeExecution({
        httpMethod:'POST',
        headers:{},
        body:JSON.stringify({
          action:'submit_order',
          broker:'trading212',
          mode:'paper',
          request:{
            symbol:'NVDA',
            quantity:2,
            limitPrice:150
          }
        })
      }));
      assert.strictEqual(result.statusCode, 200);
      assert.strictEqual(result.json.result.orderId, 'allowlist-fallback-789');
    });
  });
}

async function testUpstreamFailure(){
  await withEnv({
    T212_PAPER_MOCK:'false',
    T212_PAPER_API_KEY:'api-key',
    T212_PAPER_API_SECRET:'api-secret',
    T212_PAPER_BASE_URL:'https://demo.trading212.com'
  }, async () => {
    await withMockFetch(async () => ({
      ok:false,
      status:502,
      json:async () => ({code:'broker_down', error:'Broker unavailable'})
    }), async () => {
      const result = parseJsonResponse(await handlerModule.handleTradeExecution({
        httpMethod:'POST',
        headers:{},
        body:JSON.stringify({
          action:'submit_order',
          broker:'trading212',
          mode:'paper',
          request:{
            symbol:'MSFT',
            quantity:5,
            limitPrice:410.25
          }
        })
      }));
      assert.strictEqual(result.statusCode, 502);
      assert.strictEqual(result.json.code, 'broker_down');
    });
  });
}

async function testInvalidRequest(){
  const result = parseJsonResponse(await handlerModule.handleTradeExecution({
    httpMethod:'POST',
    headers:{},
    body:JSON.stringify({
      action:'submit_order',
      broker:'trading212',
      mode:'paper',
      request:{
        symbol:'',
        quantity:0,
        limitPrice:0
      }
    })
  }));
  assert.strictEqual(result.statusCode, 400);
  assert.strictEqual(result.json.code, 'invalid_request');
}

async function testSellOrderUsesNegativeQuantity(){
  await withEnv({
    T212_PAPER_MOCK:'false',
    T212_PAPER_API_KEY:null,
    T212_PAPER_API_SECRET:null,
    T212_PAPER_BASE_URL:null,
    T212_PAPER_ORDER_PATH:null
  }, async () => {
    await withMockFetch(async (url, options) => {
      assert.strictEqual(url, 'https://demo.trading212.com/api/v0/equity/orders/limit');
      const payload = JSON.parse(String(options.body || '{}'));
      assert.strictEqual(payload.quantity, -4);
      return {
        ok:true,
        json:async () => ({
          id:'sell-order-999',
          status:'submitted',
          submittedAt:'2026-06-23T12:00:00.000Z'
        })
      };
    }, async () => {
      const result = parseJsonResponse(await handlerModule.handleTradeExecution({
        httpMethod:'POST',
        headers:{
          'x-trading212-paper-api-key':'tester-local-key',
          'x-trading212-paper-api-secret':'tester-local-secret'
        },
        body:JSON.stringify({
          action:'submit_order',
          broker:'trading212',
          mode:'paper',
          request:{
            symbol:'MSFT',
            side:'SELL',
            quantity:4,
            limitPrice:410.25
          }
        })
      }));
      assert.strictEqual(result.statusCode, 200);
      assert.strictEqual(result.json.result.side, 'SELL');
      assert.strictEqual(result.json.result.quantity, -4);
    });
  });
}

async function main(){
  const tests = [
    ['OPTIONS preflight', testOptionsPreflight],
    ['Method not allowed', testMethodNotAllowed],
    ['Unauthorized auth gate', testUnauthorized],
    ['Invalid JSON', testInvalidJson],
    ['Live trading locked', testLiveTradingLocked],
    ['Connection mock ready', testConnectionMockReady],
    ['Connection configured ready', testConnectionConfiguredReady],
    ['Connection local tester key ready', testConnectionLocalTesterKeyReady],
    ['Connection not configured', testConnectionNotConfigured],
    ['Connection invalid upstream auth', testConnectionInvalidUpstreamAuth],
    ['Connection upstream network failure', testConnectionUpstreamNetworkFailure],
    ['Reject client credentials apiKey override', testRejectClientCredentialsApiKeyOverride],
    ['Reject client credentials apiSecret override', testRejectClientCredentialsApiSecretOverride],
    ['Reject client credentials baseUrl override', testRejectClientCredentialsBaseUrlOverride],
    ['Reject client credentials orderPath override', testRejectClientCredentialsOrderPathOverride],
    ['Unsupported broker', testUnsupportedBroker],
    ['Mock paper order', testMockPaperOrder],
    ['Configured upstream submit', testConfiguredUpstreamSubmit],
    ['Local tester key upstream submit', testLocalTesterKeyUpstreamSubmit],
    ['Sell order uses negative quantity', testSellOrderUsesNegativeQuantity],
    ['Env override outside allowlist falls back to default endpoint', testEnvOverrideOutsideAllowlistFallsBackToDefaultEndpoint],
    ['Upstream failure', testUpstreamFailure],
    ['Invalid request', testInvalidRequest]
  ];

  for(const [name, testFn] of tests){
    await testFn();
    console.log(`Trade execution handler test passed: ${name}`);
  }

  console.log(`Trade execution handler tests passed (${tests.length} cases).`);
}

main().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
