import { loadImage } from './_image.js';

// MVP 最朴素: 接 paths: string[] -> Image[]。
// 上游具体格式 (sprite sheet vs 单帧序列) 等设计师产出第一份真实 effect 资源时确认。
export async function loadEffect(paths) {
  if (!Array.isArray(paths) || paths.length === 0) {
    throw new Error('effect_loader 需要 paths: string[] (帧序列)');
  }
  return Promise.all(paths.map(loadImage));
}
