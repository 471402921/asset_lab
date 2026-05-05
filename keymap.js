// 键盘绑定 (event.code)。改这里 -> 屏幕提示框自动同步 (input.js 反射)。
// asset-lab 现在仅 sprite preview 一个模式; 关卡编辑由 Tiled 处理。

export const SPRITE_KEYMAP = {
  // 8 方向 (用 pixellab 原始字符串, 零翻译)
  KeyW: { action: 'face', value: 'north' },
  KeyD: { action: 'face', value: 'east' },
  KeyS: { action: 'face', value: 'south' },
  KeyA: { action: 'face', value: 'west' },
  KeyQ: { action: 'face', value: 'north-west' },
  KeyE: { action: 'face', value: 'north-east' },
  KeyZ: { action: 'face', value: 'south-west' },
  KeyC: { action: 'face', value: 'south-east' },

  // 动画控制 (MVP 静帧, 暂未真正消费)
  Space: { action: 'animation', value: 'toggle_play' },
  BracketLeft: { action: 'animation', value: 'prev' },
  BracketRight: { action: 'animation', value: 'next' },

  // 缩放 (整数倍, renderer 强制校验)
  Equal: { action: 'zoom', value: '+1' },
  Minus: { action: 'zoom', value: '-1' },
  Digit0: { action: 'zoom', value: 'reset' },

  // ─── STATE SLOT (未实装) ─────────────────────────────────────────────────
  // 设计师未来要在 web 里模拟 sprite 各种状态(健康/受伤/睡觉/开心 等)。
  // 等 pixellab 状态导出 schema 定型后, 在这里加 Digit1..Digit9 之类绑定:
  //   Digit1: { action: 'state', value: 'idle' },
  //   Digit2: { action: 'state', value: 'walking' },
  //   ...
  // 触发后会进 modes/sprite_preview.js 的 _dispatch 'state' 分支(目前 throw)。
  // 详见 modes/sprite_preview.js 顶部 STATE SLOT 注释块。
  // ─────────────────────────────────────────────────────────────────────────
};

export const ANIMATION_DEFAULT_FPS = 8;
