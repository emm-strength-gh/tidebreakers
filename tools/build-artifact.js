// Bundles the game into one self-contained page for a claude.ai artifact:
// CSS and all game scripts inlined, no service worker, no <html>/<head>/<body>
// wrapper (the artifact host adds its own). Three.js still loads from jsDelivr.
// Usage: node tools/build-artifact.js   → dist/tidebreakers.html
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

const html = read('index.html');
const head = html.slice(html.indexOf('<head>'), html.indexOf('</head>'));
let body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));

const fonts = head.match(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]+>/)[0];
const importmap = head.match(/<script type="importmap">[\s\S]*?<\/script>/)[0];

// the artifact has no arcade page to go back to
body = body.replace(/\s*<a class="ghost sk-button" href="\.\.\/index\.html">All games<\/a>/, '');

// inline every game script
body = body.replace(/<script src="(js\/[\w-]+\.js)"><\/script>/g, (m, file) => {
  const src = read(file);
  if (/<\/script/i.test(src)) throw new Error(file + ' contains </script>');
  return `<script>/* ${file} */\n${src}\n</script>`;
});
if (/<script src=/.test(body)) throw new Error('an external script was not inlined');

const css = read('style.css');
const out = [
  '<title>Tidebreakers</title>',
  '<meta name="claude:viewport-fit-sides" content="cover">',
  '<meta name="description" content="Build a floating town from the ruins of a drowned world.">',
  '<link rel="preconnect" href="https://fonts.googleapis.com">',
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
  fonts,
  `<style>\n${css}\n</style>`,
  importmap,
  '<script>window.TB_ARTIFACT = true;</script>',
  body.trim(),
].join('\n');

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const file = path.join(root, 'dist', 'tidebreakers.html');
fs.writeFileSync(file, out);
console.log('wrote', file, (out.length / 1024).toFixed(0) + ' KB');
