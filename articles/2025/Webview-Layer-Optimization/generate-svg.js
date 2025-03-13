const fs = require('fs');

const IMAGE_WIDTH = 480;
const IMAGE_HEIGHT = 480;

// 生成随机贝塞尔曲线
function generateBezierCurves(count, points) {
  let paths = [];
  for (let i = 0; i < count; i++) {
    let d = `M${Math.random() * IMAGE_WIDTH} ${Math.random() * IMAGE_HEIGHT}`;
    for (let j = 0; j < points; j++) {
      d += `C${Math.random() * IMAGE_WIDTH} ${Math.random() * IMAGE_HEIGHT},
             ${Math.random() * IMAGE_WIDTH} ${Math.random() * IMAGE_HEIGHT},
             ${Math.random() * IMAGE_WIDTH} ${Math.random() * IMAGE_HEIGHT}`;
    }
    paths.push(`<path d="${d}" stroke="url(#grad1)"/>`);
  }
  return paths.join('\n');
}

// 生成交叉网格
function generateGrid(count) {
  let grid = [];
  for (let i = 0; i < count; i++) {
    grid.push(
      `<path d="M0 ${i * 4} L${IMAGE_WIDTH} ${i * 4}" stroke="hsl(${i % 360}, 80%, 50%)"/>`,
      `<path d="M${i * 4} 0 L${i * 4} ${IMAGE_HEIGHT}" stroke="hsl(${(i + 180) % 360}, 80%, 50%)"/>`
    );
  }
  return grid.join('\n');
}

// 生成模糊效果
function generateBlur(count) {
  return Array(count).fill().map(() =>
    `<circle cx="${Math.random() * IMAGE_WIDTH}" 
            cy="${Math.random() * IMAGE_HEIGHT}"
            r="${Math.random() * 200}"
            fill="none"
            stroke="url(#grad2)"
            stroke-width="${Math.random() * 3}"/>`
  ).join('\n');
}

// 生成分形图案
function generateFractal(maxDepth) {
  let paths = [];
  function drawBranch(x, y, size, angle, depth) {
    if (depth > maxDepth) return;
    paths.push(
      `<path d="M${x} ${y} l${size * Math.cos(angle)} ${size * Math.sin(angle)}" 
       stroke="hsl(${depth * 40},70%,50%)"/>`
    );
    [-Math.PI / 4, 0, Math.PI / 4].forEach(a => {
      drawBranch(
        x + size * Math.cos(angle),
        y + size * Math.sin(angle),
        size * 0.8,
        angle + a,
        depth + 1
      );
    });
  }
  drawBranch(0, 0, 100, 0, 0);
  return paths.join('\n');
}

// 构建完整SVG
const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="0 0 ${IMAGE_WIDTH / 16} ${IMAGE_HEIGHT / 16}"
     width="${IMAGE_WIDTH}" height="${IMAGE_HEIGHT}">
  <filter id="noise">
    <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="10"/>
    <feDisplacementMap in="SourceGraphic" scale="25"/>
  </filter>

  <linearGradient id="grad1" gradientTransform="rotate(45)">
    <stop offset="0%" stop-color="#000"/>
    <stop offset="100%" stop-color="#fff"/>
  </linearGradient>

  <radialGradient id="grad2">
    <stop offset="0%" stop-color="#f00" stop-opacity="0.8"/>
    <stop offset="100%" stop-color="#00f" stop-opacity="0.2"/>
  </radialGradient>

  <g filter="url(#noise)" opacity="0.9">
    <g stroke-width="0.3" stroke-opacity="0.1">
      ${generateBezierCurves(60, 30)}
    </g>

    <g transform="scale(2)" opacity="0.7">
      ${generateGrid(100)}
    </g>

    <g filter="blur(5)">
      ${generateBlur(100)}
    </g>

    <g transform="translate(960 540)">
      ${generateFractal(6)}
    </g>
  </g>

  <rect width="100%" height="100%" filter="url(#noise)" opacity="0.3"/>
</svg>`;

// 保存文件
fs.writeFileSync('complicated.svg', svgContent);
console.log('已生成 complicated.svg');
