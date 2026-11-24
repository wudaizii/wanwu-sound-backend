# 测试声音集原件（回归集）

调音台和规则回归用的一组固定声音。清单在 `docs/assets/test-set.json`：已有的 8 段直接用声音库的示例原件，其余标为“待收集”。

收集新的一段时：

1. 原件放在本文件夹（不进 `public/`，不剪、不改响度），文件名用清单里的 `id`。
2. 在 `docs/assets/test-set.json` 的 `toCollect` 里把这一条移到 `sounds`，写上 `file`、来源、许可和预期分类 `expectedKind`（`one` 单个声音 / `series` 一串声音 / `texture` 连成一片 / `silent` 几乎无声）。
3. 来源与许可同时记到 `docs/assets/SOURCES.md`。只有确认可以使用的录音才能放进来。
