const fs = require('fs');
const path = require('path');

async function writeJsonReport(testInfo, filename, payload){
  const target = testInfo.outputPath(filename);
  fs.writeFileSync(target, JSON.stringify(payload, null, 2));
  await testInfo.attach(filename, {
    path:target,
    contentType:'application/json'
  });
  return target;
}

function writeArtifactJson(filename, payload){
  const artifactsDir = path.resolve(__dirname, '..', '..', '..', 'artifacts');
  fs.mkdirSync(artifactsDir, {recursive:true});
  const target = path.join(artifactsDir, filename);
  fs.writeFileSync(target, JSON.stringify(payload, null, 2));
  return target;
}

module.exports = {
  writeJsonReport,
  writeArtifactJson
};
