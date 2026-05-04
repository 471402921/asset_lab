import { assertExportVersion } from '../core/version_guard.js';
import { loadImage } from './_image.js';

export async function loadSprite(spritePath) {
  const metaPath = `${spritePath}/metadata.json`;
  let res;
  try {
    res = await fetch(metaPath);
  } catch (e) {
    throw new Error(`无法读取 ${metaPath}: ${e.message}`);
  }
  if (!res.ok) {
    throw new Error(`未找到 sprite metadata: ${metaPath} (HTTP ${res.status})`);
  }
  const meta = await res.json();
  assertExportVersion(meta);

  const expected = meta.character?.directions;
  const rotKeys = Object.keys(meta.frames?.rotations ?? {});
  if (expected !== rotKeys.length) {
    throw new Error(
      `sprite ${spritePath} 方向数不一致: character.directions=${expected}, frames.rotations 有 ${rotKeys.length} 个 key`
    );
  }

  const rotations = {};
  await Promise.all(
    rotKeys.map(async (key) => {
      rotations[key] = await loadImage(`${spritePath}/${meta.frames.rotations[key]}`);
    })
  );

  // animations 当前 pixellab 导出为空; 首次拿到非空样本时按 plan §13 实装
  const animations = {};
  if (Object.keys(meta.frames.animations ?? {}).length > 0) {
    console.warn(
      '[sprite_loader] frames.animations 非空, 但 loader 尚未实装。请按 plan §13 更新格式约定后再扩。'
    );
  }

  return { character: meta.character, rotations, animations };
}
