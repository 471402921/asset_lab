// 键盘绑定 (event.code)。改这里 -> 屏幕提示框自动同步 (input.js 反射)。

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

  // 动画播放控制 (frames.animations 真消费, 见 plan §13.1 / §14.5)
  Space: { action: 'animation', value: 'toggle_play' },
  BracketLeft: { action: 'animation', value: 'prev' },
  BracketRight: { action: 'animation', value: 'next' },

  // 状态切换 (Digit1..Digit9 按 Object.keys(animations) 顺序选; Tab 清回静帧)
  // state_key 由设计师在 pixellab 命名 (semantic: idle/walking/...), asset-lab 不映射
  Tab: { action: 'state', value: 'clear' },
  Digit1: { action: 'state', value: 'index:0' },
  Digit2: { action: 'state', value: 'index:1' },
  Digit3: { action: 'state', value: 'index:2' },
  Digit4: { action: 'state', value: 'index:3' },
  Digit5: { action: 'state', value: 'index:4' },
  Digit6: { action: 'state', value: 'index:5' },
  Digit7: { action: 'state', value: 'index:6' },
  Digit8: { action: 'state', value: 'index:7' },
  Digit9: { action: 'state', value: 'index:8' },

  // 缩放 (整数倍, renderer 强制校验)
  Equal: { action: 'zoom', value: '+1' },
  Minus: { action: 'zoom', value: '-1' },
  Digit0: { action: 'zoom', value: 'reset' },
};

export const ANIMATION_DEFAULT_FPS = 8;
