import { loadImage } from './_image.js';

// MVP: 单 PNG。9-slice 渲染未实装 (plan §3 / §6.3)。
export async function loadUI(path) {
  return loadImage(path);
}
