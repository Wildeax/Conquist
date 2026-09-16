import { writeFile } from 'node:fs/promises';

const version = process.argv[2] || 'v02';
if (!['v02', 'v03'].includes(version)) throw new Error('Choose v02 or v03');
const ground = version === 'v03';
const prefix = ground ? 'ground' : 'textured';
const groundDescriptions = {
  Stone: 'Suelo rocoso fracturado, grava encajada y cantos erosionados.',
  Clay: 'Terrones con volumen y separaciones hundidas; laterales de tierra erosionada.',
  Grain: 'Tierra removida entre surcos, pequeños terrones y caminos compactados.',
  Desert: 'Ondulaciones de arena modeladas y depósitos de grava en las zonas bajas.',
  Timber: 'Suelo irregular bajo el bosque, pequeñas depresiones y tierra granulada.',
};

const tiles = [
  ['Montaña', 'Stone', 'stone-relief', 'relief-v01', 'Fragmentos de roca, fisuras y grano mineral.'],
  ['Arcilla', 'Clay', 'clay-relief', 'clay-relief-v01', 'Terrones, grietas finas y tierra erosionada.'],
  ['Trigo', 'Grain', 'wheat-fields', 'wheat-fields-v01', 'Gavillas atadas, paja suelta y tejido del espantapájaros.'],
  ['Desierto', 'Desert', 'desert-relief', 'desert-relief-v01', 'Piedras erosionadas, matorral seco y arena fina.'],
  ['Bosque', 'Timber', 'forest', 'forest-v01', 'Helechos, hojarasca, hongos, corteza y nervaduras de las hojas.'],
];
const cards = tiles.map(([title, kind, stem, original, description]) => {
  const before = ground ? `${stem}-v02/textured-perspective.png` : `${original}/relief-perspective.png`;
  return `
<article>
  <div class="card-title"><h2>${title}</h2><span>${kind}</span></div>
  <a href="${stem}-${version}/${prefix}-perspective.png" class="preview" aria-label="Ampliar ${title}">
    <img loading="lazy" src="${stem}-${version}/${prefix}-perspective.png"
      data-before="${before}" data-after="${stem}-${version}/${prefix}-perspective.png"
      alt="${title}: versión detallada con texturas">
  </a>
  <p>${ground ? groundDescriptions[kind] : description}</p>
  <nav aria-label="Archivos de ${title}">
    <a href="${stem}-${version}/${prefix}-detail.png">Ver de cerca ↗</a>
    <a href="${stem}-${version}/${stem}-${version}.blend">Blender</a>
    <a href="${stem}-${version}/${stem}-${version}.glb">GLB</a>
  </nav>
</article>`; }).join('');
const html = `<!doctype html>
<html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Conquist · Terrenos ${version}</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#141914;color:#e7e8de;font:16px/1.6 system-ui,sans-serif}
main{max-width:1320px;margin:auto;padding:48px 28px}header{max-width:820px;margin-bottom:30px}
.eyebrow{color:#b9c68c;text-transform:uppercase;letter-spacing:.15em;font-size:12px}
h1{font:500 clamp(30px,5vw,52px)/1.15 Georgia,serif;margin:12px 0 20px}header p{color:#b7c0b0}
.controls{position:sticky;top:0;padding:16px 0;background:#141914ed;backdrop-filter:blur(12px);z-index:1;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
button{border:1px solid #526047;border-radius:6px;background:transparent;color:#dfe5d5;padding:10px 16px;font:inherit;cursor:pointer}
button[aria-pressed=true]{background:#c2d394;color:#1c2914;border-color:#c2d394}
.status{color:#abb8a0;margin-left:8px;font-size:14px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}
article{background:#1e261e;border:1px solid #344032;border-radius:12px;overflow:hidden}.card-title{display:flex;align-items:center;justify-content:space-between;padding:16px 22px}
h2{font:500 26px Georgia,serif;margin:0}.card-title span{font-size:12px;color:#a7b99a}
.preview{display:block;background:#b5b5b5}.preview img{width:100%;display:block;aspect-ratio:7/6;object-fit:contain}
article p{padding:0 22px;color:#c0cbb7;min-height:52px}nav{padding:0 22px 22px;display:flex;gap:22px;flex-wrap:wrap}
a{color:#d2e3a7;text-underline-offset:4px}footer{color:#99a891;font-size:14px;padding-top:30px}
@media(max-width:700px){main{padding:28px 16px}.grid{grid-template-columns:1fr}.status{width:100%;margin:0}}
</style>
<main><header><div class="eyebrow">Conquist · Revisión de arte ${version}</div>
<h1>${ground ? 'El suelo toma volumen.' : 'Más cerca del terreno.'}</h1>
<p>${ground ? 'Terrones, hendiduras y grano modelados en la superficie del hexágono. Compara con el suelo anterior y abre las vistas cercanas para revisar el relieve.' : 'Segunda pasada de detalle y primeras texturas de los cinco terrenos. Cambia entre versiones para comparar las formas aprobadas con el acabado nuevo.'}</p></header>
<div class="controls" aria-label="Versión de las vistas"><button data-mode="before" aria-pressed="false">${ground ? 'Suelo anterior' : 'Original'}</button>
<button data-mode="after" aria-pressed="true">${ground ? 'Suelo con relieve' : 'Detalle + texturas'}</button><span class="status" aria-live="polite">Mostrando ${version}</span></div>
<section class="grid">${cards}</section>
<footer>Modelos de revisión. Las texturas están incluidas en los archivos Blender y GLB. La optimización y la integración al tablero jugable quedan para la siguiente etapa.</footer></main>
<script>
document.querySelectorAll('button[data-mode]').forEach(button=>button.addEventListener('click',()=>{
 const mode=button.dataset.mode;
 document.querySelectorAll('.preview img').forEach(img=>{img.src=img.dataset[mode];img.parentElement.href=img.src;img.alt=img.alt.split(':')[0]+': '+(mode==='before'?'versión original':'detalle y texturas');});
 document.querySelectorAll('button[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
 document.querySelector('.status').textContent=mode==='before'?'Mostrando versión anterior':'Mostrando ${version}';
}));
</script></html>`;
await writeFile(new URL(`./output/review-${version}.html`, import.meta.url), html, 'utf8');
console.log(`Created art/blender/output/review-${version}.html`);
