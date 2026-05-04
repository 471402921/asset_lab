import { loadImage } from './_image.js';

// 全图地图: pixellab create_map 生成的整张 PNG。与 tilemap_loader (瓦片地图) 区分。
export async function loadMap(path) {
  return loadImage(path);
}
