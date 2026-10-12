/**
 * Static CSS + inline navigation script embedded in every HTML export.
 *
 * The app's own CSS (themes, CSS modules, [data-slide-container] scaling) is
 * collected separately; the rules here only provide the deck chrome and a
 * zero-specificity fallback so the deck still renders if collection fails.
 */

/**
 * Container-relative sizes applied to every slide (mirrors the app's
 * [data-slide-container] rules in global.css: 1000px wide ≈ nominal px).
 */
export const SLIDE_SCALE_CQW: Record<string, number> = {
  '--font-size-xs': 1.6, '--font-size-sm': 1.8, '--font-size-base': 2, '--font-size-lg': 2.2,
  '--font-size-xl': 2.6, '--font-size-2xl': 3, '--font-size-3xl': 3.6, '--font-size-4xl': 4.2,
  '--font-size-5xl': 5.4,
  '--space-xs': 0.4, '--space-sm': 0.8, '--space-md': 1.6, '--space-lg': 2.4, '--space-xl': 3.2,
  '--space-2xl': 4.8, '--space-3xl': 6.4,
};

export function buildRuntimeCss(ratio: { w: number; h: number }): string {
  const { w, h } = ratio;
  return `
/* ---- fallback element styles (zero specificity; app CSS wins) ---- */
:where(.xel) :where(h1,h2,h3,h4,h5,h6){font-family:var(--font-heading);font-weight:600;margin:0;line-height:1.2;color:var(--color-text-primary)}
:where(.xel) :where(h1){font-size:var(--font-size-5xl);font-weight:700}
:where(.xel) :where(h2){font-size:var(--font-size-3xl)}
:where(.xel) :where(h3){font-size:var(--font-size-2xl)}
:where(.xel) :where(h4){font-size:var(--font-size-xl)}
:where(.xel) :where(h5){font-size:var(--font-size-lg)}
:where(.xel) :where(h6){font-size:var(--font-size-base);text-transform:uppercase;letter-spacing:.05em}
:where(.xel[data-element-type=text]),:where(.xel[data-element-type=list]),:where(.xel[data-element-type=html]){font-family:var(--font-body);font-size:var(--font-size-xl);line-height:1.6}
:where(.xel[data-element-type=text]) :where(p){margin:0 0 .5em}
:where(.xel[data-element-type=list]) :where(ul,ol){margin:0;padding-left:var(--space-xl);line-height:1.8}
:where(.xel[data-element-type=image]) :where(img){width:100%;height:100%;object-fit:contain}
:where(.xel[data-element-type=image]) :where(img[data-fit=cover]){object-fit:cover}
:where(.xel[data-element-type=video]) :where(video,iframe){width:100%;height:100%;border:0}
:where(.xel[data-element-type=code]) > :where(div){width:100%;height:100%;overflow:hidden;border-radius:var(--radius-md)}
:where(.xel[data-element-type=html]) > :where(div){width:100%;height:100%;overflow:hidden}

/* ---- deck chrome ---- */
html,body{margin:0;padding:0;height:100%;overflow:hidden}
html body.xdeck{background:#000;color:#fff}
.xstage{position:absolute;inset:0;margin:auto;overflow:hidden;
  width:min(100vw,calc(100vh * ${w} / ${h}));height:min(100vh,calc(100vw * ${h} / ${w}))}
.xslide{position:absolute;inset:0;display:none;overflow:hidden;box-sizing:border-box;
  background:var(--slide-bg,var(--color-bg-primary));color:var(--color-text-primary);
  container-type:inline-size;
  ${Object.entries(SLIDE_SCALE_CQW).map(([k, v]) => `${k}:${v}cqw`).join(';')}}
.xslide.active{display:block}
.xcontainer{position:relative;width:100%;height:100%;box-sizing:border-box}
.xel{position:absolute;box-sizing:border-box}
.xempty{display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-family:var(--font-body);font-size:var(--font-size-2xl);color:var(--color-text-secondary);font-style:italic}
[data-fragment]{transition:opacity .3s ease}
.xf-hidden{opacity:0!important;pointer-events:none!important}
.xui{position:fixed;bottom:16px;right:16px;z-index:1000;background:rgba(0,0,0,.6);color:#fff;
  font:13px/1.2 system-ui,-apple-system,'Segoe UI',sans-serif;padding:8px 12px;border-radius:8px;opacity:.35;transition:opacity .2s}
.xui:hover{opacity:1}
.xnotes{position:fixed;left:0;right:0;bottom:0;max-height:35vh;overflow:auto;z-index:1001;display:none;
  background:rgba(15,15,20,.94);color:#f4f4f5;font:16px/1.5 system-ui,-apple-system,'Segoe UI',sans-serif;
  padding:16px 24px;white-space:pre-wrap;border-top:1px solid #333}
.xnotes.open{display:block}
.xnotes-empty{opacity:.5;font-style:italic}
`;
}

