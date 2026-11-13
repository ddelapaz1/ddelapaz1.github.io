// Converteix un SVG de la pàgina en una imatge PNG amb els estils calculats incrustats.

const PROPS = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'stroke-linecap',
  'stroke-linejoin', 'opacity', 'font-size', 'font-weight', 'font-family', 'text-anchor', 'paint-order', 'display', 'visibility'];

export async function svgToPng(svg, widthPx = 1600, background = '#ffffff') {
  const vb = svg.viewBox.baseVal;
  const vw = vb && vb.width ? vb.width : svg.clientWidth;
  const vh = vb && vb.height ? vb.height : svg.clientHeight;
  const clone = svg.cloneNode(true);
  const src = [svg, ...svg.querySelectorAll('*')];
  const dst = [clone, ...clone.querySelectorAll('*')];
  src.forEach((el, i) => {
    const cs = getComputedStyle(el);
    let st = '';
    for (const p of PROPS) {
      const v = cs.getPropertyValue(p);
      if (v) st += `${p}:${v};`;
    }
    const own = el.getAttribute('style') || '';
    dst[i].setAttribute('style', st + own);
  });
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', vw);
  clone.setAttribute('height', vh);
  clone.removeAttribute('class');
  const xml = new XMLSerializer().serializeToString(clone);
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  await img.decode();
  const scale = widthPx / vw;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(vw * scale);
  canvas.height = Math.round(vh * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { data: canvas.toDataURL('image/png'), w: vw, h: vh };
}
