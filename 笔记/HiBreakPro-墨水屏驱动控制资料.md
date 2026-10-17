# Bigme HiBreak Pro 墨水屏驱动控制资料

> 用途：给“墨水屏控制小工具”做参考，以及刷 GSI 后怎么用回原厂的墨水屏功能。
> 基于原厂固件 **3.4.6**（`Bigme_HiBreak_V1.0_20260831`，墨水屏驱动 `v5.19_20260521`）。
> 旧版 1.9.6 的数据见存档 `HiBreakPro-墨水屏驱动控制资料-旧版1.9.6.md`。
> 更新时间：2026-10-16
>
> 标记：✅ 实测有效　❌ 实测无效　❓ 没测或没有结论
> 注意：**GSI 里的实测是在旧版 1.9.6 vendor 上做的**（ponces Android 16 DSU）。刷 GSI 用的是新版 vendor，结果应该基本一致，但需要再确认一遍。

---

## 1. 原理

### 1.1 原厂怎么实现墨水屏功能
- 原厂给**每个 App** 保存一套显示策略（`DisplayPolicy`），用 `dumpsys xrz_display_policy_service` 可以看到全部。字段包括：`refreshMode`（刷新模式）、`refreshFrequency`、`appContrast`（对比度）、`appBrightnessLevel`（亮度 / 墨水浓度）、`appColorEnhance`（鲜艳增强）、`appTextEnhance`（文字增强）、`appColorMode`（情景模式）、`appAutoClean`、`appAntiFlicker`、`appAntiAlias`、`appScrollFlip`、`appEinkAnimation`（翻页动画）、`appDpi`、漂白模式等。
- App 切到前台时，原厂系统按它的策略：
  1. 设置一组 `vendor.xrz.*` 全局属性，部分由 **vendor 里的 HWC** 读取；
  2. 写一些 **`eink_debug` 驱动节点**（抗锯齿、防闪烁、自动清屏、翻页动画等）；
  3. 通过**原厂改过的 SurfaceFlinger**，把刷新模式、对比度、亮度、加深、增强、Gamma 等参数以**图层元数据**传给 HWC（HWC 字符串里的 `REFRESH_MODE`、`DARK_LEVEL`、`BRIGHTNESS_LEVEL`、`ENHANCE_LEVEL`、`GAMMA_LEVEL`，接口 `layerStateSetPerFrameMetadata` / `layerStateSetRefreshMode`）。HWC 再调用 vendor 里的 **`libimage_process.so`** 做图像处理（`adjustContrast`、`colorDither`、`convertToGray`、`process3DLUT` 等）。

### 1.2 GSI 里哪些能用
GSI 只替换 system，vendor（HWC、驱动）不变，所以：
- ✅ **HWC 自己读的 `vendor.xrz.*` 属性**：GSI 里用 root `setprop` 就能用；
- ✅ **`eink_debug` 驱动节点**：GSI 里用 root 直接写；
- ❓ **靠图层元数据传参的功能**（对比度、亮度 / 墨水浓度、加深、鲜艳增强、按 App 的刷新模式）：HWC 里找不到 `global_contrast`、`global_brightness_level` 这些属性名，参数应该是原厂 SurfaceFlinger 传的。GSI 的 SurfaceFlinger 是 AOSP 原版，不会传，所以**推测用不了，但还没在 GSI 里实测**。对比度目前用颜色矩阵模拟（第 4 节）。

判断一个属性 GSI 里能不能用：
```sh
su -c "strings /vendor/lib64/hw/hwcomposer.mt6877.so | grep xrz"
```

新版 HWC 读的属性（前缀 `vendor.xrz.`）：`global_refresh_mode`、`force_global_refresh_mode`、`anti_flicker_enabled`、`auto_clean_enabled`、`auto_clean_check_disable`、`clean_frequency`、`color_restoration_enabled`、`disable_auto_global_refresh`、`disable_commit`、`disable_driver_commit`、`disable_eink_vsync`、`disable_eink_vsync_for_fast`、`disable_image_copy`、`driver_color_enhance`、`eink_animation_mode`、`enable_home_clean`、`fps_limit`、`gray_256_dither`、`hwc.color_restoration_suppoort`、`hwc.image_smoothing_suppoort`、`hwc.show_commit_fps`、`hwc_idle`、`is_scrolling`、`cur_fps`、`update_waveform`、`check_commit`、`capture_commit`、`antutu_test`，以及 `persist.vendor.xrz.fps` / `fps_high` / `fps_low`。