/** CSS applied only when JavaScript is disabled: show every slide stacked. */
export function buildNoScriptCss(ratio: { w: number; h: number }): string {
  return `html,body{overflow:auto!important;height:auto!important}
.xstage{position:static!important;width:auto!important;height:auto!important;max-width:1200px;margin:0 auto!important}
.xslide{display:block!important;position:relative!important;width:100%;aspect-ratio:${ratio.w}/${ratio.h};margin:0 0 16px}
.xui{display:none}`;
}

/**
 * Inline navigation runtime. All lookups use ids carrying a per-export random
 * token (`<token>-data|stage|counter|notes`); exported content ids are
 * prefixed with `xc-`, so slide content can never hijack them.
 */
export function buildRuntimeScript(token: string): string {
  return RUNTIME_TEMPLATE.replace('__TOKEN__', JSON.stringify(token));
}

const RUNTIME_TEMPLATE = `(function(){
'use strict';
var T=__TOKEN__;
function byId(s){return document.getElementById(T+'-'+s);}
var dataEl=byId('data'),stage=byId('stage');
var cfg=JSON.parse((dataEl&&dataEl.textContent)||'{}');
var slides=stage?Array.prototype.filter.call(stage.children,function(c){return c.tagName==='SECTION';}):[];
var total=slides.length,cur=0,frag=0;
var counter=byId('counter');
var notes=byId('notes');
// html-element iframes: splice in their @font-face CSS from the shared pool
(function(){
  var fe=byId('fonts'),pool;
  try{pool=JSON.parse((fe&&fe.textContent)||'[]');}catch(e){pool=[];}
  if(!pool.length||!stage)return;
  Array.prototype.forEach.call(stage.querySelectorAll('.xel[data-element-type=html] iframe[data-xfonts]'),function(f){
    var css=f.getAttribute('data-xfonts').split(' ').map(function(i){return pool[i|0]||'';}).join('');
    var doc=f.getAttribute('srcdoc');
    if(doc&&css)f.setAttribute('srcdoc',doc.replace('/*xfonts*/',function(){return css;}));
  });
})();
var INTERACTIVE='a,button,input,textarea,select,label,video,audio,iframe,object,embed,summary,details,[contenteditable],[tabindex],[data-no-nav],.xui,.xnotes';
function maxFrag(i){return (cfg.fragments&&cfg.fragments[i])|0;}
function stopMedia(s){
  Array.prototype.forEach.call(s.querySelectorAll('video,audio'),function(v){try{v.pause();}catch(e){}});
  Array.prototype.forEach.call(s.querySelectorAll('iframe[data-video]'),function(f){var u=f.getAttribute('src');f.setAttribute('src',u);});
}
// Shrink code text to fit its box (mirrors fitCodeToBox in src/lib/code/fitCode.ts)
function fitCode(s){
  function q(a,b){var r=a/b;return isFinite(r)&&r>0?r:1;}
  Array.prototype.forEach.call(s.querySelectorAll('.xel[data-element-type=code] > div'),function(b){
    var p=b.querySelector('pre');
    if(!p||!b.clientWidth||!b.clientHeight)return;
    var c=getComputedStyle(p);
    var px=(parseFloat(c.paddingLeft)+parseFloat(c.paddingRight))||0,py=(parseFloat(c.paddingTop)+parseFloat(c.paddingBottom))||0;
    function m(k){
      b.style.setProperty('--code-scale',String(k));
      var r=Math.min(1,q(p.clientWidth-px,p.scrollWidth-px),q(p.clientHeight-py,p.scrollHeight-py));
      return r<1?Math.floor(r*990)/1000:1;
    }
    var k=1;
    for(var i=0;i<5;i++){var r=m(k);if(r>=1)return;k=Math.max(0.1,Math.floor(k*r*1000)/1000);if(k===0.1)break;}
    b.style.setProperty('--code-scale',String(k));
  });
}
function render(prev){
  slides.forEach(function(s,i){
    var on=i===cur;
    s.classList.toggle('active',on);
    s.setAttribute('aria-hidden',on?'false':'true');
    if(!on&&i===prev)stopMedia(s);
  });
  if(!total)return;
  fitCode(slides[cur]);
  Array.prototype.forEach.call(slides[cur].querySelectorAll('[data-fragment]'),function(n){
    n.classList.toggle('xf-hidden',parseInt(n.getAttribute('data-fragment'),10)>frag);
  });
  if(counter)counter.textContent=(cur+1)+' / '+total;
  if(notes){
    var t=(cfg.notes&&cfg.notes[cur])||'';
    notes.textContent=t||'No speaker notes for this slide.';
    notes.classList.toggle('xnotes-empty',!t);
  }
  var h='#'+(cur+1);
  if(location.hash!==h){try{history.replaceState(null,'',h);}catch(e){}}
}
function go(i,f){
  if(!total)return;
  var prev=cur;
  cur=Math.max(0,Math.min(total-1,i));
  frag=f==='end'?maxFrag(cur):Math.max(0,Math.min(maxFrag(cur),f|0));
  render(prev);
}
function next(){if(frag<maxFrag(cur)){frag++;render(cur);}else if(cur<total-1){go(cur+1,0);}}
function prev(){if(frag>0){frag--;render(cur);}else if(cur>0){go(cur-1,'end');}}
function hashIndex(){
  var m=/^#(\\d+)$/.exec(location.hash);
  return m?parseInt(m[1],10)-1:-1;
}
function onHash(){var i=hashIndex();if(i>=0&&(i!==cur||frag!==0))go(i,0);}
function toggleFullscreen(){
  var d=document,el=d.documentElement;
  if(d.fullscreenElement||d.webkitFullscreenElement){(d.exitFullscreen||d.webkitExitFullscreen).call(d);}
  else{var r=el.requestFullscreen||el.webkitRequestFullscreen;if(r)r.call(el);}
}
function isInteractive(t){return !!(t&&t.closest&&t.closest(INTERACTIVE));}
document.addEventListener('keydown',function(e){
  if(e.ctrlKey||e.metaKey||e.altKey)return;
  if(isInteractive(e.target)&&e.target!==document.body)return;
  switch(e.key){
    case 'ArrowRight':case 'ArrowDown':case 'PageDown':case 'Enter':
      e.preventDefault();next();break;
    case ' ':case 'Spacebar':
      e.preventDefault();if(e.shiftKey)prev();else next();break;
    case 'ArrowLeft':case 'ArrowUp':case 'PageUp':case 'Backspace':
      e.preventDefault();prev();break;
    case 'Home':e.preventDefault();go(0,0);break;
    case 'End':e.preventDefault();go(total-1,'end');break;
    case 'f':case 'F':e.preventDefault();toggleFullscreen();break;
    case 'n':case 'N':if(notes){e.preventDefault();notes.classList.toggle('open');}break;
  }
});
var lastSwipe=0;
document.addEventListener('click',function(e){
  if(e.button!==0||Date.now()-lastSwipe<500)return;
  if(isInteractive(e.target))return;
  var sel=window.getSelection&&window.getSelection();
  if(sel&&String(sel).length)return;
  if(e.clientX<window.innerWidth/3)prev();else next();
});
var tx=0,ty=0,tracking=false;
document.addEventListener('touchstart',function(e){
  if(e.touches.length!==1||isInteractive(e.target)){tracking=false;return;}
  tracking=true;tx=e.touches[0].clientX;ty=e.touches[0].clientY;
},{passive:true});
document.addEventListener('touchend',function(e){
  if(!tracking)return;tracking=false;
  var t=e.changedTouches[0],dx=t.clientX-tx,dy=t.clientY-ty;
  if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)*1.5){lastSwipe=Date.now();if(dx<0)next();else prev();}
},{passive:true});
window.addEventListener('hashchange',onHash);
// Refit once fonts arrive: a font only starts loading when text first uses it
if(document.fonts&&document.fonts.addEventListener)document.fonts.addEventListener('loadingdone',function(){if(total)fitCode(slides[cur]);});
go(Math.max(0,hashIndex()),0); // always render once so fragments/notes/aria are initialised
})();`;
