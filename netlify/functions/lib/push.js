const webPush = require('web-push');

function vapidConfigPresent(){
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
}

function configureWebPush(){
  if(!vapidConfigPresent()) return false;
  webPush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  return true;
}

async function sendPushNotification(subscription, payload){
  if(!configureWebPush()) return {ok:false, skipped:true, reason:'missing_vapid'};
  try{
    await webPush.sendNotification(subscription, JSON.stringify(payload), { TTL: 120 });
    return {ok:true};
  }catch(error){
    const statusCode = Number(error && error.statusCode);
    return {
      ok:false,
      removeSubscription:statusCode === 404 || statusCode === 410,
      reason:String(error && error.message || 'push_failed')
    };
  }
}

module.exports = {
  vapidConfigPresent,
  sendPushNotification
};
