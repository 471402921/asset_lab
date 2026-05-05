# tools/lint/

asset-lab 资源校验工具,被 `.claude/skills/asset-check/` Skill 调用。

## 跑法

```bash
python3 tools/lint/check_assets.py             # 全量
python3 tools/lint/check_assets.py --quiet     # 只汇总
python3 tools/lint/check_assets.py --path assets/scenes/test  # 限定子目录
```

退出码: `0` 通过,`1` 有 ERROR,`2` 致命(`assets/` 不存在等)。

## 设计原则

跟 [tools/converters/](../converters/) 同款:
- **stdlib only**(无 pip 依赖)
- **单文件**(`check_assets.py` 全部逻辑;不切 checks/ 子模块)
- **报告优先**(默认不修文件)

加新检查就写一个 `check_xxx()` 函数,通过 `err()` / `warn()` 报告,在 `main()` 里调一次就行。

## 给设计师调用的方式

通过 Skill `/asset-check` 触发(详见 [.claude/skills/asset-check/SKILL.md](../../.claude/skills/asset-check/SKILL.md))。Skill 是给 Claude Code 用的薄壳,真逻辑都在这里;以后想从 CI / pre-commit hook 跑也方便。
