export async function loadAudio(path) {
  return new Promise((resolve, reject) => {
    const audio = new Audio(path);
    audio.addEventListener('canplaythrough', () => resolve(audio), { once: true });
    audio.addEventListener(
      'error',
      () => reject(new Error(`音频加载失败: ${path}`)),
      { once: true }
    );
  });
}
