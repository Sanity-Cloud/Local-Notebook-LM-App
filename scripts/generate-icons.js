const fs = require('fs');
const path = require('path');

// Create a simple SVG icon
const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#3b82f6;stop-opacity:1" />
      <stop offset="50%" style="stop-color:#8b5cf6;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#ec4899;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" rx="200" fill="url(#grad)"/>
  <g transform="translate(512, 512)" fill="white">
    <path d="M-150,-50 L-150,50 L-50,50 L-50,150 L50,150 L50,50 L150,50 L150,-50 L50,-50 L50,-150 L-50,-150 L-50,-50 Z" transform="scale(0.6)"/>
    <circle cx="0" cy="0" r="80" fill="none" stroke="white" stroke-width="40"/>
  </g>
</svg>`;

const buildDir = path.join(__dirname, '..', 'build');

// Ensure build directory exists
if (!fs.existsSync(buildDir)) {
  fs.mkdirSync(buildDir, { recursive: true });
}

// Write SVG
fs.writeFileSync(path.join(buildDir, 'icon.svg'), svgIcon);

console.log('Icon files would need to be converted to .icns format for macOS');
console.log('For now, the app will use the default Electron icon or you can manually create icon.icns');
console.log('SVG icon saved to build/icon.svg');
