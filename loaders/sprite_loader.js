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

  // animations: { state_key: { direction: [Image, Image, ...] } }
  // Schema 见 plan §13.1。state_key 是设计师源头命名 (opaque ID),
  // direction 可独立缺失 — 消费侧用 fallback chain (exact → south → 静帧)。
  const rawAnims = meta.frames?.animations ?? {};
  const stateEntries = await Promise.all(
    Object.entries(rawAnims).map(async ([stateKey, dirMap]) => {
      const dirEntries = await Promise.all(
        Object.entries(dirMap).map(async ([dir, framePaths]) => {
          const frames = await Promise.all(
            framePaths.map((p) => loadImage(`${spritePath}/${p}`))
          );
          return [dir, frames];
        })
      );
      return [stateKey, Object.fromEntries(dirEntries)];
    })
  );
  const animations = Object.fromEntries(stateEntries);

  return { character: meta.character, rotations, animations };
}
