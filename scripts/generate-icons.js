const sharp = require('sharp')
const fs = require('fs')
const path = require('path')

const sizes = [72, 96, 128, 144, 152, 192, 384, 512]

async function generateIcons() {
  const iconsDir = path.join(process.cwd(), 'public/icons')

  if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true })
  }

  const svgIcon = `
    <svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
      <rect width="512" height="512" fill="#0B1120"/>
      <circle cx="256" cy="256" r="220" fill="none" stroke="#4B2DBD" stroke-width="2" opacity="0.5"/>
      <circle cx="256" cy="256" r="180" fill="none" stroke="#4B2DBD" stroke-width="1" opacity="0.3"/>
      <text x="256" y="320" font-family="Arial, sans-serif" font-size="240" font-weight="700" fill="#E7ECFF" text-anchor="middle" letter-spacing="-10">A</text>
      <rect x="156" y="340" width="200" height="3" fill="#6CCBFF" opacity="0.8"/>
      <line x1="30" y1="30" x2="80" y2="30" stroke="#4B2DBD" stroke-width="3"/>
      <line x1="30" y1="30" x2="30" y2="80" stroke="#4B2DBD" stroke-width="3"/>
      <line x1="482" y1="30" x2="432" y2="30" stroke="#4B2DBD" stroke-width="3"/>
      <line x1="482" y1="30" x2="482" y2="80" stroke="#4B2DBD" stroke-width="3"/>
      <line x1="30" y1="482" x2="80" y2="482" stroke="#4B2DBD" stroke-width="3"/>
      <line x1="30" y1="482" x2="30" y2="432" stroke="#4B2DBD" stroke-width="3"/>
      <line x1="482" y1="482" x2="432" y2="482" stroke="#4B2DBD" stroke-width="3"/>
      <line x1="482" y1="482" x2="482" y2="432" stroke="#4B2DBD" stroke-width="3"/>
    </svg>
  `

  const svgBuffer = Buffer.from(svgIcon)

  for (const size of sizes) {
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(path.join(iconsDir, `icon-${size}x${size}.png`))
    console.log(`Generated ${size}x${size} icon`)
  }

  console.log('All icons generated successfully')
}

generateIcons().catch(console.error)
