#!/usr/bin/env node
// Run this once to generate PNG icons from SVG
// node generate-icons.js
// Requires: npm install -g sharp  (or use any SVG→PNG converter)

import { createCanvas } from 'canvas'; // npm install canvas
import { writeFileSync } from 'fs';

function drawIcon(size, maskable = false) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  const pad = maskable ? size * 0.1 : 0;

  // Background
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, size, size);

  // Orange circle
  ctx.fillStyle = '#e05c2a';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, (size / 2) - pad, 0, Math.PI * 2);
  ctx.fill();

  // H letter
  const scale = (size - pad * 2) / 512;
  ctx.fillStyle = 'white';
  ctx.save();
  ctx.translate(pad, pad);
  ctx.scale(scale, scale);

  // Left bar
  ctx.fillRect(130, 130, 70, 252);
  // Right bar
  ctx.fillRect(312, 130, 70, 252);
  // Middle bar
  ctx.fillRect(130, 221, 252, 70);

  ctx.restore();

  return canvas.toBuffer('image/png');
}

writeFileSync('icon-192.png', drawIcon(192));
writeFileSync('icon-512.png', drawIcon(512));
writeFileSync('icon-512-maskable.png', drawIcon(512, true));

console.log('Icons generated!');
