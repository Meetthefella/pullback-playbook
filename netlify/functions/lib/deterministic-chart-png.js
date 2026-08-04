const crypto = require('crypto');
const zlib = require('zlib');

function crc32(buffer){
  let crc = 0xffffffff;
  for(const byte of buffer){
    crc ^= byte;
    for(let index = 0; index < 8; index += 1){
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data){
  const body = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length, 0);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, body])), 0);
  return Buffer.concat([length, typeBuffer, body, checksum]);
}

function setPixel(pixels, width, height, x, y, colour){
  if(x < 0 || y < 0 || x >= width || y >= height) return;
  const offset = ((y * width) + x) * 4;
  pixels[offset] = colour[0]; pixels[offset + 1] = colour[1]; pixels[offset + 2] = colour[2]; pixels[offset + 3] = 255;
}

function line(pixels, width, height, fromX, fromY, toX, toY, colour){
  let x = fromX, y = fromY;
  const dx = Math.abs(toX - fromX), sx = fromX < toX ? 1 : -1;
  const dy = -Math.abs(toY - fromY), sy = fromY < toY ? 1 : -1;
  let error = dx + dy;
  while(true){
    setPixel(pixels, width, height, x, y, colour);
    if(x === toX && y === toY) break;
    const twice = error * 2;
    if(twice >= dy){ error += dy; x += sx; }
    if(twice <= dx){ error += dx; y += sy; }
  }
}

function number(value){ const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; }

// The PNG intentionally contains no charting-library interpretation. It is a
// deterministic visualisation of the supplied bars, with provenance embedded
// in PNG text metadata, so its pixels and hash are reproducible from the same
// packet on any runner.
function renderDeterministicChartPng(bars = [], options = {}){
  const rows = Array.isArray(bars) ? bars : [];
  const closes = rows.map(row => number(row && row.close)).filter(value => value !== null);
  if(closes.length < 2) throw new Error('At least two valid close prices are required to render a chart.');
  const width = 960, height = 540, padding = 36;
  const pixels = Buffer.alloc(width * height * 4);
  for(let y = 0; y < height; y += 1){
    for(let x = 0; x < width; x += 1) setPixel(pixels, width, height, x, y, [12, 22, 35]);
  }
  const low = Math.min(...closes), high = Math.max(...closes);
  const range = high === low ? 1 : high - low;
  for(let index = 0; index <= 4; index += 1){
    const y = Math.round(padding + ((height - (padding * 2)) * index / 4));
    line(pixels, width, height, padding, y, width - padding, y, [33, 52, 70]);
  }
  const points = rows.map(row => number(row && row.close));
  let previous = null;
  const lineColour = String(options.variant || 'base') === 'alternate' ? [244, 162, 97] : [65, 201, 154];
  points.forEach((close, index) => {
    if(close === null) return;
    const x = Math.round(padding + ((width - (padding * 2)) * index / Math.max(1, points.length - 1)));
    const y = Math.round((height - padding) - (((close - low) / range) * (height - (padding * 2))));
    if(previous) line(pixels, width, height, previous.x, previous.y, x, y, lineColour);
    previous = {x, y};
  });
  const scanlines = Buffer.alloc((width * 4 + 1) * height);
  for(let y = 0; y < height; y += 1){
    const destination = y * ((width * 4) + 1);
    scanlines[destination] = 0;
    pixels.copy(scanlines, destination + 1, y * width * 4, (y + 1) * width * 4);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 6;
  const metadata = Buffer.from(`ticker=${String(options.ticker || '')};asOf=${String(options.asOf || '')};barsHash=${String(options.barsHash || '')};variant=${String(options.variant || 'base')}`, 'utf8');
  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    chunk('IHDR', header),
    chunk('tEXt', metadata),
    chunk('IDAT', zlib.deflateSync(scanlines, {level:9})),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function sha256(value){ return crypto.createHash('sha256').update(value).digest('hex'); }

module.exports = {renderDeterministicChartPng, sha256};
