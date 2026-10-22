import{f as e,h as t,i as n,l as r,s as i}from"./index-D9ZTC7Vx.js";import{Dt as a,N as o,O as s,S as c,_ as l,d as u,dt as d,gt as f,h as p,n as m,o as h,t as g,x as _}from"./pageArt-WvmTrlxb.js";var v=t(e(),1),y=`
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vNormal;
void main() {
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`,b=`
uniform sampler2D uInk;
uniform float uInkAlpha;
uniform float uFlipU;
uniform float uSeed;
uniform vec2 uGrid;
uniform float uGutter;
uniform float uShadowEdge;
uniform float uShadowAmt;
uniform float uShadowSide;
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vNormal;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 17.0; a *= 0.5; }
  return v;
}
float bayer4(vec2 c) {
  vec2 m = mod(c, 4.0);
  float x = m.x, y = m.y;
  float b = mod(x, 2.0) * 2.0 + mod(y, 2.0) * 3.0 - 4.0 * mod(x, 2.0) * mod(y, 2.0);
  float hi = floor(x / 2.0) * 2.0 + floor(y / 2.0) * 3.0 - 4.0 * floor(x / 2.0) * floor(y / 2.0);
  return (b * 4.0 + hi + 0.5) / 16.0;
}

void main() {
  vec2 uv = vUv;
  if (uFlipU > 0.5) uv.x = 1.0 - uv.x;
  vec2 cell = floor(uv * uGrid);
  vec2 q = (cell + 0.5) / uGrid;
  vec2 p = vec2(q.x, (1.0 - q.y) * 1.44) + uSeed * 3.17;

  // fundo: pergaminho com variação larga de tom
  float n1 = fbm(p * 2.6);
  float n2 = fbm(p * 8.0 + 5.0);
  vec3 col = mix(vec3(0.905, 0.845, 0.700), vec3(0.830, 0.735, 0.540), smoothstep(0.30, 0.85, n1));
  // manchas de umidade com a borda mais escura (marca de água seca)
  float st = fbm(p * 1.7 + 11.0);
  float stain = smoothstep(0.60, 0.68, st);
  float rim = smoothstep(0.585, 0.615, st) * (1.0 - smoothstep(0.62, 0.66, st));
  col = mix(col, col * vec3(0.88, 0.80, 0.64), stain * 0.38);
  col *= 1.0 - rim * 0.09;
  // pontinhos de ferrugem do papel velho
  float fox = smoothstep(0.80, 0.86, noise(p * 34.0)) * smoothstep(0.35, 0.75, n2);
  col = mix(col, vec3(0.62, 0.45, 0.28), fox * 0.45);
  // fibras na direção do papel e grão miúdo
  col *= 0.965 + 0.05 * noise(vec2(p.x * 3.0, p.y * 70.0));
  col *= 0.975 + 0.045 * hash(cell + uSeed);
  // bordas gastas, mais escuras e irregulares
  float e = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y) * 1.44);
  float edge = 1.0 - smoothstep(0.0, 0.075, e + (n2 - 0.5) * 0.05);
  col = mix(col, vec3(0.46, 0.33, 0.19), edge * 0.62);
  // sombra da lombada
  if (uGutter != 0.0) {
    float g = uGutter > 0.0 ? uv.x : 1.0 - uv.x;
    col *= 0.72 + 0.28 * smoothstep(0.0, 0.14, g);
  }

  // tinta, um pouco desbotada onde o papel é mais gasto
  vec4 ink = texture2D(uInk, uv) * uInkAlpha;
  float fade = 0.86 + 0.14 * n2;
  col = col * (1.0 - ink.a) + ink.rgb * fade + col * ink.a * (1.0 - fade) * 0.5;

  // luz: o papel curvado fica mais claro ou mais escuro conforme a onda
  vec3 N = normalize(vNormal) * (gl_FrontFacing ? 1.0 : -1.0);
  vec3 L = normalize(vec3(-0.35, 1.0, -0.45));
  float diff = max(dot(N, L), 0.0);
  float light = 0.58 + 0.45 * diff;
  vec3 V = normalize(cameraPosition - vWorld);
  float sheen = pow(max(dot(reflect(-L, N), V), 0.0), 18.0) * 0.06;

  // sombra da folha que vira
  float d = (vWorld.x - uShadowEdge) * uShadowSide;
  float sh = uShadowAmt * (d < 0.0 ? 0.6 : exp(-d * d / 0.03));

  col = col * light * (1.0 - sh) + sheen;
  // poucos tons, com pontilhado, como o resto do quarto
  float levels = 28.0;
  col = floor(col * levels + bayer4(cell)) / levels;
  gl_FragColor = vec4(col, 1.0);
}
`;function x(e=0){let t={uInk:{value:null},uInkAlpha:{value:1},uFlipU:{value:0},uSeed:{value:0},uGrid:{value:new a(133,192)},uGutter:{value:0},uShadowEdge:{value:0},uShadowAmt:{value:0},uShadowSide:{value:1}};return new f({uniforms:t,vertexShader:y,fragmentShader:b,side:e})}var S=e=>e.uniforms,C=n(),w=1,T=576/400,E=48,D=28,O=24,k=.16;function A(e,t){let n=0,r=0,i=0,a=0;for(let o of[`.topbar`,`.bookbar`]){let s=document.querySelector(o)?.getBoundingClientRect();s&&s.width&&s.height&&(s.width>=s.height?s.top<t/2?n=Math.max(n,s.bottom+6):r=Math.max(r,t-s.top+6):s.left<e/2?i=Math.max(i,s.right+6):a=Math.max(a,e-s.left+6))}return{x:i,y:n,w:Math.max(100,e-i-a),h:Math.max(100,t-n-r)}}function j(){let e=new c,t=1421,n=new _(new Float32Array(t*3),3);n.setUsage(o);let r=new Float32Array(t*2);for(let e=0;e<=D;e++)for(let t=0;t<=E;t++){let n=e*49+t;r[n*2]=t/E,r[n*2+1]=1-e/D}let i=[];for(let e=0;e<D;e++)for(let t=0;t<E;t++){let n=e*49+t,r=n+1,a=n+E+1,o=a+1;i.push(n,a,r,r,a,o)}return e.setAttribute(`position`,n),e.setAttribute(`uv`,new _(r,2)),e.setIndex(i),e}var M=(()=>{let e=new s(new Uint8Array(4),1,1);return e.needsUpdate=!0,e})();function N(e){return!e||e.k===`endpaper`?``:e.k===`toc`?`Índice. `+e.entries.map(e=>`${e.title}, página ${e.page}`).join(`. `):(e.first?e.title+`. `+(e.sub?e.sub+`. `:``):``)+(e.drop?.letter||``)+e.lines.map(e=>e.t).join(` `)}function P({config:e}){let t=(0,v.useSyncExternalStore)(i.subscribe,i.getSnapshot),{size:n,camera:o,gl:s,viewport:c}=l(),u=c.dpr,f=(0,v.useMemo)(()=>new m(e,!0),[]),_=t.single,y=t.pages,b=(0,v.useMemo)(()=>{let e=A(n.width,n.height),t=_?w:2;return{r:e,k:Math.min(e.w*.97/t,e.h*.97/T),cx:_?w/2:0}},[n.width,n.height,_]);(0,v.useEffect)(()=>{let e=o;e.fov=O;let t=n.height/b.k/(2*Math.tan(O*Math.PI/360));e.up.set(0,0,-1),e.position.set(b.cx,t,0),e.lookAt(b.cx,0,0),e.near=t*.3,e.far=t*3;let r=n.width/2-(b.r.x+b.r.w/2),i=n.height/2-(b.r.y+b.r.h/2);e.setViewOffset(n.width,n.height,Math.round(r),Math.round(i),n.width,n.height),e.updateProjectionMatrix()},[o,n.width,n.height,b]);let N=(0,v.useMemo)(()=>{let e=b.k*T*u,t=f.font,n=Math.max(2,Math.round(e/576*t/g))*g/t;return Math.min(n,4096/576)},[b.k,u,f,e.fs]),P=JSON.stringify([e.n,e.p,e.fs,e.bm||[],N]);(0,v.useEffect)(()=>f.set(y,e,N),[f,y,P]);let F=(0,v.useMemo)(()=>{let e=f.font/g;return new a(Math.round(400/e),Math.round(576/e))},[f,P]),I=(0,v.useMemo)(()=>({left:x(),right:x(),front:x(0),back:x(1)}),[]),L=(0,v.useMemo)(()=>j(),[]),R=(0,v.useRef)(null),z=(0,v.useRef)(null),B=(0,v.useRef)(null),V=(0,v.useRef)(0),H=(0,v.useMemo)(()=>({width:w,height:T,cols:E,rows:D,rightHeight:0,leftHeight:0,gutter:.05,ripple:k}),[]),U=i.turn,W=(0,v.useMemo)(()=>{if(_){let e=i.page;if(U?.page){let e=U.dir===1?U.from:U.from-1;return{left:-1,right:U.dir===1?U.from+1:U.from,front:e,back:e,bleed:!0}}return{left:-1,right:e,front:-1,back:-1,bleed:!1}}if(U&&!U.page){let e=U.dir===1?U.from:U.from-1;return{left:r(e)[0],right:r(e+1)[1],front:2*e-1,back:2*e,bleed:!1}}let[e,n]=r(Math.max(1,t.spread));return{left:e,right:n,front:-1,back:-1,bleed:!1}},[_,U,U?.from,U?.dir,t.spread,t.side,t.turning]);(0,v.useEffect)(()=>{let e=e=>e>=0&&e<y.length?f.get(e):M,n=(t,n,r,i=0,a=1)=>{let o=S(t);o.uInk.value=e(n),o.uInkAlpha.value=a,o.uSeed.value=(n+3)*.731,o.uGutter.value=r,o.uFlipU.value=i,o.uGrid.value=F};n(I.left,W.left,-1),n(I.right,W.right,1),W.front>=0&&(n(I.front,W.front,1),W.bleed?n(I.back,W.front,-1,1,.07):n(I.back,W.back,-1,1));let r=_?i.page+1:2*Math.max(1,t.spread);for(let e of[r,r+1])e<y.length&&f.get(e)},[W,y,P,F,I,f,_,t.spread]),(0,v.useEffect)(()=>(i.flat=!0,()=>{i.flat=!1}),[]),p((e,t)=>{i.update(t),V.current+=t*2.2;let n=i.turn,r=R.current,a=!!n?.page;r.visible=!!n&&a===_;let o=S(I.right),s=S(I.left);if(o.uShadowAmt.value=0,s.uShadowAmt.value=0,!n||!r.visible)return;H.phase=V.current;let c=L.attributes.position;h(c.array,n.p,H,.002),c.needsUpdate=!0,L.computeVertexNormals(),L.computeBoundingSphere();let l=D/2*49*3,u=0,d=0;for(let e=0;e<=E;e++){let t=c.array[l+e*3];u=Math.max(u,t),d=Math.min(d,t)}let f=Math.sin(Math.PI*n.p);o.uShadowEdge.value=u,o.uShadowSide.value=1,o.uShadowAmt.value=.45*f*(1-n.p),s.uShadowEdge.value=d,s.uShadowSide.value=-1,s.uShadowAmt.value=.45*f*n.p});let G=(0,v.useMemo)(()=>new d,[]),K=(e,t)=>{let n=s.domElement.getBoundingClientRect();G.setFromCamera(new a((e-n.left)/n.width*2-1,-((t-n.top)/n.height)*2+1),o);let r=[B.current,z.current].filter(e=>e.visible),c=G.intersectObjects(r,!1)[0];if(!c?.uv||i.turn)return;let l=c.object===B.current?W.right:W.left;if(y[l]?.k===`toc`)return f.tocAt(l,(1-c.uv.y)*576)},q=(0,v.useRef)(b);q.current=b;let J=(0,v.useRef)(K);return J.current=K,(0,v.useEffect)(()=>{let e=s.domElement,t=null,n=()=>q.current.k*w*1.1,r=e=>{e.button>0||(t={x:e.clientX,y:e.clientY,started:!1,dir:1,lastP:0,lastT:performance.now(),vel:0})},a=r=>{if(!t){r.pointerType===`mouse`&&(e.style.cursor=J.current(r.clientX,r.clientY)===void 0?``:`pointer`);return}let a=r.clientX-t.x;if(!t.started){if(Math.abs(a)<10||Math.abs(a)<Math.abs(r.clientY-t.y))return;if(t.dir=a<0?1:-1,!i.beginDrag(t.dir)){t=null;return}t.started=!0,t.lastP=t.dir===1?0:1,e.setPointerCapture?.(r.pointerId)}let o=Math.min(1,Math.max(0,(t.dir===1?-a:a)/n())),s=t.dir===1?o:1-o,c=performance.now();t.vel=t.vel*.6+(s-t.lastP)/(Math.max(1,c-t.lastT)/1e3)*.4,t.lastP=s,t.lastT=c,i.dragTo(s)},o=e=>{let n=t;if(t=null,!n)return;if(n.started)return i.endDrag(n.vel);let r=J.current(e.clientX,e.clientY);if(r!==void 0)return i.goToPage(r);let a=q.current.r;i.step(e.clientX>=a.x+a.w/2?1:-1)};return e.addEventListener(`pointerdown`,r),e.addEventListener(`pointermove`,a),e.addEventListener(`pointerup`,o),e.addEventListener(`pointercancel`,o),()=>{e.removeEventListener(`pointerdown`,r),e.removeEventListener(`pointermove`,a),e.removeEventListener(`pointerup`,o),e.removeEventListener(`pointercancel`,o)}},[s,G]),(0,C.jsxs)(C.Fragment,{children:[(0,C.jsxs)(`mesh`,{position:[_?w/2-.0125:0,-.012,0],"rotation-x":-Math.PI/2,children:[(0,C.jsx)(`planeGeometry`,{args:[(_?w:2)+.05,T+.05]}),(0,C.jsx)(`meshBasicMaterial`,{color:`#4a1a22`})]}),(0,C.jsx)(`mesh`,{ref:z,visible:!_,position:[-1/2,-.002,0],"rotation-x":-Math.PI/2,material:I.left,children:(0,C.jsx)(`planeGeometry`,{args:[w,T]})}),(0,C.jsx)(`mesh`,{ref:B,position:[w/2,-.002,0],"rotation-x":-Math.PI/2,material:I.right,children:(0,C.jsx)(`planeGeometry`,{args:[w,T]})}),(0,C.jsxs)(`group`,{ref:R,visible:!1,children:[(0,C.jsx)(`mesh`,{geometry:L,material:I.front}),(0,C.jsx)(`mesh`,{geometry:L,material:I.back})]})]})}function F({config:e}){let t=(0,v.useSyncExternalStore)(i.subscribe,i.getSnapshot),n=t.single?[i.page]:r(Math.max(1,t.spread)),a=t.turning?``:n.map(e=>N(t.pages[e])).join(` `);return(0,C.jsxs)(`div`,{className:`flat-reader`,children:[(0,C.jsx)(u,{className:`flat-canvas`,dpr:[1,2],gl:{antialias:!0,alpha:!0,toneMapping:0},camera:{fov:O,position:[0,4,0]},"aria-hidden":`true`,children:(0,C.jsx)(P,{config:e})}),(0,C.jsx)(`div`,{className:`sr-only`,"aria-live":`polite`,children:a})]})}export{F as FlatReader};