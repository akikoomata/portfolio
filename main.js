import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';

// === 基本セットアップ ===
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff); // 白背景

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 5); // ← Yを1.5→0.5に

const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('webgl'), antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);

// === ライト ===
const light = new THREE.DirectionalLight(0xffffff, 0.6);
light.position.set(2, 3, 1);
scene.add(light);
scene.add(new THREE.AmbientLight(0xffffff, 0.3));

// === フォントと文字セットのプリセット ===
const fontPresets = {
  selif: {
    name: 'Classic Serif',
    fontFamily: 'Roboto Mono',
    chars: ['.', 'i', 't', 'n', 'S', 'B', 'W'],
    scale: 1.0
  },
  ascii: {
    name: 'ASCII Art',
    fontFamily: 'Courier Prime',
    chars: ['.', '-', '=', '%', '¥', '#', '@'],
    scale: 1.05
  },
  japanese: {
    name: 'Japanesse',
    fontFamily: 'Noto Sans JP',
    chars: ['・', 'ノ', 'キ', 'ぷ', '明', '尾', '闇'],
    scale: 0.95   // ← 日本語フォントはやや縮小
  },
  Emoji: {
    name: 'Symbols',
    fontFamily: 'Noto Sans Symbols',
    chars: ['⌑', '☾', '♪', '⚐', '☮', '☺', '☯'],
    scale: 1.0    // ← 絵文字はさらに小さく
  },
};

const defaultPresetKey = 'selif';
const defaultPreset = fontPresets[defaultPresetKey];
let currentFont = defaultPreset.fontFamily;
let chars = defaultPreset.chars;
let scale = defaultPreset.scale; 

function createGlyphTexture(chars, fontFamily, scale = 1.0) {
  const baseSize = 64;
  const scaledSize = baseSize * scale;
  const rows = chars.length;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  // 🟢 Canvas自体をスケーリングして拡縮効果を正しく反映
  canvas.width = baseSize;
  canvas.height = baseSize * rows;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(scale, scale);

  for (let i = 0; i < rows; i++) {
    const ch = chars[i];
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${scaledSize}px "${fontFamily}", "Noto Sans Symbols", "Noto Sans", sans-serif`;
    ctx.fillText(chars[i], (baseSize / 2) / scale, ((baseSize * i + baseSize / 2) / scale));
  }

  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}



// === シェーダー ===
const vertexShader = `
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform sampler2D uGlyphAtlas;
  uniform float uGlyphCount;
  uniform vec3 uLightDirection;
  varying vec3 vNormal;

  void main() {
    float lightVal = max(dot(normalize(vNormal), normalize(uLightDirection)), 0.0);
    float brightness = pow(lightVal, 1.8);
    float adjusted = mix(0.15, 0.85, brightness);
    float glyphIndex = floor(adjusted * (uGlyphCount - 1.0));

    float cellHeight = 1.0 / uGlyphCount;
    vec2 repeatUV = fract(gl_FragCoord.xy / 25.0);
    vec2 glyphUV = vec2(repeatUV.x, glyphIndex * cellHeight + repeatUV.y * cellHeight);

    vec4 glyph = texture2D(uGlyphAtlas, glyphUV);

    // 白背景に黒文字で出力
    gl_FragColor = vec4(vec3(glyph.r), 1.0);
  }
`;



// === マテリアル ===
await document.fonts.load(`16px "${currentFont}"`);
await document.fonts.ready;
const dynamicGlyphAtlas = createGlyphTexture(chars, currentFont, scale);

const glyphMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uGlyphAtlas: { value: dynamicGlyphAtlas },
    uGlyphCount: { value: chars.length },
    uLightDirection: { value: new THREE.Vector3().copy(light.position).normalize() }
  },
  vertexShader,
  fragmentShader,
  transparent: true
});

// === モデル読み込み ===
let model;
const loader = new OBJLoader();
loader.load('model.obj', obj => {
  obj.traverse(child => {
    if (child.isMesh) {
      child.material = glyphMaterial;
      child.geometry.computeVertexNormals();
    }
  });

  // センタリングとスケール調整
  const box = new THREE.Box3().setFromObject(obj);
  const center = box.getCenter(new THREE.Vector3());
  obj.position.sub(center);
  const sizeVec = box.getSize(new THREE.Vector3());
  const maxAxis = Math.max(sizeVec.x, sizeVec.y, sizeVec.z);
  obj.scale.setScalar(2.5 / maxAxis); // ← サイズを小さめに変更
  obj.rotation.y = Math.PI;

  scene.add(obj);
  model = obj;
});

// === マウス + ライト ===
let mouseX = 0, mouseY = 0;
let targetLight = new THREE.Vector3();
let currentLight = new THREE.Vector3();

window.addEventListener('mousemove', (e) => {
  mouseX = (e.clientX / window.innerWidth) * 2 - 1;
  mouseY = (e.clientY / window.innerHeight) * 2 - 1;
});

// === アニメーション ===
function animate() {
  requestAnimationFrame(animate);

  if (model) {
    // モデル自転
    model.rotation.y += 0.01;

    // ライトをマウスに追従（反転）
    targetLight.set(-mouseX * 4.0, 2.5, -mouseY * 4.0);
    currentLight.lerp(targetLight, 0.05);
    light.position.copy(currentLight);

    glyphMaterial.uniforms.uLightDirection.value.copy(currentLight).normalize();
  }

  renderer.render(scene, camera);
}
animate();

// === リサイズ対応 ===
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// === セレクトUIの生成 ===
const fontSelect = document.getElementById('fontSelect');
fontSelect.innerHTML = ''; // ← 初期化
for (const key in fontPresets) {
  const opt = document.createElement('option');
  opt.value = key;
  opt.textContent = fontPresets[key].name;
  fontSelect.appendChild(opt);
}

// === 選択イベント ===
fontSelect.addEventListener('change', async (e) => {
  const selectedKey = e.target.value;
  const preset = fontPresets[selectedKey];

  currentFont = preset.fontFamily;
  const newChars = preset.chars;
  const scale = preset.scale ?? 1.0;

  // 🟢 まずフォントをプリロードして完全ロードを確認
  const fontSpec = `64px "${currentFont}"`;
  console.log(`🔤 Loading font: ${fontSpec}`);
  await document.fonts.load(fontSpec);
  await new Promise((resolve) => {
    // ready が即完了しないこともあるため少し待つ
    document.fonts.ready.then(resolve);
    setTimeout(resolve, 300); // ← 0.3秒だけ保険ウェイト
  });

  console.log('✅ Font fully loaded.');

  // 🟢 ロード完了後にAtlas生成
  const newAtlas = createGlyphTexture(newChars, currentFont, scale);
  glyphMaterial.uniforms.uGlyphAtlas.value = newAtlas;
  glyphMaterial.uniforms.uGlyphCount.value = newChars.length;
  glyphMaterial.uniforms.uGlyphAtlas.value.needsUpdate = true;
});