### 1.3 原厂开机时的默认设置（刷 GSI 后会丢失，需要补回）

原厂的墨水屏默认属性**写在 `/system/build.prop` 里**，节点权限写在 **`/system/etc/init/init.eink.rc`** 里。GSI 替换了 system 分区，这些都会丢失，所以 GSI 里这些属性都是空的。

**`/system/build.prop` 里 HWC 会读的属性**（GSI 里值得补回）：

| 属性 | 原厂值 | 说明 |
|---|---|---|
| `ro.vendor.xrz.default_refresh_mode` | 178 | 默认刷新模式（NORMAL） |
| `vendor.xrz.disable_eink_vsync` | 1 | HWC 送画面时不等墨水屏刷完的同步信号。GSI 实测：**滑动更平滑**（`clean_a2=0` 时效果被卡顿掩盖，`clean_a2=1` 时能明显感觉到；运行中 setprop 立即生效），已放进模块 |
| `persist.vendor.xrz.fps` / `fps_high` / `fps_low` | 120 / 50 / 40 | 帧率分档 |
| `vendor.xrz.hwc.color_restoration_suppoort` | 1 | 颜色还原“支持”。GSI 实测：设不设画面都看不出区别 |
| `vendor.xrz.hwc.image_smoothing_suppoort` | 0 | 图像平滑“不支持” |

其他墨水屏相关的：`vendor.xrz.enable_gpu_image_process=1`、`vendor.xrz.regal_support=1`、`vendor.xrz.disable_inputmethod_fullscreen=1`、`vendor.xrz.bootanimation_refresh_mode=180`、`vendor.xrz.logo_refresh_mode=-2147483471`、`sys.maga_refresh_mode=-2147483471`、`sys.comic_refresh_mode=180`、`sys.video_refresh_mode=179`、`ro.sf.lcd_density=300`（vendor 里也有）。`ro.vendor.xrz.default_*`、`support_*`、`pen_type` 等是给原厂 App 和框架用的。

**`/system/etc/init/init.eink.rc` 里的节点权限**：
```
on early-init
    mount debugfs debugfs /sys/kernel/debug
    chmod 0777 /sys/kernel/debug
on init
    chmod 0666 /dev/lm3630a                         # 前光芯片的设备节点
on fs
    chmod 0666 /sys/kernel/debug/eink_debug/clean_a2
    chmod 0666 /sys/kernel/debug/eink_debug/anti_flicker
    chmod 0666 /sys/kernel/debug/eink_debug/anti_alias
    chmod 0666 /sys/kernel/debug/eink_debug/eink_animation
    chmod 0666 /sys/power/normal_standby
```
原厂开机时放开这些节点的权限，原厂 App 不用 root 就能写。GSI 里没有这一步，所以都要 root。

**其余属性**（`anti_flicker_enabled`、`auto_clean_enabled`、`clean_frequency`、`hwc_idle`、`force_global_refresh_mode=-1`、`gray_256_dither`、`global_*` 等）是原厂系统服务按前台 App 运行时设置的，GSI 里由工具负责。

**计划**：做一个 Magisk 模块，`system.prop` 补回上表的属性，`post-fs-data.sh` 按需放开节点权限，`service.sh` 按原厂“默认”情景模式设置一次。补回后，**之前 GSI 里没效果的自动消残影值得再测一次**。

---

## 2. 原厂 3.4.6 的情景模式（实测抓取）

在“系统设置”这个 App 上切换。每个模式的 `appColorMode` 和全局属性 `vendor.xrz.global_color_mode` 相同：**默认 0、杂志 1、漫画 2、视频 3、自定义 4**。

色彩相关（属性名省略了前缀 `vendor.xrz.global_`，GSI 里**推测无效，待实测**）：

| 模式 | `contrast` 对比度 | `color_enhance` 鲜艳增强 | `text_enhance` 文字增强 |
|---|---|---|---|
| 默认 | 20 | 0 | 50 |
| 杂志 | 25 | 50 | 50 |
| 漫画 | 30 | 60 | 50 |
| 视频 | 20 | 0 | **0** |
| 自定义 | = 对比度滑块 | = 鲜艳增强滑块 | 不变 |

