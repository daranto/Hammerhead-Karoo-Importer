# PWA Icons

The icon SVG is at `icon.svg`. Convert to PNG before building:

```bash
# Using Inkscape:
inkscape icon.svg -w 192 -h 192 -o icon-192.png
inkscape icon.svg -w 512 -h 512 -o icon-512.png
cp icon-512.png icon-512-maskable.png

# Using ImageMagick:
convert icon.svg -resize 192x192 icon-192.png
convert icon.svg -resize 512x512 icon-512.png
cp icon-512.png icon-512-maskable.png

# Or use the generate-icons.js script (requires npm install canvas)
```
