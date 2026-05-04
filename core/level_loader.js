export async function loadLevel(path) {
  let res;
  try {
    res = await fetch(path);
  } catch (e) {
    return { error: `网络错误: ${path} - ${e.message}` };
  }
  if (!res.ok) {
    return { error: `加载关卡失败: ${path} (HTTP ${res.status})` };
  }
  let level;
  try {
    level = await res.json();
  } catch (e) {
    return { error: `关卡 JSON 解析失败: ${path} - ${e.message}` };
  }
  if (!Array.isArray(level.entities) || level.entities.length === 0) {
    return { error: `关卡 schema 不合法: ${path} 必须含非空 entities[]` };
  }
  return { level };
}
