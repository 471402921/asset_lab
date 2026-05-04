export async function loadScene(path) {
  let res;
  try {
    res = await fetch(path);
  } catch (e) {
    return { error: `网络错误: ${path} - ${e.message}` };
  }
  if (!res.ok) {
    return { error: `加载场景失败: ${path} (HTTP ${res.status})` };
  }
  let scene;
  try {
    scene = await res.json();
  } catch (e) {
    return { error: `场景 JSON 解析失败: ${path} - ${e.message}` };
  }
  if (!scene.background || !Array.isArray(scene.entities)) {
    return { error: `场景 schema 不合法: ${path} 必须含 background + entities[]` };
  }
  return { scene };
}
