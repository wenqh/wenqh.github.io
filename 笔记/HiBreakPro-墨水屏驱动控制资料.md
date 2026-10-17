# Bigme HiBreak Pro 墨水屏驱动控制资料

> 用途：给“墨水屏控制小工具”做参考，以及刷 GSI 后怎么用回原厂的墨水屏功能。
> 基于原厂固件 **3.4.6**（`Bigme_HiBreak_V1.0_20260831`，墨水屏驱动 `v5.19_20260521`），GSI 是 ponces Android 16。
> 更新时间：2026-10-17（按功能重新整理；内容对照了 3.4.6 原厂 `services.jar` / `framework.jar` 反编译源码）
> 旧版 1.9.6 的数据见 `HiBreakPro-墨水屏驱动控制资料-旧版1.9.6.md`。
>
> 标记：✅ 实测有效　❌ 实测无效　❓ 没测或没有结论
> 没特别说明的实测都是在“正式刷入的 GSI + 3.4.6 vendor”上做的；标了“旧 vendor”的是在 1.9.6 vendor 的 DSU 里测的。

---

## 目录

0. [速查](#0-速查)
1. [原理](#1-原理)
2. [功能参考](#2-功能参考)
3. [无效的属性、不是设置项的属性](#3-无效的属性不是设置项的属性)
4. [原厂情景模式参考](#4-原厂情景模式参考)
5. [`eink_debug` 驱动节点](#5-eink_debug-驱动节点)
6. [锁屏：关前光、待机画面](#6-锁屏关前光待机画面)
7. [工具实现](#7-工具实现)
- [附录 A：补充记录](#附录-a补充记录)
- [附录 B：资料来源](#附录-b资料来源)

---

## 0. 速查

### 0.1 GSI 里已经由模块搞定的（Magisk 模块 `hibreak_eink` v7，见刷机指南 6.5）

| 设置 | 作用 | 详见 |
|---|---|---|
| 节点 `clean_a2=1` | 允许驱动连续刷新，**解决滑动卡顿** | 2.2 |
| `vendor.xrz.disable_eink_vsync=1` | 滑动更平滑 | 2.4 |
| `debug.sf.nobootanimation=1` | 关开机动画，避免开机黑屏（不属于墨水屏功能，见刷机指南 4.5） | — |

### 0.2 要由工具负责的（GSI 里没有服务做，重启后也不会保留）

| 功能 | 怎么做 | 详见 |
|---|---|---|
| 加深 | SurfaceFlinger 颜色矩阵，k=1.5 | 2.10 |
| 前光亮度 | 写 LM3630A 节点，开机恢复 | 2.12 |
| 锁屏关前光 | 监听灭屏 / 亮屏 | 6.1 |
| 锁屏待机画面 | 要用 LSPosed 延迟断电（`SCREEN_OFF` 广播来不及，已实测） | 6.2 |
| 手动全刷（可选） | `force_global_refresh_mode`，用来清残影 | 2.6 |

上面这些参数（以及第 2 节的大部分功能）可以用调试工具直接调，见 7.5。

### 0.3 GSI 里做不到的

**原厂的实现方式在 GSI 里用不了的**：对比度、墨水浓度（亮度）、鲜艳增强、文字增强（情景模式的隐藏预设，不是无障碍的高对比度文字）、按应用设置刷新模式、页面滑动优化的“整屏翻页”、应用漂白、按应用 DPI。原因见 1.2。

**其中可以换个方式实现的**：对比度用颜色矩阵加深代替（2.10）；按应用切换刷新模式改成工具监听前台应用、切换全局模式（2.1）；“应用漂白”里的文字增强本来就是安卓自带的高对比度文字，可以直接用。

---

## 1. 原理

### 1.1 原厂的架构：谁负责什么

原厂给**每个 App** 保存一套显示策略（`DisplayPolicy`，`dumpsys xrz_display_policy_service` 可以看到全部）。App 切到前台时，原厂 system 里的 `DisplayPolicyController.applyDisplayPolicy` 按策略做三件事：

| 层 | 做什么 | 例子 |
|---|---|---|
| **system 直接写节点**（`libXrzFramework_runtime.so` 的 JNI） | 写 `eink_debug` 节点 | `clean_a2`（自动消残影）、`anti_alias`（抗锯齿） |
| **system 设属性 → vendor 的 HWC 读** | 设 `vendor.xrz.*` 属性，HWC（`hwcomposer.mt6877.so`）按属性工作；有的属性 HWC 还会**每帧转写成节点** | `global_refresh_mode`；`anti_flicker_enabled` → 节点 `anti_flicker`；`eink_animation_mode` → 节点 `eink_animation` |
| **原厂魔改的 SurfaceFlinger** | 把刷新模式、对比度、亮度、加深、增强、Gamma 等以**图层元数据**传给 HWC（`REFRESH_MODE`、`DARK_LEVEL`、`BRIGHTNESS_LEVEL`、`ENHANCE_LEVEL`、`GAMMA_LEVEL`），HWC 再调 vendor 的 `libimage_process.so` 处理；system 侧还有 `libxrzUtil.so` 做灰度、dither、Gamma | 对比度、墨水浓度、按应用刷新模式（`setLayerRefreshMode`） |

原厂开机时还会：
- 从 **`/system/build.prop`** 读一批默认属性（见 4.4）；
- 用 **`/system/etc/init/init.eink.rc`** 把几个节点改成所有人可写，这样原厂 App 和 HWC 不用 root 也能写：
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

### 1.2 GSI 里哪些能用

GSI 只替换 system，vendor（HWC、驱动）不变：

| 类型 | GSI 里 | 说明 |
|---|---|---|
| HWC 读的 `vendor.xrz.*` 属性 | ✅ 能用 | 用 root `setprop`，立即生效 |
| `eink_debug` 驱动节点 | ✅ 能用 | 用 root 直接写 |
| 原厂 SurfaceFlinger / `libxrzUtil.so` 处理的功能 | ❌ 不能用 | GSI 的 SurfaceFlinger 是 AOSP 原版，不会传图层元数据 |
| 原厂 init 脚本、build.prop | ❌ 丢失 | 属性全空；节点都是只读（`r--r--r--`），只有 root 能写 |

**节点只读带来的副作用**：HWC 每帧都想按属性写 `anti_flicker`、`eink_animation` 节点，但写不进去，logcat 里每帧都有 `hwcomposer: error writing to /sys/kernel/debug/eink_debug/anti_flicker`。这两个功能在 GSI 里只能由工具直接写节点。（如果用模块把节点改成 `0666`，HWC 就会重新接管，按属性覆盖手动写的值。）

判断一个属性 HWC 有没有用到：
```sh
su -c "strings /vendor/lib64/hw/hwcomposer.mt6877.so | grep xrz"
```
⚠️ 名字出现在 HWC 里，不代表它是“设置项”，有几个是 HWC 自己往外写的状态（见第 3 节）。

新版 HWC 里出现的属性（前缀 `vendor.xrz.`）：`global_refresh_mode`、`force_global_refresh_mode`、`anti_flicker_enabled`、`auto_clean_enabled`、`auto_clean_check_disable`、`clean_frequency`、`color_restoration_enabled`、`disable_auto_global_refresh`、`disable_commit`、`disable_driver_commit`、`disable_eink_vsync`、`disable_eink_vsync_for_fast`、`disable_image_copy`、`driver_color_enhance`、`eink_animation_mode`、`enable_home_clean`、`fps_limit`、`gray_256_dither`、`hwc.color_restoration_suppoort`、`hwc.image_smoothing_suppoort`、`hwc.show_commit_fps`、`hwc_idle`、`is_scrolling`、`cur_fps`、`update_waveform`、`check_commit`、`capture_commit`、`antutu_test`，以及 `persist.vendor.xrz.fps` / `fps_high` / `fps_low`。

### 1.3 E Ink 波形基础

| 波形 | 灰阶 | 闪不闪 | 用途 |
|---|---|---|---|
| GC16 | 16 级 | **闪**（像素先黑白翻转一遍） | 高质量画面；清残影用的“全刷” |
| INIT | — | **闪**，很慢 | 屏幕初始化用 |
| GL16 | 16 级 | 闪（这块屏跟 GC16 一样，见 2.6） | 白底文字 |
| GLR16 | 16 级 | 不闪（这块屏被换成 GU16，见 2.6） | 白底文字 |
| DU | 黑白 | 不闪 | 菜单、手写 |
| A2 | 黑白 | 不闪，最快 | 翻页、滑动、动画。灰色只能用黑白点阵模拟（看灰色区域像“抹布”的纹理），残影最多 |

上表是 E Ink 的通用说法。这块屏的实际行为不一定跟名字对得上（比如 GC4 不闪、GL16 会闪，见 2.6），名字只当编号看，以实测为准。

理解这张表就能理解大部分取舍：**快 = A2（灰色是点阵纹理，残影多），干净 = GC16（会闪）**。防闪烁是在“什么时候用会闪的全刷”上做取舍（2.3）；自动消残影 `clean_a2` 则跟波形无关，它决定驱动能不能连续刷新（2.2）。

本文两个说法的区别：**“麻点”** 指残影，是上一页没清干净留下的一颗颗**很浅很浅**的小点（点之间有空隙，要仔细看才看得出来）；**“抹布感”** 指灰色本身的显示效果：快速刷新用黑白点阵模拟灰色，看灰色区域像抹布的纹理。

---

## 2. 功能参考

每个功能固定按“作用 → 怎么设 → 原厂默认 → GSI 实测 → 注意事项”来写。以下都需要 root。

### 2.1 刷新模式 ✅

- **怎么设**：`setprop vendor.xrz.global_refresh_mode <代码>`，或者 `echo <代码> > /sys/kernel/debug/eink_debug/global_mode`（在原厂 3.4.6 上验证过，效果一样）。
- **原厂默认**：`global_refresh_mode=0`（不强制，交给 HWC，默认 NORMAL 178）；`ro.vendor.xrz.default_refresh_mode=178`（原厂代码里的 `EINK_DEFAULT_MODE` 读的就是它）。GSI 里两个都没设，同样交给 HWC，实际是 NORMAL。
- **原厂**是按应用、按图层设置刷新模式的（魔改 SurfaceFlinger 的 `setLayerRefreshMode`），GSI 做不到，只能全局切；想按应用切换，就由工具监听前台 App。
- **常用模式**：177 HD、180 REGAL、**178 NORMAL**（默认）、179 FAST、183 HYPER。刷新模式决定刷新速度，从慢到快是 **高清256 / HD → NORMAL（原厂“快刷”）→ FAST（“极速”）→ HYPER（“Hyper”）**，越快画质越差、残影越多；REGAL（原厂“Regal”）在 GSI 里等于 HD（见下表）。括号里是原厂墨水屏设置里的名称。依据是使用经验：高清256 最慢、快刷比极速慢、Hyper 最快；“快刷 = NORMAL、极速 = FAST”是按名字和顺序推断的，没查原厂代码确认。`clean_a2`（2.2）也会影响帧速，开了更流畅。Hyper 模式原厂还会把系统帧率设成 120（见 2.8）。
- **各模式实际送给驱动的参数**（GSI 实测，滑动时看驱动每帧日志）：

  | 设的模式 | HWC 送给驱动的模式 | 实际波形 | 驱动默认的灰度显示方式 |
  |---|---|---|---|
  | HD 177 | 177 | GU16 | 0（不做点阵，直接显示灰色） |
  | REGAL 180 | **177（被当成 HD）** | GU16 | 0 |
  | NORMAL 178 | 178 | DU | 3（点阵 2） |
  | FAST 179 | 179 | A2 | 3（点阵 2） |
  | HYPER 183 | **直接送 A2 波形** | A2 | 3（点阵 2） |

  - **GSI 里 REGAL 等于 HD**（复测过）。原因应该是这块屏不支持 REGAL：原厂 `XrzEinkManager.java` 报告的 `support_regal` 取的是 `ro.vendor.xrz.support_sunina_hw`，原厂 build.prop 里它是 0（`vendor.xrz.regal_support=1` 虽然也读了，但没用上）。HWC 和 `libimage_process.so` 里也搜不到 `regal`。原厂漫画模式（180）大概率也是 HD，只是还叠加了对比度、鲜艳增强，看起来不一样（原厂上没抓驱动日志验证）。
  - **高清256**（`-2147483471` = HD + 256 灰阶标志，原厂“全部高清256”和杂志情景模式用的都是它）✅：`setprop vendor.xrz.global_refresh_mode -2147483471`，恢复用 `resetprop --delete vendor.xrz.global_refresh_mode`。效果是有灰阶、没残影、刷新慢。单独设 HD 看起来也一样，因为驱动在 HD 下默认就不做点阵；区别只有两点：高清256 由 HWC 指定 256 灰阶（日志 `dither=4(def=4)`，HD 是 `dither=0(def=0)`），而且**切进高清256 时 HWC 会先自动做一次 GC16 全刷**（日志第一帧就是 GC16），切进 HD 或 REGAL 时不会。所以这一档用高清256。
  - FAST 和 HYPER 波形相同，HYPER 更快应该是 HWC 送帧方式和系统帧率（2.8）的差别。

**刷新模式代码**（原厂 `EinkRefreshMode.java`，加上新版的 Hyper）：

| 代码 | 名称 | 代码 | 名称 |
|---|---|---|---|
| 1 | INIT | 176 | CLEAN |
| 2 | DU | **177** | **HD** |
| 4 | GC16 | **180** | **REGAL** |
| 8 | GC4 | **178** | **NORMAL**（原厂默认） |
| 16 | A2 | **179** | **FAST** |
| 32 | GL16 | **183** | **HYPER**（3.4.6 新增） |
| 64 / 128 | GLR16 / GLD16 | 137 | INPUT（输入法） |
| 132 / 136 | GU16 / GU4 | 1029 / 1030 | 手写 / 橡皮擦 |
| 32768 | AUTO | 1024 | RECT（矩形区域刷新，用途不明） |
| **-2147483471** | **HD_256**（高清256：HD + 256 级灰度） | | |

- **数值的高位是 HWC 标志**（原厂 `EinkRefreshMode.java` 里的 `HWC_EINK_*` 常量）。其中**最高 3 位（第 29～31 位）是灰度显示方式**，跟 `global_dither` 节点的 1～4 一一对应（见 2.7）：

  | 常量 | 值 | 灰度显示方式 | 对应 `global_dither` |
  |---|---|---|---|
  | `HWC_EINK_DITHER_TEXT_EFFECT` | `536870912` | 二值化（纯黑白，效果跟模式有关，见 2.7） | 1 |
  | `HWC_EINK_DITHER_PICTURE1_EFFECT` | `1073741824` | 点阵 1 | 2 |
  | `HWC_EINK_DITHER_PICTURE2_EFFECT` | `1610612736` | 点阵 2（NORMAL、FAST、HYPER 下的驱动默认） | 3 |
  | `HWC_EINK_DITHER_256_EFFECT` | `2147483648` | 256 级灰度 | 4 |

  刷新模式 = 基础模式 + 灰度标志，例如 HD（177）+ `DITHER_256`（2147483648）= 2147483825，超出了属性能存的整数范围，按 32 位有符号整数换算就是高清256 的 `-2147483471`；NORMAL（178）+ 二值化（536870912）= `536871090`。

  ⚠️ 标志不是随便组合都有效，HWC 会按模式过滤（实测见 2.7）。
- 其他标志是原厂 SurfaceFlinger 给特定图层打的标记，GSI 没法设置，了解即可：`SURFACEVIEW`（65536，视频等）、`FORCE_REFRESH`（131072）、`HANDWRITTEN`（262144）、`HOME`（524288，桌面）、`HANDWRITTEN_BG`（1048576）、`MULTI_DAMAGE`（2097152，多区域刷新）、`INPUT_METHOD`（4194304）、`AUTO_DITHER`（8388608）、`DISABLE_LAYER`（16777216）、`OVERLAY`（33554432）、`LOGO`（67108864）、`CURSOR`（134217728）、`SKIP_FRAME`（-1）。

### 2.2 自动消残影（连续刷新）`clean_a2` ✅（模块已设）

- **作用**（原厂叫“自动消残影”）：① 滑动时允许驱动**连续刷新**；② 停下后用同一种快速波形把最终画面**再多刷几遍**，压掉滑动时积下的残影，**不闪屏**。**GSI 滑动卡顿的根本原因就是它默认是 0。**
- **怎么设**：`echo 1 > /sys/kernel/debug/eink_debug/clean_a2`（只能写节点，setprop 没用，见 5.1）。
- **原厂默认**：开。原厂由 system 的 JNI 直接写节点，同时设属性 `vendor.xrz.auto_clean_enabled=1`（这个属性单独设没用）。
- **原理**（用 `print_level=1` 打开驱动详细日志，对比 0 和 1 时滑动、停下的过程，测了多次结果一致）：

  | | `clean_a2=1` | `clean_a2=0` |
  |---|---|---|
  | 滑动时 | 新帧直接插进正在进行的刷新（日志 `new insert handwritting/video`，驱动把它当成手写 / 视频这类连续画面），不用等上一帧刷完 | 每次都要等上一帧刷完，再刷下一帧 |
  | 屏幕电源芯片 | 滑动期间一直开着，停下后才关 | **每刷一次就关一次**，下一帧再重新上电（每次上电要等好几个 10 毫秒） |
  | 实际刷新次数 | 跟得上 HWC 送帧，大部分帧都刷了（例：送 71 帧，刷 39 次） | 跟不上，中间的帧被跳过（例：送 74 帧只刷 21 次；单次滑动送 41 帧只刷 10 次） |
  | 起始帧和停下后的最后一帧 | **各多刷几遍**（实测 4 遍，约 0.5 秒），把画面压实、压掉滑动时积下的残影 | 都只刷 1 遍 |
  | 波形 | DU | DU |
  | 会闪的全刷（GC16） | 没有 | 没有 |

  - 所以卡顿**跟波形无关**，跟“能不能连续刷新”有关；原厂叫它“自动消残影”，指的就是停下后多刷几遍、不闪屏的清理。
  - 起始帧多刷几遍的原因是推测：驱动从静止进入连续刷新时，先把起始画面压实一次。
- **跟刷新模式的关系**：刷新模式决定刷新速度（2.1），`clean_a2` 在此基础上影响帧速，两者是叠加的。
- **注意**：GSI 开机默认是 0。模块开机时写 1，工具不要把它写成 0。

### 2.3 防闪烁 `anti_flicker`（取舍，模块没设）

- **作用**：减少浅灰区域刷新时的闪烁。代价是清残影不彻底。
- **怎么设**：`echo <等级> > /sys/kernel/debug/eink_debug/anti_flicker`。
- **节点其实是“等级”，不是开关**：内核函数叫 `set_anti_flicker_level`，dmesg 显示 `set anti flicker level to N`。0、1、2、3、5、10 都能写进去，上限不明。
- **原厂默认**：1。原厂只设属性 `vendor.xrz.anti_flicker_enabled`，节点由 HWC 写（GSI 里写不进去，见 1.2）。
- **GSI 实测**（在同一个会闪的界面来回对比）：

  | 等级 | 浅灰区域刷新 | 残影 / 麻点 |
  |---|---|---|
  | 0（GSI 开机默认） | 会闪 | 最干净 |
  | 1（原厂默认） | 不闪 | 有一些：关掉浅灰色页面后，原来那块区域会残留麻点 |
  | 2 | 不闪 | 麻点更多 |

- **原理**：浅灰区域的“闪”来自会闪的灰阶全刷；清残影也要靠这种全刷。等级越高越倾向于不闪，清残影就越不彻底。**“麻点”就是没清干净的残影**（一颗颗很浅的小点，要靠会闪的全刷才能清掉），不是防闪烁自己产生的。
- **结论**：实际可选的只有 0 和 1。选 1 的话，可以配合手动全刷（2.6）清掉麻点。
- 防闪烁跟滑动速度无关。

### 2.4 垂直同步 `disable_eink_vsync` ✅（模块已设）

- **作用**：HWC 送画面时不等墨水屏驱动发回“上一帧刷完了”的信号。
- **怎么设**：`setprop vendor.xrz.disable_eink_vsync 1`，立即生效。
- **原厂默认**：1（写在原厂 build.prop 里，GSI 里丢了）。
- **GSI 实测**：**滑动更平滑**。`clean_a2=1` 时效果明显；`clean_a2=0` 时驱动每帧都要等刷完、断电再上电（2.2），省下的这点等待时间被卡顿掩盖，看不出来。
- 相关但没测：`vendor.xrz.disable_eink_vsync_for_fast`（只对快速模式）❓。

### 2.5 抗锯齿 `anti_alias`

- **怎么设**：`echo 1 > /sys/kernel/debug/eink_debug/anti_alias` 开，`echo 0` 关。
- **读写格式不一样**：读出来是 `support value` 两个数（第一位固定 1 = 驱动支持，第二位才是开关，比如 `1 0` = 关）；**写入只认一个数字**。写 `"1 0"` 驱动只会读到前面的 1，结果是**打开**。dmesg 里能看到 `set anti-alias off`。
- **原厂默认**：开。原厂规则：**只在 NORMAL（178）模式下打开**，其他模式一律关；属性 `vendor.xrz.anti_alias_enabled` ≥ 0 时优先用它。
- **GSI 实测**：开和关画面都看不出区别。GSI 开机默认关，模块没管它。

### 2.6 全屏刷新一次（清残影）✅

- **怎么做**：
  ```sh
  setprop vendor.xrz.force_global_refresh_mode 4     # 4 = GC16 全刷（驱动日志已确认）
  service call SurfaceFlinger 1004                   # 让系统重绘一帧（= SurfaceComposerClient::repaintEverything）
  sleep 0.6
  setprop vendor.xrz.force_global_refresh_mode -1    # -1 = 不强制（原厂默认）
  ```
- **原厂的做法**（3.4.6 反汇编 `libXrzFramework_runtime.so` 的 `nativeForceGlobalRefresh`）：只做两步，设 `force_global_refresh_mode=<模式>`，再调用 `SurfaceComposerClient::repaintEverything()`，**不负责改回 -1**。改回 -1 是 **HWC 刷完后自己做的**。原厂自己调用时传的模式是 0（`DisplayPolicyController.repaint()`，切换情景模式后重绘整屏）。
- ⚠️ **GSI 里一定要手动改回 -1**：HWC 刷完会尝试把它改回 -1，但 GSI 里 SELinux 不允许 HWC 写属性（logcat：`Unable to set property "vendor.xrz.force_global_refresh_mode" to "-1"`），改不回去。不手动改的话，之后**每次画面更新都会用这个模式全刷**，画面静止时看不出来，一滑动就连续闪。（跟 3.1 的 `fps_limit` 是同一个原因。）
- **值的含义**（属性值就是这次全刷用的刷新模式，跟 2.1 的代码表是同一套）：

  | 值 | 驱动用的波形 | 屏幕表现 | 用途 |
  |---|---|---|---|
  | -1 | — | — | 不强制（原厂默认、正常状态） |
  | 0 | 当前模式（NORMAL 时是 DU） | 不闪 | 原厂切换情景模式后重绘整屏 |
  | 4 | **GC16** | **闪**一两下，残影清干净 | 手动全刷、清残影（推荐） |
  | 32 | GL16 | **闪**一两下，跟 4 看起来差不多 | 可以代替 4 |
  | 1 | INIT | **闪**，而且明显慢得多 | 屏幕初始化用的波形，不适合日常全刷 |
  | 2 | DU | 不闪 | — |
  | 8 | GC4 | 不闪 | — |
  | 16 | A2 | 不闪 | — |
  | 64 / 128 | GLR16 / GLD16（驱动都换成 GU16） | 不闪 | — |
  | 132 | GU16 | 不闪 | — |
  | 136 | GU4 | 不闪 | — |

  每次强刷驱动都是整屏刷 2～4 帧。偶尔重绘请求不出帧（屏幕没反应、驱动日志里也没有 `update image`），再执行一次就行。

- 用途：清掉残影和麻点（比如防闪烁设成 1 之后）。

### 2.7 灰度显示方式（dither）

灰度显示方式（灰色怎么显示）有两种设法：

| 设法 | 怎么设 | 特点 |
|---|---|---|
| **刷新模式 + 灰度标志**（推荐，原厂的做法） | `setprop vendor.xrz.global_refresh_mode <基础模式 + 标志>`（计算方法见 2.1） | 交给 HWC 处理，HWC 会配合（比如切进高清256 先自动全刷一次）。但 HWC 会按模式过滤，不是所有组合都有效 |
| **驱动节点 `global_dither`**（调试开关，原厂不用） | `echo <值> > /sys/kernel/debug/eink_debug/global_dither` | 在驱动层**强制覆盖**灰度显示方式：HWC 没指定时用它，HWC 指定了也会被它盖过。测试完记得改回 0 |

`gray_256_dither` **不是设置项**，是 HWC 报告的状态（3.1）：当前是 256 灰阶时 HWC 写 4，否则写 0，不要用它来控制。

**实测的组合**（驱动日志看 `mode=…,dither=…`）：

| 组合 | 值 | 驱动日志（十六进制，对照见 5.3） | 效果 |
|---|---|---|---|
| HD + 256 灰阶（高清256） | `global_refresh_mode=-2147483471` | `mode=0xb1(map=0x84),dither=4` ✅ | 有灰阶、没残影、刷新慢 |
| NORMAL + 二值化 | `global_refresh_mode=536871090` | `mode=0xb2(map=0x2),dither=1` ✅ | **纯黑白**（跟 `global_dither=1` 效果一样） |
| FAST + 二值化 | `global_refresh_mode=536871091` | `mode=0xb3(map=0x11),dither=1` ✅ | 刷新很快，但**不是纯黑白**，灰色还是点阵纹理（“抹布感”） |
| FAST / HYPER + `global_dither` 任意值 | `global_refresh_mode=179` 或 `183` + 节点写 0～4 | FAST 写 1 时 `mode=0xb3(map=0x11),dither=0(def=1)` | ❌ 都没效果，跟默认看起来一样 |
| 高清256 + `global_dither=1` | `global_refresh_mode=-2147483471` + 节点写 1 | `mode=0xb1(map=0x84),dither=4(def=1)` | **纯黑白**，灰阶没了：节点盖过了 HWC 指定的 256 灰阶 |
| NORMAL + 256 灰阶 | `global_refresh_mode=-2147483470` | `mode=0xb2(map=0x2),dither=0` ❌ | 标志被 HWC 忽略。推测 256 灰阶只允许配合 HD（不全刷残影太重） |

结论：
- **灰度显示方式的实际效果取决于刷新模式**：同样是二值化（1），HD、REGAL、NORMAL 下是纯黑白；FAST（A2 波形）、HYPER 下**所有灰度显示方式都没效果**，只能显示点阵纹理（抹布感）。不管用标志还是节点，结果一样；
- 想要“纯黑白”：HD、REGAL、NORMAL 下设 `global_dither=1`（NORMAL 也可以直接用组合值 `536871090`）；**FAST、HYPER 下做不到**。

**`global_dither` 各值的效果**（新 vendor 实测，刷新模式 NORMAL、`clean_a2=1`。在其他模式下驱动也会采用这个值，但实际效果取决于模式，FAST / HYPER 下所有值都看不出变化，见上表）：

  | 值 | 灰色怎么显示 | 效果 |
  |---|---|---|
  | 0（默认） | 不强制，用驱动默认类型，**跟模式有关**：HD、REGAL 是 0（不做点阵），NORMAL、FAST、HYPER 是 3（点阵 2）（2.1） | NORMAL 等模式下是黑白点阵模拟灰度（看灰色像“抹布”的纹理），日志 `dither=0(def=3)`；HD 下直接显示灰色，日志 `dither=0(def=0)` |
  | 1 | 二值化 `DITHER_TEXT` | **只有纯白保持白，其他颜色（包括很浅的灰）都变纯黑**。文字最黑最实；有灰色元素的界面会出现大片黑块，只适合纯白底黑字。 |
  | 2 | 点阵 1 `DITHER_PICTURE1` | 文字基本不变，**图片灰阶层次变少** |
  | 3 | 点阵 2 `DITHER_PICTURE2` | 图片灰阶层次中等（NORMAL、FAST、HYPER 的驱动默认值，这几个模式下跟 0 一样） |
  | 4 | **256 级灰度** `DITHER_256`（像素本身是灰色，不用点阵） | 图片层次最好，但**残影很重**：灰阶像素局部刷新时清不干净。 |

- **4（256 灰阶）要配合 HD**：单独设 4（比如 NORMAL 下）残影很重；HD 下本身就是灰阶，直接用高清256（2.1）。
- 新 vendor 上 2、4 都不卡（旧 vendor 上会很卡）。
- `gpu_dither` 在 GSI 里无效（见第 3 节）。

### 2.8 帧率

| 设置 | 怎么设 | GSI 实测 |
|---|---|---|
| 帧率限制 | `setprop vendor.xrz.fps_limit <每秒帧数>`，恢复用 `setprop vendor.xrz.fps_limit ""` | ✅ 设 5 时滑动明显卡顿（旧 vendor）。⚠️ GSI 里设了会一直生效（3.1） |
| 帧率分档 | `persist.vendor.xrz.fps` / `fps_high` / `fps_low`，原厂 120 / 50 / 40 | 没看出改善（只在 `clean_a2=0` 时测过，效果可能被掩盖）。`persist` 属性会一直保留，删除用 `resetprop -p --delete` |
| 系统帧率（Hyper） | `settings put system min_refresh_rate 120`（不需要 root） | ❓ 没测。原厂规则：Hyper（183）设成 `persist.vendor.xrz.fps`（120），其他模式设 60 |

### 2.9 翻页动画、页面滑动优化

**翻页动画**（类似 Kindle，原厂只在部分情景模式下提供）❓ 没测：

| 项目 | 关 | 从左到右 | GSI 里 |
|---|---|---|---|
| `vendor.xrz.eink_animation_mode` | 0 | 1 | HWC 会读 |
| 节点 `eink_debug/eink_animation` | 0 | 1 | 原厂由 HWC 按属性写；GSI 里节点只读，要手动写 |

其他方向对应的值没测。

**页面滑动优化**（原厂“应用优化”页里的开关，跟翻页动画是两个独立的设置），由原厂 framework 在 App 进程里处理（`XrzEinkManagerInternal.checkScroll`）：

| 设置 | `vendor.xrz.scroll_flip_type` | 原厂做法 | GSI 里 |
|---|---|---|---|
| 关 | 0 | — | — |
| 智能刷新 | 1 | 手指拖动超过 10 像素时设 `vendor.xrz.is_scrolling=1`（HWC 会读），抬手后按滑动速度延迟 400～2000 ms 再设回 0。用来防止在高清、Regal 模式下滑动时闪烁 | 设 `scroll_flip_type` 本身没用；工具可以自己在滑动时设 `is_scrolling` 来模拟（单独设 `is_scrolling=1` 时滑动速度没变化，画质效果没测） |
| 整屏翻页 | 2 | 调用原厂改过的 `View.setScoling()` | ❌ GSI 没有这个接口（用户自己的工具已有更好的实现） |

### 2.10 加深（代替对比度）：SurfaceFlinger 颜色矩阵 ✅

公式：`输出 = 1 - k × (1 - 输入)`。**白色保持白色，灰色按比例加深**，亮度低于 `1 - 1/k` 的灰色直接变黑（k=1.5 时约 0.33）。
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
- ⚠️ 安卓的护眼模式、颜色校正、灰度也用这个颜色变换通道，切换它们时可能会冲掉你的矩阵，工具里最好有“重新应用”。
- 这台机器所有图层都走 GPU 合成（`composition=CLIENT`），所以颜色矩阵一定会生效。

### 2.11 字体加粗 ✅（不需要 root）

原厂的 `persist.vendor.xrz.global_fonts_weight` 依赖原厂改过的 Typeface 类，GSI 里无效。改用安卓自带的全局字重调节：
```sh
adb shell settings put secure font_weight_adjustment 500   # 最粗：常规文字 400 → 900（Black）
adb shell settings put secure font_weight_adjustment 300   # 等于 设置 → 无障碍 →“粗体文字”
adb shell settings put secure font_weight_adjustment 0     # 关闭（系统默认）
```
- 所有文字的字重都加上这个值，最大到 1000。ponces 16 的中文字体 `NotoSansCJK-Regular.ttc` 是**可变字体**（100～900），所以中文也能变粗；**900 是上限，500 就是最粗效果**。
- 实测 500 比 300 明显更粗。**重启后保留**。
- 在系统设置里切换“粗体文字”开关，会把它重置成 300 或 0。
- 工具里修改需要 `WRITE_SECURE_SETTINGS` 权限（`adb shell pm grant <包名> android.permission.WRITE_SECURE_SETTINGS` 授予一次），或者用 root 执行。

### 2.12 前光（冷光 / 暖光）✅

```sh
L=/sys/devices/platform/11d01000.i2c7/i2c-7/7-0036
echo 20 > $L/lm3630a_warm_light    # 暖光，0～254，0 = 关
echo 0  > $L/lm3630a_cold_light    # 冷光，0～254，0 = 关
```
- 需要 root。前光芯片是 TI **LM3630A**（双通道，i2c7 总线，地址 0x36），同目录下还有 `lm3630a_version`。
- 原厂用 `settings system screen_brightness_cold/warm` 记住亮度，**GSI 里没有服务读它们**，只能当作“保存当前值”的地方，开机后由工具读出来再写回节点。
- 锁屏关前光见 6.1。

---

## 3. 无效的属性、不是设置项的属性

### 3.1 HWC 自己写的属性（状态报告、用完自动复位的请求）

前三个是 HWC 报告的状态，不是设置项；后两个是请求，设了有效，但原厂 HWC 用完会自己复位。在 GSI 的 logcat 里能看到 HWC 不停地写这些属性，但 SELinux 不允许 HWC 写 `vendor_default_prop`，所以都报 `Unable to set property ... PERMISSION_DENIED`：

| 属性 | HWC 写的值 | 说明 |
|---|---|---|
| `hwc_idle` | 画面静止 1 / 刷新中 0 | 原厂 `DisplayPolicyService` 每秒读一次：为 0 时持有 4 秒唤醒锁，防止刷新途中休眠。**跟画质无关**，手动设没用 |
| `cur_fps` | 3、4、8、12… | 当前帧率报告 |
| `gray_256_dither` | 当前是 256 灰阶时 4，否则 0 | **当前灰度显示方式的报告**（实测：杂志模式下 HWC 写 4，默认模式写 0；原厂 system 代码里没有任何地方设置它）。原厂快照里杂志模式是 4，就是 HWC 写上去的 |
| `fps_limit` | 反复写回 0 | 像是“一次性请求”：HWC 读到后再清零。原厂上 setprop 会马上被清掉；GSI 里清不掉，所以 setprop 后会**一直生效**（2.8） |
| `force_global_refresh_mode` | 刷完后写回 -1 | 全刷请求：HWC 执行完一次全刷就复位。GSI 里复位失败，所以要手动改回 -1（2.6） |

**可以改进（还没做）**：在 Magisk 模块里加一条 SELinux 规则（`sepolicy.rule`），允许 HWC（`hal_graphics_composer_default`）设置 `vendor_default_prop` 类属性。这样 HWC 就能像原厂一样自己复位上面这些请求、更新 `hwc_idle` / `cur_fps` 状态，GSI 的行为会更接近原厂，工具里也不用手动复位了。

### 3.2 GSI 里无效的

| 属性 / 节点 | 原厂用途 | 为什么无效 / 实测 |
|---|---|---|
| `vendor.xrz.global_contrast` | 对比度 | 原厂 SurfaceFlinger / `libxrzUtil.so` 处理，HWC 不读。用颜色矩阵代替（2.10） |
| `vendor.xrz.global_brightness_level` | 墨水浓度（不是前光） | ❌ 实测设 80、0 墨色都没变化（原厂默认 20） |
| `vendor.xrz.global_color_enhance`、`global_text_enhance`、`persist.vendor.xrz.global_dark_level` | 鲜艳增强、文字增强、加深 | 原厂 SurfaceFlinger / `libxrzUtil.so` 处理，HWC 里没有这些名字（没逐个实测） |
| `vendor.xrz.gpu_dither` | 原厂 GPU 灰度处理（杂志 1，Hyper 2，其他 0） | HWC 和 `libimage_process.so` 都没引用 |
| `vendor.xrz.enable_gpu_image_process`、`regal_support` | 原厂 build.prop 默认 1 | HWC 和 `libimage_process.so` 都没引用 |
| `vendor.xrz.scroll_flip_type` | 页面滑动优化 | 原厂 framework 在 App 进程里读（2.9） |
| `vendor.xrz.clean_frequency` | 原厂“刷新频率”：开了刷新设置时 = 策略里的 `refreshFrequency`，否则 0 | ❌ 实测 -1、5、43 都没看到周期性全刷，麻点也没被清掉 |
| `vendor.xrz.enable_home_clean` | 回桌面清屏 | ❌ 回桌面没闪（旧 vendor） |
| `vendor.xrz.hwc.color_restoration_suppoort` | 原厂 build.prop 默认 1 | ❌ 设不设画面都看不出区别（属性名里 `suppoort` 是原厂的拼写错误） |
| `vendor.xrz.hwc.image_smoothing_suppoort`、`hwc.enable_image_smoothing` | 图像平滑，原厂默认 0（不支持） | ❌ 没看出变化 |
| `vendor.xrz.driver_color_enhance` | — | ❌ 没变化 |
| 节点 `contrast` / `brightness` / `saturation` | — | ❌ 写 0～255 画面没变化，`brightness` 也不是前光；原厂也不用这些节点 |
| `persist.vendor.xrz.global_fonts_weight` | 原厂字体粗细 | 依赖原厂 Typeface，用安卓自带字重代替（2.11） |

### 3.3 还没测的

`vendor.xrz.color_restoration_enabled`（颜色还原）、`disable_eink_vsync_for_fast`、`disable_cursor_blink`（原厂在 178、179 以外的模式设 1，关光标闪烁）、翻页动画（2.9）、Hyper 的 120Hz（2.8）。

---

## 4. 原厂情景模式参考

纯原厂数据，用来在工具里模拟“情景模式”。GSI 能用哪些见第 2 节。

### 4.1 各模式的参数（3.4.6 实测抓取）

在“系统设置”App 里切换。`appColorMode` 和 `vendor.xrz.global_color_mode` 相同：**默认 0、杂志 1、漫画 2、视频 3、自定义 4**。

色彩相关（属性名省略了前缀 `vendor.xrz.global_`，GSI 里无效）：

| 模式 | `contrast` 对比度 | `color_enhance` 鲜艳增强 | `text_enhance` 文字增强（隐藏预设） |
|---|---|---|---|
| 默认 | 20 | 0 | 50 |
| 杂志 | 25 | 50 | 50 |
| 漫画 | 30 | 60 | 50 |
| 视频 | 20 | 0 | **0** |
| 自定义 | = 对比度滑块 | = 鲜艳增强滑块 | 不变 |

`text_enhance`（文字增强）是每个情景模式**内部预设的值**（策略字段 `appTextEnhance`），3.4.6 的情景模式界面里**没有这个设置项**。界面上能看到的“文字增强”只有“应用漂白”里那一项，那个用的是安卓原生的高对比度文字（见 4.2），跟这里不是同一个东西。

刷新和灰度相关：

| 模式 | 刷新模式 | `gray_256_dither`（HWC 报告的状态） | `gpu_dither` | 防闪烁 | 自动消残影 | 抗锯齿 |
|---|---|---|---|---|---|---|
| 默认 | 178 NORMAL | 0 | 0 | 开 | 开 | 开 |
| 杂志 | `-2147483471`（高清256：HD + 256 灰阶） | **4** | **1** | 关 | 关 | 关 |
| 漫画 | 180 REGAL | 0 | 0 | 关 | 关 | 关 |
| 视频 | 179 FAST | 0 | 0 | 开 | 开 | 关 |
| 自定义 | 按设置 | 0 | **2**（Hyper 时） | 按开关 | 按开关 | 关 |

**自定义模式实测**（刷新 Hyper、对比度 50、鲜艳增强 30、亮度 60、防闪烁和自动消残影都开）：
- **Hyper = 刷新模式 183 + 系统帧率 120Hz**：`settings system min_refresh_rate` 从 `60` 改成 `120`（`persist.vendor.xrz.fps=120`）。
- **亮度（墨水浓度）= `vendor.xrz.global_brightness_level`**（滑块 60 → 60，默认 20），不是前光。
- 对比度 → `global_contrast`，鲜艳增强 → `global_color_enhance`（应该是彩屏用的）。

**“应用优化”页的其他设置**（原厂 system 按 App 处理，GSI 里没有）：DPI 设置（`appDpi`）、应用漂白里的文字增强（`appBleachTextPlus`，实现方式是打开安卓原生的高对比度文字 `high_text_contrast_enabled`）、图标颜色（`appBleachIconColor`）、背景颜色（`appBleachBgColor`）。

### 4.2 原厂切换模式时的换算规则（3.4.6 源码 `DisplayPolicyController.applyDisplayPolicy`）

| 项目 | 原厂做法 |
|---|---|
| 刷新模式 | 魔改 SurfaceFlinger 的 `setLayerRefreshMode(包名, 模式)`，按图层设置 |
| 刷新频率 | 打开“刷新设置”时 `clean_frequency` = 策略里的 `refreshFrequency`，否则 0 |
| 自动消残影 | `auto_clean_enabled` 属性 + JNI 直接写 `clean_a2` |
| 防闪烁 | 只设 `anti_flicker_enabled`，节点由 HWC 写 |
| 抗锯齿 | 只在 NORMAL（178）模式下打开；属性 `anti_alias_enabled` ≥ 0 时优先用它 |
| 翻页动画 | 只设 `eink_animation_mode`，节点由 HWC 写 |
| 光标闪烁 | 178、179 模式 `disable_cursor_blink=0`，其他模式设 1 |
| 文字增强（隐藏预设） | 刷新模式不是 179 时才设 `global_text_enhance` |
| 鲜艳增强 | 178、179 模式强制 0 |
| `gpu_dither` | 杂志模式 1，Hyper 2，其他 0 |
| 系统帧率 | Hyper：`min_refresh_rate` = `persist.vendor.xrz.fps`（120）；其他模式 60 |
| 漂白文字加粗 | 安卓自带的 `high_text_contrast_enabled` |

注意：策略里的 `appAutoClean`、`appAntiFlicker` 是**反的**，0 = 开、1 = 关。

### 4.3 其他原厂设置

- **原厂开机后的其他属性值**：`force_global_refresh_mode=-1`（-1 = 不强制）、`clean_frequency=0 或 -1`、`disable_eink_vsync=1`、`enable_gpu_image_process=1`、`persist.vendor.xrz.fps=120`、`fps_high=50`、`fps_low=40`。
- 各模式的预设刷新模式：`sys.maga_refresh_mode=-2147483471`（杂志）、`sys.comic_refresh_mode=180`（漫画）、`sys.video_refresh_mode=179`（视频）。

### 4.4 原厂 `/system/build.prop` 里的墨水屏属性

| 属性 | 原厂值 | GSI 里 |
|---|---|---|
| `ro.vendor.xrz.default_refresh_mode` | 178 | 不设时读到 0，交给 HWC，实际还是 NORMAL（178） |
| `vendor.xrz.disable_eink_vsync` | 1 | ✅ 模块已补回（2.4） |
| `persist.vendor.xrz.fps` / `fps_high` / `fps_low` | 120 / 50 / 40 | 见 2.8 |
| `vendor.xrz.hwc.color_restoration_suppoort` | 1 | ❌ 没区别（3.2） |
| `vendor.xrz.hwc.image_smoothing_suppoort` | 0 | ❌ 没区别 |

其他：`vendor.xrz.enable_gpu_image_process=1`、`vendor.xrz.regal_support=1`、`vendor.xrz.disable_inputmethod_fullscreen=1`、`vendor.xrz.bootanimation_refresh_mode=180`、`vendor.xrz.logo_refresh_mode=-2147483471`、`ro.sf.lcd_density=300`（vendor 里也有）。`ro.vendor.xrz.default_*`、`support_*`、`pen_type` 等是给原厂 App 和框架用的。

---

## 5. `eink_debug` 驱动节点

### 5.1 节点表（3.4.6，驱动 v5.19）

位置 `/sys/kernel/debug/eink_debug/`，在 debugfs 下，需要 root。如果没挂载：`mountpoint /sys/kernel/debug || mount -t debugfs debugfs /sys/kernel/debug`。GSI 里大部分节点都是只读权限（`print_level`、`save_level`、`enable` 例外），只有 root 能写。

| 节点 | 读到的值 | 含义 | 详见 | 风险 |
|---|---|---|---|---|
| `global_mode` | `mode=0x0` | 全局刷新模式，可直接写模式代码 | 2.1 | 低 |
| `clean_a2` | `clean_a2=0/1` | 原厂叫“自动消残影”：滑动时允许连续刷新，停下后把最终画面多刷几遍压残影（1 = 滑动流畅） | 2.2 | 低 |
| `anti_flicker` | `anti_flicker=N` | 防闪烁**等级** | 2.3 | 低 |
| `anti_alias` | `1 0` | 抗锯齿（读 `support value`，写单个数字） | 2.5 | 低 |
| `eink_animation` | `eink_animation=0/1` | 翻页动画（新版新增） | 2.9 | 低 |
| `global_dither` | `dither=0x0` | 驱动层强制覆盖灰度显示方式（会盖过 HWC 指定的类型），HD / REGAL / NORMAL 下 1 = 纯黑白 | 2.7 | 低 |
| `contrast` / `brightness` / `saturation` | 0 | 写入后看不出效果，原厂也不用 | 3.2 | 低 |
| `manual_refresh` | `init=0,pos(0,0,0), neg(0,0,0),loop=0` | 手动刷新？用法不明 | — | 低 |
| `frame_data` | `frame_mode=0x4` | 帧数据 / 模式信息 | — | 只读 |
| `sys_update` | 1 | 不明 | — | 中 |
| `temperature` | 29～31 | 面板温度（用来选波形） | — | 中 |
| `enable` | 1 | 墨水屏驱动开关 | — | ⚠️ **高，写 0 可能黑屏** |
| `vcom` | -1860 | 面板公共电压，出厂校准值 | — | ⚠️ **高，不要改** |
| `waveform` / `machine_waveform` | `570_VSK029_HU0701_EC103KH3C6_SC1452-KCE_TC.awf 2024.10.7` | 当前使用的波形（机器自带） | 5.2 | ⚠️ **高，不要写** |
| `wf_ota` | 读取报错 | 波形更新 | — | ⚠️ **高，不要写** |
| `version` | `v5.19_20260521` | 驱动版本 | — | 只读 |
| `print_level` | 0 | 驱动日志详细程度，可写。设 1 会打出像素处理阶段的日志（`init pipe`、`new insert`、屏幕上电等，2.2 的分析就靠它），日志很多，用完改回 0 | 2.2 | 低 |
| `panel_type` / `dc_count` | — | 信息、调试用 | — | 只读 |
| `save_level` | — | 可写，用途不明，没测 | — | — |

**能不能用属性（setprop）控制这几个节点**：

| 节点 | 能不能用 setprop 控制 | 原厂由谁写节点 |
|---|---|---|
| `clean_a2` | ❌ 属性 `auto_clean_enabled` 只会被 HWC 读，不会写节点（实测只设属性滑动照样卡） | system 的 JNI（`nativeSetAutoCleanEnable`）直接写 |
| `anti_alias` | ❌ 属性 `anti_alias_enabled` 只有原厂 system 服务读，HWC 里没有这个名字 | system 的 JNI（`nativeSetAntialiasEnable`）直接写 |
| `anti_flicker` | 原厂可以（`anti_flicker_enabled`），**GSI 里不行**（节点只读，HWC 写不进去） | HWC 按属性每帧写 |
| `eink_animation` | 原厂可以（`eink_animation_mode`），**GSI 里不行**（同上） | HWC 按属性每帧写 |

所以在 GSI 里这 4 个节点都只能用 root 直接写（`echo <值> > /sys/kernel/debug/eink_debug/<节点>`）。如果用模块把 `anti_flicker`、`eink_animation` 改成 `0666`，HWC 就能按属性接管，但手动写的值也会被它覆盖（见 1.2）。

### 5.2 `/system/eink_key`

- 原厂 system 分区里的一个 5.4 MB 文件，文件头是另一个波形：`470_VSF009_HM7F01_EC103KH2C1_SC1452-KCD_TC.awf 2023.05.11`。1.9.6 和 3.4.6 两个版本的文件完全一样。
- 驱动每次刷新都会去读它做校验。GSI 里没有这个文件，所以 logcat 每帧都有 `fail to open waveform file(/system/eink_key)` 和 `eink_pre_process: eink verify fail`。
- 驱动实际用的还是机器自带的波形（5.1 的 `waveform` 节点）。校验失败具体会影响什么还不清楚 ❓ 没测。
- 原厂文件已提取到 `D:\BIGME\B651_CN_3.4.6_system\files\system\eink_key`，需要时可以用 Magisk 模块放到 `/system/eink_key` 测试。

### 5.3 驱动每帧日志（排查用）

`logcat -b all | grep "update image"` 能看到当前实际生效的参数：
```
update image: order=6852,panel=0,mode=0xb2(map=0x2),dither=0(def=3),an=0,area(0,0)~(1647,823),auto_clean(1, 1, 0)
```
`mode=0xb2` 是上层要求的刷新模式（178 NORMAL），`map=0x2` 是驱动换算后的波形（DU），`dither=X(def=Y)` 是灰度显示方式：X 是 HWC 指定的类型（0 = 没指定），Y 是驱动最终用的类型（`global_dither` 节点不是 0 时就用节点的值，会盖过 X；节点是 0 时 HWC 指定了就用 X，没指定就用驱动默认值，跟模式有关：HD 是 0，NORMAL、FAST、HYPER 是 3）（2.1、2.7）；`an` 是抗锯齿，`auto_clean(...)` 的第一个数就是 `clean_a2` 的值。改了设置后看这行有没有变化，比用眼睛判断可靠。

日志里的数字是十六进制，常见的对照：

| 日志 | 含义 |
|---|---|
| `mode=0xb1` / `0xb2` / `0xb3` | 177 HD / 178 NORMAL / 179 FAST（REGAL 也显示 `0xb1`，HYPER 显示 `0x11`，见 2.1） |
| `map=0x2` | DU（NORMAL） |
| `map=0x84` | GU16（HD、REGAL、高清256） |
| `map=0x11` | A2（FAST、HYPER） |
| `map=0x4` / `0x20` / `0x1` / `0x8` / `0x88` | GC16 / GL16 / INIT / GC4 / GU4（强刷时见到，2.6） |

想看驱动内部更细的处理（实际刷新次数、屏幕电源开关），先 `echo 1 > /sys/kernel/debug/eink_debug/print_level`，再看 `dmesg`，用完改回 0。

---

## 6. 锁屏：关前光、待机画面

### 6.1 锁屏自动关前光（GSI 里要自己实现）

- **现象**：GSI 里锁屏或灭屏后前光**不会自己熄灭**（原厂是 Bigme 的系统服务处理的）。
- **做法**：工具 App 监听亮屏和灭屏，灭屏时两个前光节点写 0，亮屏时写回保存的亮度。
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

**问题**：墨水屏断电后会保留最后一帧。原生安卓按电源键后很快就断电，墨水屏上留下的是断电前的画面（“冻结画面”），原生锁屏界面来不及显示。海信 A9 的 GSI 社区也遇到过同样的问题。

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

**GSI 实测**（2026-10-17，按电源键锁屏时的日志）：

| 时间 | 事件 |
|---|---|
| 0 ms | `Going to sleep due to power_button`，开始休眠 |
| +67 ms | `Blocking screen off`：系统等锁屏界面准备好 |
| +69 ms | 墨水屏最后一次刷新（`update image`） |
| +71 ms | `Unblocked screen off after 4 ms`：锁屏界面就绪，放行断电 |
| **+110 ms** | **屏幕断电**（`Display ... OFF`，HWC `SetPowerMode(0)`） |
| +595 ms | `setPowerMode` 才返回（日志提示 `Excessive delay in setPowerMode()`） |
| **+600 ms 以后** | **`SCREEN_OFF` 广播才发出来** |

- 从按电源键到断电**只有约 110 毫秒**（原厂留了 1.5 秒），墨水屏刷一帧要几百毫秒，锁屏界面来不及刷上去：实测断电后**屏幕停在按电源键前的应用画面**，不是锁屏界面。
- **`SCREEN_OFF` 广播比断电晚约 0.5 秒**，所以“收到 `SCREEN_OFF` 再显示待机画面”**行不通**；锁屏壁纸也来不及显示。

**GSI 里的方案**：

1. ~~工具 App 收到 `SCREEN_OFF` 后显示待机画面~~ ❌ 实测来不及（见上表）。
2. **像原厂一样延迟断电（推荐）**
   - 原生安卓本来就有“断电前等一下”的机制（上表的 `Blocking screen off`，系统会等锁屏界面准备好）。用 **LSPosed 模块** hook `PhoneWindowManager.screenTurningOff()`（或 `DisplayPowerController` 对应的地方），先通知工具显示待机画面、等墨水屏刷完（约 1～1.5 秒），再放行断电；
   - 需要 Magisk + Zygisk + LSPosed。
3. **AOD（息屏显示，备选）**
   - 锁屏时屏幕进入低功耗的“息屏显示”状态，不会真正断电，系统会画 AOD 界面。Vasu 的 HiBreak 包就是这样做的（Phh 设置里的 “Force allow Always-On Display”），海信 A9 的 GSI 社区也是；
   - 缺点：**比真正关屏费电**（显示通路要保持工作，时钟和通知每分钟左右更新一次，每次都要唤醒 CPU、刷新墨水屏）；AOSP 的 AOD 是黑底白字时钟，在墨水屏上不好看，自定义要改 SystemUI。
   - 只想锁屏时显示一张固定的图，方案 2 最省电：断电前刷好，之后完全不耗电。

**复测方法**：
```sh
adb shell "su -c 'logcat -b all -c'"      # 先清空日志，然后按电源键锁屏，等几秒
adb shell "su -c 'logcat -b all -d -v time'" | grep -E "Going to sleep|Blocking screen off|Unblocked screen off|SCREEN_OFF|Display device changed state|SetPowerMode|update image"
```

---

## 7. 工具实现

### 7.1 权限

- `/sys` 和 `/sys/kernel/debug` 下的节点、`vendor.xrz.*` 属性，**普通 App 都改不了**，需要 root。推荐用 [libsu](https://github.com/topjohnwu/libsu) 保持一个常驻 root shell，然后在 Magisk 里给工具授予超级用户权限。
- 也可以像 HibreakProPatchingService 那样，写一个以 root 运行的守护进程（比如放在 Magisk 模块的 `service.sh` 里启动），App 通过本地 socket 发指令。
- `settings secure` / `settings system` 的修改（字重、帧率）只需要 `WRITE_SECURE_SETTINGS` / `WRITE_SETTINGS` 权限。

### 7.2 用 setprop 的注意事项

- **必须用 root**：普通 App 设不了 `vendor.*` 属性（属性服务会按 SELinux 规则拒绝）。工具里用 su 执行，例如 `su -c "setprop vendor.xrz.global_refresh_mode 179"`；用 libsu 就是 `Shell.cmd("setprop ...").exec()`。
- 不同前缀的属性，行为不一样：

  | 类型 | 例子 | 怎么设 | 重启后 |
  |---|---|---|---|
  | `vendor.xrz.*` | `global_refresh_mode`、`disable_eink_vsync` | `setprop`，HWC 读到后**立即生效** | 丢失。要保留就放进模块的 `system.prop`，或者工具开机时重设 |
  | `persist.*` | `persist.vendor.xrz.fps` | `setprop` | **保留**（写进 `/data/property`）。删除用 `resetprop -p --delete <名字>` |
  | `ro.*` | `ro.vendor.xrz.default_refresh_mode` | `setprop` 改不了，只能用 Magisk 的 `resetprop` 强改 | 丢失。读它的程序多半只在启动时读一次，运行中改了不一定生效 |

- 设之前先确认这个属性**在 GSI 里有效**（第 2、3 节），否则设了也没反应。
- **`fps_limit` 设了会一直生效**，不用时要清掉（3.1）；`gray_256_dither` 是 HWC 的状态报告，不要用来控制灰度显示方式，改用刷新模式的灰度标志或 `global_dither`（2.1、2.7）。
- **`force_global_refresh_mode` 设完要在约 0.6 秒后改回 -1**（2.6）。
- **别把模块管的值写成 0**：`clean_a2`、`disable_eink_vsync`（0.1）。
- **合并成一条命令执行**：写节点和设属性可以合并成一条 su 命令（用 `;` 连接），比每条命令单独开一次 su 快得多。libsu 本身就会保持一个常驻的 root shell。

### 7.3 用 GSI 模拟原厂的“情景模式”

全局切换就够用：按第 4 节的参数，挑 GSI 里有效的项一起设置，比如刷新模式（2.1，可以带灰度标志，杂志模式只要一条 `global_refresh_mode=-2147483471`）、颜色矩阵 k 值（2.10，代替对比度）、防闪烁（2.3）、抗锯齿（2.5）。需要按应用切换时，工具监听前台 App 再切。

### 7.4 抓取原厂参数的方法（以后原厂再更新时可以复用）

**在原厂系统里拍快照对比**：每切换一次设置就拍一张，再和上一次对比（脚本在 `D:\BIGME\tools\snap.sh`、`snapdiff.sh`）：
```sh
su -c 'getprop | grep -iE "xrz|eink|refresh_mode" | sort'                              # 全部 xrz 属性
su -c 'for f in /sys/kernel/debug/eink_debug/*; do echo "$f: $(cat $f)"; done'        # 驱动节点
su -c 'dumpsys xrz_display_policy_service'                                            # 每个 App 的显示策略
settings list system; settings list secure; settings list global                       # 系统设置
```

**从 OTA 包里直接看源码**（不需要刷回原厂）：
1. 用 `payload-dumper-go -p system,system_ext` 从 OTA 包的 `payload.bin` 解出镜像（ext4）；
2. 用 `D:\BIGME\tools\ext4ro.py` 从镜像里只读提取文件（`get`、`ls`、`find` 三个命令）；
3. 用 jadx 反编译 `framework.jar`、`services.jar` 里含 `xrz` 的 dex。关键类：`xrz/framework/server/DisplayPolicyController`（模式换算规则）、`DisplayPolicyService`、`xrz/framework/manager/XrzEinkManagerInternal`（属性读写）。

### 7.5 已实现的调试工具（EinkTool）

- 工程在 `D:\Develop\Android\eink-tool`，包名 `com.wqh.einktool`，桌面名称“墨水屏调试”。架构、JS 桥白名单、`controls.json` 写法、编译方法都写在工程的 `README.md` 里；
- 做法就是 7.1～7.3 的思路：网页做界面，APK 用 WebView + JS 桥 + 常驻 root shell 执行命令，只开放白名单里的属性、节点和设置；
- 网页优先读手机 `/sdcard/eink-tool/`，改完 `adb push` 上去、点 ⟳ 就生效，不用重新编译 APK；
- 界面里包括情景模式（按第 4 节的原厂参数）、刷新模式、`clean_a2`、灰度显示方式、防闪烁、抗锯齿、加深、字体加粗、前光、帧率，以及几个实验和调试项。每项标出改的是 `[属性]`、`[节点]`、`[命令]` 还是 `[配置💾]`（重启后保留），执行的完整命令会记在“日志”tab 里。

---

## 附录 A：补充记录

### A.1 跟滑动速度无关的因素

GSI 滑动卡顿的原因是 `clean_a2=0`（2.2），模块已解决。以下因素实测对滑动速度没有影响：CPU 频率（锁最高频也一样）、SurfaceFlinger / HWC 所在的 CPU 核组（它们在 `system-background`，只用小核 0～5，移到 `foreground` 也一样）、GPU（一直在最低频 385 MHz，占用只有约 10%）、HWC 转灰度（每帧只要 7 ms）、`is_scrolling=1`。帧率分档 `persist.vendor.xrz.fps*` 只在 `clean_a2=0` 时测过，没看出变化。

### A.2 旧 vendor（1.9.6 DSU）上的结论

`fps_limit`、`enable_home_clean`、`driver_color_enhance`、节点 `contrast` / `brightness` 的结果都是在旧 vendor 上测的（已分别写在第 2、3 节并标注）。新 vendor 上没有重测。

---

## 附录 B：资料来源

- 原厂 1.9.6 `framework.jar` 反编译（`xrz/framework/manager/`，在 `D:\www\b`）、手机上的 `hwcomposer.mt6877.so` 和 `libimage_process.so`，以及原厂 1.9.6 / 3.4.6 上的实测抓取（3.4.6 快照在 `D:\BIGME\tools\snaps346\`）
- 原厂 3.4.6 OTA 全量包（`B651_CN_3.4.6-OTA-FULL-*.zip`）解出的 system 镜像：`framework.jar`、`services.jar`（含服务端 `xrz/framework/server/DisplayPolicyController.java`、`DisplayPolicyService.java`）、`libXrzFramework_runtime.so`、`libxrzUtil.so`、`init.eink.rc`、`eink_key`。提取的文件在 `D:\BIGME\B651_CN_3.4.6_system\files\`，反编译出的 xrz 源码在 `D:\BIGME\B651_CN_3.4.6_system\src_xrz\`
- E Ink 波形说明：[E Ink 7.8" 屏幕用户手册](https://shopkits.eink.com/en/download/0223011714sy884942/User%20Manual%20-%207.8''ePaper%20Display%20(VB3300-GHA).pdf)、[IT8951 波形定义](https://api-docs.esphome.io/it8951__defs_8h_source)
- Vasu：Hibreak Pro Guide 4（刷机、前光、刷新模式）— https://vbh.ai/hibreak-pro-guide-4-flashing-the-android-15-gsi/
- HibreakProPatchingService（HiBreak Pro 墨水屏功能补丁）— https://github.com/vbbot/HibreakProPatchingService
- XDA：Bigme Hibreak Pro Development Thread — https://xdaforums.com/t/bigme-hibreak-pro-development-thread.4731041/
- XDA：Bigme HiBreak Pro (MT6877) E ink phone — https://xdaforums.com/t/bigme-hibreak-pro-dimensity-900-mt6877-e-ink-phone.4723924/
