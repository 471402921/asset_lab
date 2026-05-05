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
};

export const ANIMATION_DEFAULT_FPS = 8;
