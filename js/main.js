// main.js — tab switching. Each tab module exposes render(); canvases are
// re-drawn when their tab becomes visible (hidden canvases have zero width).
const TABS = { t1: Tab1, t2: Tab2, t3: Tab3 };
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === btn.dataset.tab));
    TABS[btn.dataset.tab].render();
  });
});