刷新和抖动相关（GSI 里**能用**）：

| 模式 | `gray_256_dither` | `gpu_dither` | 防抖动 | 自动消残影 | 抗锯齿 `eink_debug/anti_alias` |
|---|---|---|---|---|---|
| 默认 | 0 | 0 | 开 | 开 | `1 1`（开） |
| 杂志 | **4** | **1** | 关 | 关 | `1 0`（关） |
| 漫画 | 0 | 0 | 关 | 关 | `1 0` |
| 视频 | 0 | 0 | 开 | 开 | `1 0` |
| 自定义 | 0 | **2** | 按开关 | 按开关 | `1 0` |

- `gpu_dither` 不在 HWC 里，GSI 里大概率无效。
- **防抖动**和**自动消残影**是两个独立的开关（各模式的预设值刚好相同）：
  - 防抖动 = `vendor.xrz.anti_flicker_enabled` + 节点 `eink_debug/anti_flicker`
  - 自动消残影 = `vendor.xrz.auto_clean_enabled` + 节点 `eink_debug/clean_a2`

**自定义模式实测**（刷新 Hyper、对比度 50、鲜艳增强 30、亮度 60、防抖动和自动消残影都开）：
- **Hyper = 刷新模式 183 + 系统帧率 120Hz**：`refreshMode=183`，同时 `settings system min_refresh_rate` 从 `60` 改成 `120`（`persist.vendor.xrz.fps=120`）。
- **亮度（墨水浓度）= `vendor.xrz.global_brightness_level`**（滑块 60 → 60，默认 20）。不是前光，截图看不出变化。GSI 里**推测无效**（HWC 不读这个属性名），**待实测**：`setprop vendor.xrz.global_brightness_level 60`，看墨色深浅有没有变化。
- 对比度 → `global_contrast`，鲜艳增强 → `global_color_enhance`（应该是彩屏用的）。

**翻页动画（类似 Kindle）**：原厂只在部分情景模式（比如杂志）下提供。设为“从左到右”时：

| 项目 | 关 | 从左到右 | GSI 里 |
|---|---|---|---|
| `vendor.xrz.eink_animation_mode` | 0 | 1 | ✅ HWC 会读 |
| `eink_debug/eink_animation` | 0 | 1 | ✅ 驱动节点 |
| 策略字段 `appEinkAnimation` | 0 | 1 | — 原厂 system 用 |

其他方向对应的值还没测。

**页面滑动优化**（“应用优化”页里的开关，跟翻页动画是**两个独立的设置**）：

| 设置 | `appScrollFlip` / `vendor.xrz.scroll_flip_type` | 说明 |
|---|---|---|
| 关 | 0 | |
| 开 + 智能刷新 | 1 | 防止在高清、Regal 模式下滑动页面时闪烁 |
| 开 + 整屏翻页 | 2 | 手指抬起时页面滑动到指定位置（用户自己的工具已有更好的实现） |

`scroll_flip_type` 不在 HWC 里，应该是原厂 system 侧处理的，GSI 里推测无效。

**“应用优化”页的其他设置**（都是原厂 system 侧按 App 处理的，GSI 里没有）：DPI 设置（`appDpi`）、应用漂白里的文字增强（`appBleachTextPlus`）、图标颜色（`appBleachIconColor`）、背景颜色（`appBleachBgColor`）。

**原厂开机后的其他属性值**（GSI 里这些都是空的，可以参考原厂的值来设置）：`force_global_refresh_mode=-1`（**-1 = 不强制**）、`clean_frequency=0 或 -1`、`disable_eink_vsync=1`、`hwc_idle=1`、`enable_gpu_image_process=1`、`persist.vendor.xrz.fps=120`、`fps_high=50`、`fps_low=40`、`ro.vendor.xrz.default_refresh_mode=178`。

---

## 2.5 ⭐ GSI 滑动卡顿的解决办法（2026-10-17 实测）

**现象**：正式刷入 ponces 16 GSI（新版 3.4.6 vendor）后，快速模式下滑动明显比原厂卡，HWC 每秒只提交 7～8 帧、每帧全屏刷新。

**原因**：原厂系统开机后会按“默认”情景模式设置一组 HWC 属性和驱动节点（防抖动、自动消残影、抗锯齿等），**GSI 里这些全是空的或关闭的**。

