# Bigme HiBreak Pro 墨水屏驱动控制资料：旧版 1.9.6 存档

> 这份是**原厂 1.9.6 固件**（`Bigme_HiBreak_V1.0_20250403`，墨水屏驱动 `v4.63_20250403`）时期的资料存档。
> 手机已升级到 3.4.6，**当前有效的内容请看主文档** `HiBreakPro-墨水屏驱动控制资料.md`。
> 这里只保留旧版特有的数据，以及早期调研时、后来被新发现修正或取代的资料，供以后对比查阅。

---

## 1. 旧版 vendor 下，GSI（ponces Android 16 DSU）里的默认值

开机后没有改过时：
- `vendor.xrz.*` 属性：**全部未设置**（`global_refresh_mode`、`force_global_refresh_mode`、`auto_clean_enabled`、`clean_frequency`、`enable_home_clean`、`gray_256_dither`、`hwc.enable_image_smoothing`、`fps_limit`、`driver_color_enhance`、`persist.vendor.xrz.global_dark_level` 等）。原厂系统开机时会主动设置这些属性，GSI 里没有人去设置。
- `eink_debug` 节点：`contrast=0`、`saturation=0`、`global_dither=0x0`、`brightness=0`、`anti_alias=0 0`、`anti_flicker=1`、`clean_a2=0`、`global_mode=0x0`、`sys_update=1`、`temperature=30`、`version=v4.63_20250403`。
- 当时观察到：写 `vendor.xrz.global_refresh_mode` 不会改变 `eink_debug/global_mode` 的读数（一直是 `0x0`）。后来用户在 3.4.6 上发现**直接写 `eink_debug/global_mode` 也能切刷新模式**。

## 2. 旧驱动特有的结论

- **抗锯齿不支持**：`eink_debug/anti_alias` 写 `1`、`1 1`、`0 1`，读回来一直是 `0 0`。（新驱动 v5.19 已经支持，读出来是 `1 x`。）
- 旧版 HWC 监听的属性比新版少，新版新增的属性见主文档。

## 3. 旧版原厂“墨水屏中心”情景模式（1.9.6 实测抓取，2026-10-16）

| 情景模式 | `appColorMode` | `global_contrast` | `global_color_enhance` | `gray_256_dither` | 防闪烁 | 自动清屏（属性 + `clean_a2`） |
|---|---|---|---|---|---|---|
| 默认 | 0 | 0 | 0 | 0 | 开 | 开 |
| 杂志 | 1 | 0 | 80 | **4** | 关 | 关 |
| 漫画 | 2 | **90** | 90 | 0 | 关 | 关 |
| 视频 | 3 | 0 | 0 | 0 | 开 | 开 |
| 自定义 | 4 | = 对比度滑块的值（实测 50 → 50） | 0 | 0 | 开 | 开 |

- 原厂开机后的其他默认属性：`clean_frequency=43`、`disable_eink_vsync=1`、`hwc_idle=1`、`enable_gpu_image_process=1`、`force_global_refresh_mode=-1`、`ro.vendor.xrz.default_refresh_mode=178`、`ro.vendor.xrz.display_policy_version=6`。
- 当时的判断是“对比度在 system 侧用 GPU 处理”。在 3.4.6 上进一步查明：处理代码在 vendor 的 `libimage_process.so` 里（由 HWC 加载），参数由原厂 SurfaceFlinger 以图层元数据传入，详见主文档。
- “文字增强”在旧版就是 Android 自带的“高对比度文字”（`settings secure high_text_contrast_enabled`）。新版另有 `vendor.xrz.global_text_enhance`。

---

## 4. 早期调研资料（已被原厂代码和实测修正）

### 4.1 HibreakProPatchingService 使用的刷新模式命名

| 代码 | 项目里的命名 | 原厂 `EinkRefreshMode.java` 里的名字 |
|---|---|---|
| 177 | SMOOTH | HD |
| 178 | BALANCED | NORMAL |
| 179 | FAST | FAST |
| 180 | CLEAR | REGAL |

这个项目的“单击墨水屏按键刷新屏幕”：切到 180 → 盖一层全黑 100ms → 换成全白 100ms → 移除 → 切回原模式。

### 4.2 XDA 帖子里流传的常量表（来自搜索摘要，没读到原帖）

DU=2、GC16=4、A2=16、GL16=32、Clean=176、HD=177、Normal=178、Fast=179、Regal=180。和原厂代码一致，但不完整，完整的表见主文档。

### 4.3 HibreakProPatchingService 里的高通路径（在 HiBreak Pro 上无效）

守护进程里的对比度、黑白阈值、提交位图用的是这些节点：
```
/sys/devices/platform/soc/soc:qcom,dsi-display-primary/epd_contrast
/sys/devices/platform/soc/soc:qcom,dsi-display-primary/epd_white_threshold
/sys/devices/platform/soc/soc:qcom,dsi-display-primary/epd_black_threshold
/sys/devices/platform/soc/soc:qcom,dsi-display-primary/epd_commit_bitmap
```
这些是从海信 A9（高通平台）的项目继承来的，HiBreak Pro（联发科）上没有。

项目里用系统属性实现的功能（不知道在 GSI 上是否有效）：
| 功能 | 属性 |
|---|---|
| 静态锁屏 | `sys.linevibrator_type` |
| 最大亮度 | `sys.linevibrator_touch` |
| 音量键唤醒 | `sys.wakeup_on_volume` |
