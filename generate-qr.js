const QRCode = require('qrcode');
const sharp = require('sharp');
const path = require('path');

async function generateCartel() {
  const reviewUrl = 'https://maps.app.goo.gl/pRcSeaRfVEd6Jq9f9';
  const logoPath = 'C:\\Users\\titos\\.verdent\\artifacts\\buckets\\cf3799de-e381-415c-a6f2-14a7db53ad42\\images\\1778278708066_73278b66.jpeg';
  const outputPath = path.join(__dirname, 'cartel-resena-a5.png');

  // A5 at 300dpi = 1748x2480px (portrait)
  const width = 1748;
  const height = 2480;

  // Generate QR code (no logo overlay this time - needs to be scannable)
  const qrSize = 700;
  const qrBuffer = await QRCode.toBuffer(reviewUrl, {
    errorCorrectionLevel: 'M',
    width: qrSize,
    margin: 2,
    color: { dark: '#000000', light: '#ffffff' }
  });

  // Logo
  const logoSize = 400;
  const logo = await sharp(logoPath)
    .resize(logoSize, logoSize, { fit: 'cover' })
    .png()
    .toBuffer();

  // Create SVG with text
  const svgText = `
  <svg width="${width}" height="${height}">
    <style>
      .title { font-family: Georgia, serif; font-size: 120px; fill: #1a1a1a; font-weight: bold; }
      .stars { font-size: 150px; fill: #f4b400; }
      .subtitle { font-family: Arial, sans-serif; font-size: 70px; fill: #333333; }
      .small { font-family: Arial, sans-serif; font-size: 50px; fill: #666666; }
      .google { font-family: Arial, sans-serif; font-size: 60px; fill: #4285f4; font-weight: bold; }
    </style>
    <text x="${width/2}" y="750" text-anchor="middle" class="title">¿Te gustó</text>
    <text x="${width/2}" y="890" text-anchor="middle" class="title">la experiencia?</text>
    <text x="${width/2}" y="1080" text-anchor="middle" class="stars">⭐⭐⭐⭐⭐</text>
    <text x="${width/2}" y="1230" text-anchor="middle" class="subtitle">Dejanos tu opinión en</text>
    <text x="${width/2}" y="1320" text-anchor="middle" class="google">Google Maps</text>
    <text x="${width/2}" y="1450" text-anchor="middle" class="small">Escaneá el código QR</text>
    <text x="${width/2}" y="2380" text-anchor="middle" class="small">¡Gracias por elegirnos! 🙏</text>
  </svg>`;

  const svgBuffer = Buffer.from(svgText);

  // Create white background
  const background = await sharp({
    create: {
      width: width,
      height: height,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    }
  }).png().toBuffer();

  // Composite everything
  const qrLeft = Math.round((width - qrSize) / 2);
  const qrTop = 1520;
  const logoLeft = Math.round((width - logoSize) / 2);
  const logoTop = 200;

  await sharp(background)
    .composite([
      { input: svgBuffer, left: 0, top: 0 },
      { input: logo, left: logoLeft, top: logoTop },
      { input: qrBuffer, left: qrLeft, top: qrTop }
    ])
    .png()
    .toFile(outputPath);

  console.log('Cartel generado en:', outputPath);
  console.log('Tamaño: A5 (1748x2480px a 300dpi)');
}

generateCartel().catch(console.error);