**解决**（需要 root，按原厂“默认”情景模式设置，实测滑动跟原厂差不多）：
```sh
E=/sys/kernel/debug/eink_debug
setprop vendor.xrz.global_refresh_mode 0          # 原厂默认：交给 HWC（默认 178）
setprop vendor.xrz.anti_flicker_enabled 1; echo 1 > $E/anti_flicker      # 防抖动
setprop vendor.xrz.auto_clean_enabled 1; setprop vendor.xrz.clean_frequency -1; echo 1 > $E/clean_a2   # 自动消残影
echo 1 > $E/anti_alias                            # 抗锯齿（读出来变成 "1 1"：support=1, value=1）
```
- **拆分测试结论：关键只在驱动节点 `clean_a2`**（“自动消残影”的驱动开关）：

  | 测试 | 防抖动 | 属性 `auto_clean_enabled` | 节点 `clean_a2` | 滑动 |
  |---|---|---|---|---|
  | 两个都开 | 开 | 1 | 1 | 快 |
  | 只开防抖动 | 开 | 0 | 0 | 卡 |
  | 只开自动消残影 | 关 | 1 | 1 | 快 |
  | 只写节点 | 关 | 0 | **1** | **快** |
  | 只设属性 | 关 | 1 | 0 | 卡（HWC 不会因为属性自动打开节点） |

  所以**最少只需要一行**：`echo 1 > /sys/kernel/debug/eink_debug/clean_a2`。推测是 `clean_a2` 让驱动在连续滑动时改用最快的 A2 黑白波形，停下后再自动清残影；关掉时每帧都用当前模式的完整波形，所以慢。
- 防抖动（`anti_flicker`）跟滑动速度无关，它的作用是让灰色区域刷新时不闪，原厂默认是开的。
- 这些都是临时设置，**重启后失效**，要做成 Magisk 模块开机自动执行（或由墨水屏工具设置）。

- **再加 `vendor.xrz.disable_eink_vsync=1` 会更平滑**（2026-10-17 实测，来回切换对比过几次）。它单独也有作用（省掉了等驱动刷完信号的时间），但 `clean_a2=0` 时每帧都用完整波形、要刷几百毫秒，这点改善被卡顿完全掩盖，看不出来；`clean_a2=1` 换成快速波形后，才能感觉到它的效果。所以两个都要开。

**排查时排除掉的方向**（都没有改善）：单独切刷新模式、单独设 `disable_eink_vsync=1`（没开 `clean_a2` 时，效果被掩盖）、帧率分档 `persist.vendor.xrz.fps*`、`is_scrolling=1`、CPU 锁最高频、把 SurfaceFlinger/HWC 从 `system-background`（只能用小核 0～5）移到 `foreground`。GPU 一直在最低频 385 MHz，但占用只有约 10%；HWC 转灰度每帧只要 7 ms。

---

## 3. 在 GSI 里的做法和实测结果

以下都需要 root。

