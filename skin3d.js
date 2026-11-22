// Visor 3D de skins con CSS 3D (sin dependencias): capa base + capa externa, modelo Steve (CLASSIC) o Alex (SLIM).
const Skin = (() => {
  const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('skin no válida')); i.src = src; });
  async function head(src, px = 64) {
    const img = await loadImg(src), c = document.createElement('canvas'); c.width = c.height = px; const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
    x.drawImage(img, 8, 8, 8, 8, 0, 0, px, px); x.drawImage(img, 40, 8, 8, 8, 0, 0, px, px); return c.toDataURL();
  }
  const box = (u, v, w, h, d) => ({ top: [u + d, v, w, d], bottom: [u + d + w, v, w, d], right: [u, v + d, d, h], front: [u + d, v + d, w, h], left: [u + d + w, v + d, d, h], back: [u + d + w + d, v + d, w, h] });
  const parts = (slim, legacy) => { const aw = slim ? 3 : 4; return [
    { s: [8, 8, 8], uv: [0, 0], ov: [32, 0], c: [0, -12] }, { s: [8, 12, 4], uv: [16, 16], ov: legacy ? null : [16, 32], c: [0, -2] },
    { s: [aw, 12, 4], uv: [40, 16], ov: legacy ? null : [40, 32], c: [-(4 + aw / 2), -2] }, { s: [aw, 12, 4], uv: legacy ? [40, 16] : [32, 48], ov: legacy ? null : [48, 48], c: [4 + aw / 2, -2] },
    { s: [4, 12, 4], uv: [0, 16], ov: legacy ? null : [0, 32], c: [-2, 10] }, { s: [4, 12, 4], uv: legacy ? [0, 16] : [16, 48], ov: legacy ? null : [0, 48], c: [2, 10] }]; };
  function face(img, r, fw, fh, tx) {
    const c = document.createElement('canvas'); c.width = r[2]; c.height = r[3]; c.getContext('2d').drawImage(img, r[0], r[1], r[2], r[3], 0, 0, r[2], r[3]);
    const d = document.createElement('div'); d.className = 'f'; d.style.cssText = `width:${fw}px;height:${fh}px;left:${-fw / 2}px;top:${-fh / 2}px;transform:${tx};background-image:url(${c.toDataURL()})`; return d;
  }
  async function mount(el, src, variant) {
    const img = await loadImg(src), k = 6, slim = variant === 'SLIM', legacy = img.height < 64;
    el.innerHTML = ''; const sc = document.createElement('div'), md = document.createElement('div'); sc.className = 'sc'; md.className = 'md'; sc.appendChild(md);
    for (const p of parts(slim, legacy)) for (const layer of [0, 1]) {
      const uv = layer ? p.ov : p.uv; if (!uv) continue; const inf = layer ? 1 : 0, [w, h, d] = p.s, W = (w + inf) * k, H = (h + inf) * k, D = (d + inf) * k, r = box(uv[0], uv[1], w, h, d);
      const pe = document.createElement('div'); pe.className = 'pt'; pe.style.transform = `translate3d(${p.c[0] * k}px,${p.c[1] * k}px,0)`;
      pe.append(face(img, r.front, W, H, `translateZ(${D / 2}px)`), face(img, r.back, W, H, `rotateY(180deg) translateZ(${D / 2}px)`),
        face(img, r.right, D, H, `rotateY(-90deg) translateZ(${W / 2}px)`), face(img, r.left, D, H, `rotateY(90deg) translateZ(${W / 2}px)`),
        face(img, r.top, W, D, `rotateX(90deg) translateZ(${H / 2}px)`), face(img, r.bottom, W, D, `rotateX(-90deg) translateZ(${H / 2}px)`));
      md.appendChild(pe);
    }
    let ang = -28, drag = null;   // arrastrar para girar
    sc.addEventListener('pointerdown', e => { drag = e.clientX; md.style.animation = 'none'; sc.setPointerCapture(e.pointerId); });
    sc.addEventListener('pointermove', e => { if (drag == null) return; ang += (e.clientX - drag) * .8; drag = e.clientX; md.style.transform = `rotateX(-9deg) rotateY(${ang}deg)`; });
    sc.addEventListener('pointerup', () => { drag = null; });
    el.appendChild(sc); return md;
  }
  return { head, mount };
})();
