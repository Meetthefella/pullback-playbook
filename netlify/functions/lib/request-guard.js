function trustedOrigins(){
  const configured = String(process.env.TRUSTED_APP_ORIGINS || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
  const envOrigins = [
    process.env.URL,
    process.env.DEPLOY_PRIME_URL
  ].map(value => String(value || '').trim()).filter(Boolean);
  const localOrigins = [
    'http://localhost:8888',
    'http://127.0.0.1:8888',
    'http://localhost:3000',
    'http://127.0.0.1:3000'
  ];
  return [...new Set([...configured, ...envOrigins, ...localOrigins])];
}

function requestOrigin(event){
  const headers = event && event.headers ? event.headers : {};
  return String(headers.origin || headers.Origin || '').trim();
}

function requestReferer(event){
  const headers = event && event.headers ? event.headers : {};
  return String(headers.referer || headers.Referer || '').trim();
}

function originAllowed(event){
  const allowedOrigins = trustedOrigins();
  const origin = requestOrigin(event);
  const referer = requestReferer(event);
  if(origin) return allowedOrigins.includes(origin);
  if(referer){
    try{
      return allowedOrigins.includes(new URL(referer).origin);
    }catch(error){
      return false;
    }
  }
  return process.env.CONTEXT === 'dev' || process.env.NODE_ENV === 'development';
}

function corsHeadersForEvent(event, methods){
  const headers = {
    'Content-Type':'application/json',
    'Cache-Control':'no-store',
    'Access-Control-Allow-Headers':'Content-Type',
    'Access-Control-Allow-Methods':methods
  };
  const origin = requestOrigin(event);
  if(origin && originAllowed(event)){
    headers['Access-Control-Allow-Origin'] = origin;
    headers.Vary = 'Origin';
  }
  return headers;
}

function guardTrustedOrigin(event){
  return originAllowed(event);
}

module.exports = {
  corsHeadersForEvent,
  guardTrustedOrigin
};