| 功能 | 做法 | 结果 |
|---|---|---|
| **全局刷新模式** | `setprop vendor.xrz.global_refresh_mode <代码>`，或者 `echo <代码> > /sys/kernel/debug/eink_debug/global_mode`（用户在原厂 3.4.6 上验证过，效果差不多） | ✅ |
| **全屏刷新一次** | `setprop vendor.xrz.force_global_refresh_mode 4` → `service call SurfaceFlinger 1004`（重绘）→ 等约 0.6 秒 → `setprop vendor.xrz.force_global_refresh_mode -1` | ✅ ⚠️ 不清掉的话，之后**每次画面更新都用这个模式全刷**：画面静止时不闪，一滑动就连续闪 |
| **加深 / 对比度** | SurfaceFlinger 颜色矩阵，见第 4 节 | ✅ 效果明显 |
| **256 级灰度抖动** | `setprop vendor.xrz.gray_256_dither 4`（原厂杂志模式的值；实测时用的是 1） | ✅ 图片上能看出变化 |
| **帧率限制** | `setprop vendor.xrz.fps_limit <每秒帧数>`，恢复用 `setprop vendor.xrz.fps_limit ""` | ✅ 设 5 时滑动明显卡顿 |
| **驱动全局抖动** | `echo <值> > /sys/kernel/debug/eink_debug/global_dither` | ✅ **1**：非黑即白，对比度最高（实用）；2：画面不变但很卡；3：画面不变；4：画面不变但卡；0：默认 |
| Hyper | 刷新模式 183 + `settings put system min_refresh_rate 120`（这一条不需要 root） | ❓ 待测 |
| 抗锯齿 | `eink_debug/anti_alias`：读出来是 `support value`（第一位固定 1 = 驱动支持，第二位 = 开关）；**写入只认一个数字**，`echo 1` 开、`echo 0` 关（写 `"1 0"` 只会读到前面的 1，等于打开）。dmesg 里能看到 `set anti-alias off` | ✅ 节点可写；GSI 实测开关画面看不出区别（原厂默认开） |
| 翻页动画 | `vendor.xrz.eink_animation_mode=1` + `eink_debug/eink_animation=1` | ❓ 待测 |
| 颜色还原 | `vendor.xrz.color_restoration_enabled` | ❓ 待测 |
| 快速模式关垂直同步 | `vendor.xrz.disable_eink_vsync_for_fast` | ❓ 待测 |
| 自动清残影 | `vendor.xrz.auto_clean_enabled=1` + `clean_frequency` + `eink_debug/clean_a2=1` | ❌ 旧 vendor 上没看到自动全刷，可以参考原厂的值再试 |
| 回桌面清屏 | `vendor.xrz.enable_home_clean=1` | ❌ 回桌面没闪 |
| 图像平滑 | `vendor.xrz.hwc.enable_image_smoothing=1` | ❓ 没看出变化；新版 HWC 的 `hwc.image_smoothing_suppoort=0`，可能不支持 |
| 驱动节点 `eink_debug/contrast` | `echo 0～255` | ❌ 画面没变化；原厂也不用这个节点 |
| 驱动节点 `eink_debug/brightness` | `echo 0～255` | ❌ 不是前光，画面也没变化 |
| `vendor.xrz.driver_color_enhance` | `setprop ... 1` | ❌ 没变化 |
| 对比度、墨水浓度、鲜艳增强 | `setprop vendor.xrz.global_contrast` / `global_brightness_level` / `global_color_enhance <值>` | ❓ **待测**。推测无效（HWC 不读这些属性，参数靠原厂 SurfaceFlinger 以图层元数据传入） |
| 按 App 设置刷新模式 | — | ❌ 原厂 SurfaceFlinger 才支持。替代：工具监听前台 App，切换全局模式 |

**刷新模式代码**（原厂 `EinkRefreshMode.java`，加上新版的 Hyper）：

| 代码 | 名称 | 代码 | 名称 |
|---|---|---|---|
| 1 | INIT | 176 | CLEAN |
| 2 | DU | **177** | **HD** |
| 4 | GC16 | **178** | **NORMAL**（原厂默认） |
| 8 | GC4 | **179** | **FAST** |
| 16 | A2 | **180** | **REGAL** |
| 32 | GL16 | **183** | **HYPER**（3.4.6 新增） |
| 64 / 128 | GLR16 / GLD16 | 137 | INPUT（输入法） |
| 132 / 136 | GU16 / GU4 | 1029 / 1030 | 手写 / 橡皮擦 |
| 32768 | AUTO | | |

- 刷新模式数值的高位是 HWC 标志，例如杂志模式的 `sys.maga_refresh_mode=-2147483471` = `0x800000B1` = HD（177）+ 256 级抖动标志（`0x80000000`）。漫画 `sys.comic_refresh_mode=180`，视频 `sys.video_refresh_mode=179`。
- E Ink 通用波形：**GC16** 16 级灰度全刷（画质最好、会闪）；**GL16** 16 级灰度局部刷新；**DU** 只刷黑白、快；**A2** 黑白最快，残影最多。

---

## 4. 加深（对比度）：SurfaceFlinger 颜色矩阵 ✅

公式：`输出 = 1 - k × (1 - 输入)`，**白色保持白色，灰色按比例加深**，亮度低于 1/k 的灰色直接变黑。
```sh
# k=1.5 示例（1-k = -0.5）。4×4 矩阵按列排列，最后一行前三个数是平移量 (1-k)
service call SurfaceFlinger 1015 i32 1 \
  f 1.5 f 0 f 0 f 0 \
  f 0 f 1.5 f 0 f 0 \
  f 0 f 0 f 1.5 f 0 \
  f -0.5 f -0.5 f -0.5 f 1
# 关闭（恢复原样）
service call SurfaceFlinger 1015 i32 0
```
- 实测：**k=1.5 合适**（用户选定）；k=2.0 偏深。工具里建议做成滑块，范围大约 1.0～2.0。
- **重启后失效**，开机后要重新执行。
- ⚠️ Android 的护眼模式、颜色校正、灰度也用这个颜色变换通道，切换它们时可能会冲掉你的矩阵，工具里最好有“重新应用”。
- 这台机器所有图层都走 GPU 合成（`composition=CLIENT`），所以颜色矩阵一定会生效。

---

## 5. 字体加粗 ✅（不需要 root）

原厂的 `persist.vendor.xrz.global_fonts_weight` 依赖原厂改过的 Typeface 类，GSI 里无效。改用 Android 自带的全局字重调节：
```sh
adb shell settings put secure font_weight_adjustment 500   # 最粗：常规文字 400 → 900（Black）
adb shell settings put secure font_weight_adjustment 300   # 等于 设置 → 无障碍 →“粗体文字”
adb shell settings put secure font_weight_adjustment 0     # 关闭（系统默认）
```
- 所有文字的字重都加上这个值，最大到 1000。ponces 16 的中文字体 `NotoSansCJK-Regular.ttc` 是**可变字体**（100～900），所以中文也能变粗；**900 是上限，500 就是最粗效果**。
- 实测 500 比 300 明显更粗。重启后保留。
- 在系统设置里切换“粗体文字”开关，会把它重置成 300 或 0。
- 工具里修改需要 `WRITE_SECURE_SETTINGS` 权限（`adb shell pm grant <包名> android.permission.WRITE_SECURE_SETTINGS` 授予一次），或者直接用 root 执行。

---

## 6. 前光（冷光 / 暖光）✅

```sh
L=/sys/devices/platform/11d01000.i2c7/i2c-7/7-0036
echo 20 > $L/lm3630a_warm_light    # 暖光，0～254，0 = 关
echo 0  > $L/lm3630a_cold_light    # 冷光，0～254，0 = 关
```
- 需要 root。前光芯片是 TI **LM3630A**（双通道，i2c7 总线，地址 0x36），同目录下还有 `lm3630a_version`。
- 原厂用 `settings system screen_brightness_cold/warm` 记住亮度，**GSI 里没有服务读它们**，只能当作“保存当前值”的地方，开机后自己读出来再写回节点。

### 6.1 锁屏自动关前光（GSI 里要自己实现）
- **现象**：GSI 里锁屏或灭屏后前光**不会自己熄灭**（原厂是 Bigme 的系统服务处理的）。
- **做法**：工具 App 监听亮屏和灭屏，灭屏时两个节点写 0，亮屏时写回保存的亮度。
  - `ACTION_SCREEN_OFF` / `ACTION_SCREEN_ON` **不能在 AndroidManifest 里静态注册**，要在一直运行的组件里动态注册：**前台服务**（有常驻通知），或者**无障碍服务**（不需要常驻通知，不容易被系统杀掉）。
  - 用**常驻 root shell**（[libsu](https://github.com/topjohnwu/libsu)），不要每次都新开 `su` 进程。
  - 可选：等到 `ACTION_USER_PRESENT`（解锁后）再开灯，锁屏界面不亮灯更省电。
  - 开机时（`BOOT_COMPLETED`）也恢复一次亮度。
```kotlin
class LightService : Service() {
    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(c: Context, i: Intent) {
            when (i.action) {
                Intent.ACTION_SCREEN_OFF -> setLight(0, 0)                  // 灭屏：关灯
                Intent.ACTION_SCREEN_ON  -> setLight(savedCold, savedWarm)  // 亮屏：恢复（或改用 ACTION_USER_PRESENT）
            }
        }
    }
    override fun onCreate() {
        super.onCreate()
        startForeground(1, buildNotification())
        registerReceiver(receiver, IntentFilter().apply {
            addAction(Intent.ACTION_SCREEN_OFF)
            addAction(Intent.ACTION_SCREEN_ON)
        })
    }
    private fun setLight(cold: Int, warm: Int) {
        Shell.cmd("echo $cold > $COLD_FILE", "echo $warm > $WARM_FILE").submit()  // libsu
    }
}
```
- 不推荐的临时办法：Magisk `service.d` 脚本每 1～2 秒检查 `dumpsys power` 里的 `mWakefulness`。能用，但耗电、有延迟。

### 6.2 锁屏待机画面（GSI 里要自己实现）

**问题**：墨水屏断电后会保留最后一帧。原生 Android 按电源键后很快就断电，墨水屏上留下的是断电前的画面（“冻结画面”），原生锁屏界面来不及显示。海信 A9 的 GSI 社区也遇到过同样的问题。

**原厂的做法**（原厂 3.4.6 按电源键锁屏时的日志）：

| 时间 | 事件 |
|---|---|
| 0 ms | `PowerManagerService: Going to sleep due to power_button`，开始休眠 |
| +4 ms | system_server 里原厂的本地代码 `Xrzebook-JNI`：`SetScreenState 0`、`SetColdLight 0`、`SetWarmLight 0`（**关前光**） |
| +6 ms | 原厂系统调用锁屏 App `com.xrz.standby` 的 `LogoProvider`，启动 **`ScreenSaveActivity`（待机画面）** |
| +145 ms | 待机画面显示并绘制完成 |
| **+1.5 秒** | 屏幕才真正断电（`DisplayPowerController: Blocking screen off` → `Display ... OFF` → HWC `SetPowerMode(0)`） |
| 唤醒时 | `ScreenSaveActivity` 被恢复后马上 `finish()`，回到原来的界面 |

也就是说，原厂在“开始休眠”和“屏幕断电”之间**留了约 1.5 秒**：先关前光、显示待机画面、让墨水屏刷新完，再断电。

**GSI 里的方案**（建议按顺序尝试）：

1. **工具 App 抢时间（最简单，先试）**
   - 在前台服务或无障碍服务里监听 `ACTION_SCREEN_OFF`（开始休眠时就会发出，跟锁屏关前光用同一个）；
   - 收到后马上：关前光 → 显示全屏待机画面（无障碍服务可以用 `TYPE_ACCESSIBILITY_OVERLAY`，能盖在锁屏界面上面）→ 强制全刷一次（`force_global_refresh_mode` 设 4，约 0.6 秒后设回 -1）；
   - 收到 `ACTION_SCREEN_ON` 时移除待机画面；
   - **风险**：不知道 GSI 里从 `SCREEN_OFF` 广播到屏幕断电之间有多少时间，**要刷完 GSI 后实测**。时间不够的话，画面会刷到一半就断电。
2. **像原厂一样延迟断电（方案 1 来不及时用）**
   - 原生 Android 本来就有“断电前等一下”的机制（日志里的 `Blocking screen off`，系统会等锁屏界面准备好）。用 **LSPosed 模块** hook `PhoneWindowManager.screenTurningOff()`（或 `DisplayPowerController` 对应的地方），等待机画面画完、墨水屏刷完，再让系统断电；
   - 需要 Magisk + Zygisk + LSPosed。
3. **AOD（息屏显示，备选）**
   - 锁屏时屏幕进入低功耗的“息屏显示”状态，不会真正断电，系统会画 AOD 界面。海信 A9 的 GSI 社区、Vasu 的 HiBreak 包用的都是这个办法；
   - 缺点：**比真正关屏费电**（显示通路要保持工作，时钟和通知每分钟左右更新一次，每次都要唤醒 CPU、刷新墨水屏）；AOSP 的 AOD 是黑底白字时钟，在墨水屏上不好看，自定义要改 SystemUI。
   - 只想锁屏时显示一张固定的图，用方案 1 或 2 最省电：断电前刷好，之后完全不耗电。

**第一步要测的**：刷完 GSI 后，按电源键锁屏，看日志里从 `Going to sleep` 到 `Display ... OFF` 之间有多少时间：
```sh
adb shell "su -c 'logcat -b all -c'"      # 先清空日志，然后按电源键锁屏，等几秒
adb shell "su -c 'logcat -b all -d -v time'" | grep -E "Going to sleep|SCREEN_OFF|Display device changed state|SetPowerMode"
```
超过 0.5～1 秒，方案 1 应该就够用了。

---

## 7. `eink_debug` 驱动节点（3.4.6，驱动 v5.19）

位置 `/sys/kernel/debug/eink_debug/`，在 debugfs 下，需要 root。如果没挂载：`mountpoint /sys/kernel/debug || mount -t debugfs debugfs /sys/kernel/debug`。

| 节点 | 读到的值（3.4.6） | 含义 | 风险 |
|---|---|---|---|
| `global_mode` | `mode=0x0` | 全局刷新模式，可直接写模式代码 | 低 |
| `anti_alias` | `1 0` | 抗锯齿：第一位 = 是否支持，第二位 = 开关 | 低 |
| `anti_flicker` | `anti_flicker=0/1` | 防闪烁 | 低 |
| `clean_a2` | `clean_a2=0/1` | 自动清残影 | 低 |
| `eink_animation` | `eink_animation=0/1` | 翻页动画（新版新增） | 低 |
| `global_dither` | `dither=0x0` | 全局抖动，1 = 非黑即白 | 低 |
| `contrast` / `brightness` / `saturation` | 0 | 写入后看不出效果，原厂也不用 | 低 |
| `manual_refresh` | `init=0,pos(0,0,0), neg(0,0,0),loop=0` | 手动刷新？用法不明 | 低 |
| `frame_data` | `frame_mode=0x4` | 帧数据 / 模式信息 | 只读 |
| `sys_update` | 1 | 不明 | 中 |
| `temperature` | 29 | 面板温度（用来选波形） | 中 |
| `enable` | 1 | 墨水屏驱动开关 | ⚠️ **高，写 0 可能黑屏** |
| `vcom` | -1860 | 面板公共电压，出厂校准值 | ⚠️ **高，不要改** |
| `waveform` / `machine_waveform` | `570_VSK029_HU0701_EC103KH3C6_SC1452-KCE_TC.awf` | 波形文件 | ⚠️ **高，不要写** |
| `wf_ota` | 读取报错 | 波形更新 | ⚠️ **高，不要写** |
| `version` | `v5.19_20260521` | 驱动版本 | 只读 |
| `panel_type` / `print_level` / `save_level` / `dc_count` | — | 信息、调试用 | 只读 |

---

## 8. 小工具的实现思路

### 8.1 权限
- `/sys` 和 `/sys/kernel/debug` 下的节点、`vendor.xrz.*` 属性，**普通 App 都改不了**，需要 root。推荐用 [libsu](https://github.com/topjohnwu/libsu) 保持一个常驻 root shell。
- 也可以像 HibreakProPatchingService 那样，写一个以 root 运行的守护进程（比如放在 Magisk 模块的 `service.sh` 里启动），App 通过本地 socket 发指令。
- `settings secure` / `settings system` 的修改（字重、帧率）只需要 `WRITE_SECURE_SETTINGS` / `WRITE_SETTINGS` 权限。

### 8.2 用 GSI 模拟原厂的“情景模式”
监听前台 App 切换，按第 2 节的表套用一组设置：刷新模式（全局）、颜色矩阵 k 值（模拟对比度）、`gray_256_dither`、防闪烁、自动清屏、抗锯齿、翻页动画等。

### 8.3 抓取原厂参数的方法（以后原厂再更新时可以复用）
在原厂系统里，每切换一次设置就拍一张“快照”，再和上一次对比：
```sh
su -c 'getprop | grep -iE "xrz|eink|refresh_mode" | sort'                              # 全部 xrz 属性
su -c 'for f in /sys/kernel/debug/eink_debug/*; do echo "$f: $(cat $f)"; done'        # 驱动节点
su -c 'dumpsys xrz_display_policy_service'                                            # 每个 App 的显示策略
settings list system; settings list secure; settings list global                       # 系统设置
```

---

## 9. 资料来源

- 原厂 `framework.jar` 反编译（`xrz/framework/manager/`）、原厂 `libXrzFramework_runtime.so`、手机上的 `hwcomposer.mt6877.so` 和 `libimage_process.so`，以及原厂 1.9.6 / 3.4.6 上的实测抓取
- Vasu：Hibreak Pro Guide 4（刷机、前光、刷新模式）— https://vbh.ai/hibreak-pro-guide-4-flashing-the-android-15-gsi/
- HibreakProPatchingService（HiBreak Pro 墨水屏功能补丁）— https://github.com/vbbot/HibreakProPatchingService
- XDA：Bigme Hibreak Pro Development Thread — https://xdaforums.com/t/bigme-hibreak-pro-development-thread.4731041/
- XDA：Bigme HiBreak Pro (MT6877) E ink phone — https://xdaforums.com/t/bigme-hibreak-pro-dimensity-900-mt6877-e-ink-phone.4723924/
