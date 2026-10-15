# Bigme HiBreak Pro 墨水屏驱动控制资料（整理稿）

> 用途：给以后写“墨水屏控制小工具”做参考
> 整理时间：2026-10-15
> 状态标记：
> - ✅ 在本机（ponces Android 16 DSU + Magisk root）上**看到过**
> - 📄 **来自资料**，还没在本机验证
> - ⚠️ **资料之间有出入**，或者可能不适用于本机

---

## 0. GSI 实测结论（2026-10-15，优先看这里）

依据：原厂 `framework.jar` 反编译（`xrz/framework/manager/XrzEinkManager*.java`、`EinkRefreshMode.java`）、原厂 `/system/lib64/libXrzFramework_runtime.so`、本机 `/vendor/lib64/hw/hwcomposer.mt6877.so`，再加上在 ponces Android 16 DSU（Magisk root）里的实测。

### 0.1 原理
- 原厂“墨水屏中心”的大部分功能都是**写 `vendor.xrz.*` 系统属性**，由 **vendor 里的 HWC** 读取处理。GSI 只替换 system，vendor 不动，所以**只要是 HWC 监听的属性，在 GSI 里都能用**。
- 判断一个功能在 GSI 里能不能用：看 `strings /vendor/lib64/hw/hwcomposer.mt6877.so | grep xrz` 里有没有这个属性。
- HWC 监听的属性：`global_refresh_mode`、`force_global_refresh_mode`、`auto_clean_enabled`、`auto_clean_check_disable`、`clean_frequency`、`anti_flicker_enabled`、`enable_home_clean`、`gray_256_dither`、`hwc.enable_image_smoothing`、`driver_color_enhance`、`disable_auto_global_refresh`、`disable_eink_vsync`、`fps_limit`、`hwc_idle`、`update_waveform` 等（都带 `vendor.xrz.` 前缀）。

### 0.2 实测结果
| 功能 | 做法（都需要 root） | 结果 |
|------|------------|------|
| **全局刷新模式** | `setprop vendor.xrz.global_refresh_mode <代码>` | ✅ 有效 |
| **全屏刷新一次** | `setprop vendor.xrz.force_global_refresh_mode 4` → `service call SurfaceFlinger 1004`（重绘）→ 等约 0.6 秒 → **`setprop vendor.xrz.force_global_refresh_mode 0`** | ✅ 有效。⚠️ **不清回 0 的话，之后画面每更新一次都用这个模式全刷**：画面静止时不闪，一滑动就连续闪，停下后又不闪（实测） |
| **加深 / 对比度** | SurfaceFlinger 颜色矩阵，见 0.3 | ✅ **有效，效果明显** |
| **256 级灰度抖动** | `setprop vendor.xrz.gray_256_dither 1` | ✅ 有效，图片上能看出变化 |
| **帧率限制** | `setprop vendor.xrz.fps_limit <每秒帧数>` | ✅ 有效，设 5 时滑动明显卡顿。恢复：`setprop vendor.xrz.fps_limit ""` |
| **驱动全局抖动** | `echo <值> > /sys/kernel/debug/eink_debug/global_dither` | ✅ 有效。逐个实测（刷新模式 179 下，每个值单独保持观察）：**0**（默认）正常；**1** 非黑即白，对比度最高；**2** 画面跟默认差不多（没有多出灰阶），但滑动很卡；**3** 画面跟默认差不多，不卡；**4** 画面跟默认差不多，但滑动卡。实用的只有 **1**（极致高对比） |
| 驱动节点 `eink_debug/contrast` | `echo 0～255 > .../contrast` | ❌ 写入成功，但文字和图片都没有变化（在干净环境下复测过） |
| HWC 属性 `vendor.xrz.driver_color_enhance` | `setprop ... 1` | ❌ 没变化 |
| 自动清残影 | `vendor.xrz.auto_clean_enabled=1` + `clean_frequency=2`，再加上 `eink_debug/clean_a2=1` | ❌ 没看到自动全刷 |
| 回桌面清屏 | `vendor.xrz.enable_home_clean=1` | ❌ 回桌面时没闪 |
| 抗锯齿 | `echo 1 > eink_debug/anti_alias`（也试过 `1 1`、`0 1`） | ❌ 读回来一直是 `0 0`，驱动不接受，这块屏应该**不支持** |
| 图像平滑 | `vendor.xrz.hwc.enable_image_smoothing=1` | ❓ 没看出变化（没仔细看，待复测） |
| 驱动节点 `brightness` | `echo 50 / 150 > eink_debug/brightness` | ❌ 0～255 都能写入，但**前光不会亮**（前光关闭时设 255，前光不亮），图片深浅也**没有变化**（A/B 对比和保持观察都试过）。用途不明，GSI 下看不出作用 |
| 驱动节点 `saturation` | `echo 150 > eink_debug/saturation` | ❓ 跳过，应该是彩屏用的 |
| 原厂“加深” `persist.vendor.xrz.global_dark_level`（还有 `global_brightness_level`、`global_color_enhance`） | — | ❌ 没测。vendor 里没有任何地方读这几个属性，原厂是在 system 侧处理的，GSI 里不存在 |
| 按 App 设置刷新模式 | — | ❌ 原厂改过的 SurfaceControl/SurfaceFlinger 才支持。替代办法：监听前台 App，切换全局模式 |

**默认值**（ponces Android 16 DSU，开机后没有改过时的值）：
- `vendor.xrz.*` 属性：全部**未设置**（`global_refresh_mode`、`force_global_refresh_mode`、`auto_clean_enabled`、`clean_frequency`、`enable_home_clean`、`gray_256_dither`、`hwc.enable_image_smoothing`、`fps_limit`、`driver_color_enhance`、`persist.vendor.xrz.global_dark_level` 等）
- `eink_debug` 节点：`contrast=0`、`saturation=0`、`global_dither=0x0`、`brightness=0`、`anti_alias=0 0`、`anti_flicker=1`、`clean_a2=0`、`global_mode=0x0`、`sys_update=1`、`temperature=30`、`version=v4.63_20250403`
- 注意：写 `vendor.xrz.global_refresh_mode` 不会改变 `eink_debug/global_mode` 的读数，它一直显示 `0x0`，HWC 是通过别的通道把模式传给驱动的。

刷新模式代码（原厂 `EinkRefreshMode.java`）：

| 代码 | 名称 | 代码 | 名称 |
|------|------|------|------|
| 1 | INIT | 176 | CLEAN |
| 2 | DU | **177** | **HD** |
| 4 | GC16 | **178** | **NORMAL** |
| 8 | GC4 | **179** | **FAST** |
| 16 | A2 | **180** | **REGAL** |
| 32 | GL16 | 137 | INPUT（输入法） |
| 64 / 128 | GLR16 / GLD16 | 1029 / 1030 | 手写 / 橡皮擦 |
| 132 / 136 | GU16 / GU4 | 32768 | AUTO |

原厂 `libXrzFramework_runtime.so` 里的其他功能（GSI 里没有这个库，可以用 root 自己实现）：
- 强制全屏刷新 = 设置 `vendor.xrz.force_global_refresh_mode` + `SurfaceComposerClient::repaintEverything`
- 抗锯齿 / 防闪烁 / 自动清屏 = 直接写 `eink_debug/anti_alias`、`anti_flicker`、`clean_a2`

### 0.3 加深（对比度）：SurfaceFlinger 颜色矩阵
公式：`输出 = 1 - k × (1 - 输入)`，**白色保持白色，灰色按比例加深**，亮度低于 1/k 的灰色会直接变黑。
```sh
# k=2.0 示例（1-k = -1）。传入的是 4×4 矩阵，按列排列，最后一行前三个数是平移量 (1-k)
service call SurfaceFlinger 1015 i32 1 \
  f 2 f 0 f 0 f 0 \
  f 0 f 2 f 0 f 0 \
  f 0 f 0 f 2 f 0 \
  f -1 f -1 f -1 f 1
# 关闭（恢复原样）
service call SurfaceFlinger 1015 i32 0
```
- 实测：k=1.5 明显变深；k=2.0 文字很黑很实，**整体偏深**。工具里建议做成滑块，范围大约 1.0～2.0。
- **重启后失效**，需要开机后重新执行。
- ⚠️ Android 的护眼模式、颜色校正、灰度等功能也用这个颜色变换通道，切换这些功能时**可能会冲掉你设置的矩阵**，工具里最好提供“重新应用”。
- 这台机器所有图层都走 GPU 合成（`composition=CLIENT`），所以颜色矩阵一定会生效。
- 用户最后选定的值：**k=1.5**（k=2.0 偏深）。

### 0.4 字体加粗（不需要 root）✅ 实测有效
原厂是通过 `persist.vendor.xrz.global_fonts_weight` 加上改过的 Typeface 类来调字重，GSI 里没有这套机制。改用 Android 12 以后自带的全局字重调节：
```sh
adb shell settings put secure font_weight_adjustment 500   # 更粗：常规文字 400 → 900（Black）
adb shell settings put secure font_weight_adjustment 300   # 等于 设置 → 无障碍 →“粗体文字”（400 → 700）
adb shell settings put secure font_weight_adjustment 0     # 关闭
```
- 原理：所有文字的字重都加上这个值，最大到 1000 为止。
- 中文能变粗，是因为 ponces 16 自带的 `NotoSansCJK-Regular.ttc` 是**可变字体**，`/system/etc/fonts.xml` 里给简体和繁体都配了 100～900 全部字重。**900 就是上限**，再大也不会更粗。英文的 Roboto 也是 100～900。
- 实测 500 比 300 明显更粗。
- 注意：在系统设置里切换“粗体文字”开关，会把这个值重置成 300 或 0。已经打开的 App 可能要重开才生效。
- 写工具的话：不需要 root，但 App 要有 `WRITE_SECURE_SETTINGS` 权限（用 `adb shell pm grant <包名> android.permission.WRITE_SECURE_SETTINGS` 授予一次，或者直接用 root 执行 settings 命令）。

### 0.5 前光（冷光 / 暖光）✅ 实测有效
```sh
L=/sys/devices/platform/11d01000.i2c7/i2c-7/7-0036
echo 20 > $L/lm3630a_warm_light    # 暖光，0～254，0 = 关
echo 0  > $L/lm3630a_cold_light    # 冷光，0～254，0 = 关
```
- 需要 root。实测暖光写 20 会微微亮起，写 0 熄灭。同目录下还有 `lm3630a_version`。
- 用户的工具里还会写 `settings put system screen_brightness_cold/warm <值>`。这两个键是原厂用来记住亮度的，**GSI 里没有服务读它们**，只能当作“保存当前亮度”的地方，开机后要自己读出来再写回节点。
- `eink_debug/brightness` **不是**前光，写 255 前光不亮（见 0.2 节）。

### 0.6 锁屏自动关前光（GSI 里要自己实现）
- **现象**：GSI 里锁屏或灭屏后前光**不会自己熄灭**。原厂是靠 Bigme 自己的系统服务处理的，GSI 里没有这个服务。
- **推荐做法**：在工具 App 里**监听亮屏和灭屏**，灭屏时两个节点写 0，亮屏时写回保存的亮度。
  - `ACTION_SCREEN_OFF` / `ACTION_SCREEN_ON` **不能在 AndroidManifest 里静态注册**，必须在一直运行的组件里动态注册：**前台服务**（会有常驻通知），或者**无障碍服务**（HibreakProPatchingService 就是这么做的，不需要常驻通知，也不容易被系统杀掉）。
  - 灭屏时要马上执行，建议用**常驻 root shell**（[libsu](https://github.com/topjohnwu/libsu)），不要每次都新开 `su` 进程。
  - 可选：等到 `ACTION_USER_PRESENT`（**解锁后**）再开灯，这样锁屏界面不亮灯，更省电。
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
- **不推荐的临时办法**：用 Magisk 的 `service.d` 脚本每 1～2 秒检查一次 `dumpsys power` 里的 `mWakefulness`，灭屏就关灯。能用，但一直轮询耗电，而且有延迟。

---

## 1. 节点总览

| 功能 | 节点 | 取值 | 来源 | 状态 |
|------|------|------|------|------|
| 冷光亮度 | `/sys/devices/platform/11d01000.i2c7/i2c-7/7-0036/lm3630a_cold_light` | 0～254（0 = 关） | Vasu 教程，HibreakProPatchingService | 📄 |
| 暖光亮度 | `/sys/devices/platform/11d01000.i2c7/i2c-7/7-0036/lm3630a_warm_light` | 0～254（0 = 关） | 同上 | 📄 |
| 全局刷新模式 | `/sys/kernel/debug/eink_debug/global_mode` | 模式代码，见第 2 节 | 同上 | 📄 |
| 自动清屏（防残影） | `/sys/kernel/debug/eink_debug/clean_a2` | `1` 开 / `0` 关 | HibreakProPatchingService | 📄 |
| 防抖 / 防闪烁 | `/sys/kernel/debug/eink_debug/anti_flicker` | `1` 开 / `0` 关 | HibreakProPatchingService | 📄 |
| 对比度 | `/sys/kernel/debug/eink_debug/contrast` | 0～255 都能写入 | 本机实测 | ❌ GSI 下写入后画面没有变化，改用第 0.3 节的颜色矩阵 |
| 其他 | `eink_debug` 下的其余节点，见第 3 节 | 未知 | 本机 `ls` | ✅ 节点存在 |

- 背光芯片是 **TI LM3630A**（双通道），挂在 i2c7 总线上，地址 0x36，冷光和暖光各一路。
- `eink_debug` 在 **debugfs** 下，需要 root 才能访问，可能还要先挂载：
  ```sh
  mountpoint /sys/kernel/debug || mount -t debugfs debugfs /sys/kernel/debug
  ```
  在本机 ponces 16 DSU 上，开机后 debugfs 已经挂好了。

---

## 2. 刷新模式代码（写入 `global_mode`）

### 2.1 HibreakProPatchingService 实际用的 4 个（📄 最可信，因为是 HiBreak Pro 专用项目的代码）

| 代码 | 项目里的命名 | 大致用途（推测） |
|------|-------------|-----------------|
| `177` | SMOOTH | 流畅 |
| `178` | BALANCED | 均衡 |
| `179` | FAST | 极速（残影多，适合滚动） |
| `180` | CLEAR | 清晰（残影少，适合阅读） |

这个项目的“单击墨水屏按键刷新屏幕”是这样实现的：
1. 切到 `180`（CLEAR）；
2. 在屏幕最上层盖一张**全黑**图，100ms 后换成**全白**图，再过 100ms 移除，相当于强制全屏刷新一次；
3. 切回原来的模式。

### 2.2 XDA 帖子里贴出的常量表（⚠️ 跟上面的命名对不上，需要验证）

| 代码 | 名称 |
|------|------|
| `2` | DU |
| `4` | GC16 |
| `16` | A2 |
| `32` | GL16 |
| `176` | Clean |
| `177` | HD |
| `178` | Normal |
| `179` | Fast |
| `180` | Regal |

- DU / GC16 / A2 / GL16 是 E Ink 通用的**波形名**：
  - **GC16**：16 级灰度、全刷，画质最好、最慢、会闪；
  - **GL16**：16 级灰度、局部刷新，闪得少；
  - **DU**：只刷黑白、快；
  - **A2**：黑白、最快，适合动画和滚动，残影最多。
- 帖子里还提到“`AUTO`”和“`INIT`”模式，代码不明。
- 有人提到也可以通过 `sys_update` 节点切换模式，细节不明。

> 两种说法在 177～180 的命名上有出入（例如 180 一个叫 CLEAR、一个叫 Regal）。不过 Regal 正是 E Ink 用来减少残影的波形，跟“清晰”的含义基本一致。**以实机测试为准。**

---

## 3. `eink_debug` 目录下的全部节点（✅ 本机 `ls` 结果）

```
anti_alias  anti_flicker  brightness  clean_a2  contrast  dc_count  enable
frame_data  global_dither  global_mode  machine_waveform  manual_refresh
panel_type  print_level  saturation  save_level  sys_update  temperature
vcom  version  waveform  wf_ota
```

按名字推测的含义（📄 **全部是推测**，写之前先 `cat` 看当前值）：

| 节点 | 推测含义 | 风险 |
|------|---------|------|
| `global_mode` | 全局刷新模式 | 低 |
| `clean_a2` | A2 模式下自动清残影 | 低 |
| `anti_flicker` | 防闪烁 | 低 |
| `contrast` | 对比度 | 低 |
| `saturation` | 饱和度（彩屏机型用的？） | 低 |
| `global_dither` | 全局抖动 | 低 |
| `anti_alias` | 抗锯齿 | 低 |
| `manual_refresh` | 手动触发刷新 | 低 |
| `brightness` | 亮度（可能是背光，也可能是显示亮度） | 低 |
| `sys_update` | 系统级更新 / 切换模式 | 中 |
| `enable` | 墨水屏驱动开关 | ⚠️ **高，写 0 可能直接黑屏** |
| `vcom` | 面板公共电压（每块屏出厂校准好的） | ⚠️ **高，改错可能导致显示异常，不要乱动** |
| `waveform` / `machine_waveform` / `wf_ota` | 波形文件或波形更新 | ⚠️ **高，不要写** |
| `temperature` | 面板温度（用来选择波形） | 中 |
| `panel_type` / `version` / `dc_count` / `frame_data` / `print_level` / `save_level` | 信息、调试用 | 只读查看 |

---

## 4. 关于 HibreakProPatchingService 里的“对比度 / 黑白阈值”

这个项目的守护进程里还有下面几个功能，但用的节点是：
```
/sys/devices/platform/soc/soc:qcom,dsi-display-primary/epd_contrast
/sys/devices/platform/soc/soc:qcom,dsi-display-primary/epd_white_threshold
/sys/devices/platform/soc/soc:qcom,dsi-display-primary/epd_black_threshold
/sys/devices/platform/soc/soc:qcom,dsi-display-primary/epd_commit_bitmap
```
⚠️ 这些是**高通平台**的路径，是从海信 A9（高通芯片）的项目里继承下来的，**在 HiBreak Pro（联发科）上大概率不存在**。HiBreak Pro 上的对比度应该看 `eink_debug/contrast`。

项目里其他一些功能是用系统属性实现的（📄 不知道在 GSI 上是否有效）：
| 功能 | 属性 |
|------|------|
| 静态锁屏 | `sys.linevibrator_type` |
| 最大亮度 | `sys.linevibrator_touch` |
| 音量键唤醒 | `sys.wakeup_on_volume` |

---

## 5. 小工具的实现思路

### 5.1 权限
- 节点在 `/sys`、`/sys/kernel/debug` 下，**普通 App 无法访问**：文件权限只给 root，SELinux 也会拦截。
- 方案 A（简单）：App 通过 **Magisk su** 执行 `echo 值 > 节点`。推荐用 [libsu](https://github.com/topjohnwu/libsu)，保持一个常驻的 root shell，避免每次都新开进程。
- 方案 B（HibreakProPatchingService 的做法）：写一个以 root 运行的**守护进程**，监听本地 socket（`0a9_eink_socket`），App 通过 socket 发送短指令，比如 `br_co64`、`c`。它是把守护进程打包进 system 镜像，再配上 SELinux 策略。用 Magisk 的话，也可以把守护进程放进模块的 `service.sh` 启动。

### 5.2 建议的指令设计（参考 HibreakProPatchingService）
| 指令 | 动作 |
|------|------|
| `br_co<0-254>` | 设置冷光 |
| `br_wm<0-254>` | 设置暖光 |
| `c` / `b` / `s` / `p` | 刷新模式 180 / 178 / 177 / 179 |
| `au_br<0/1>` | 自动清屏 `clean_a2` |
| `an_fl<0/1>` | 防闪烁 `anti_flicker` |
| 全屏刷新 | 切到 180 → 黑屏 100ms → 白屏 100ms → 切回原模式 |

### 5.3 第一次在实机上要做的检查（只读，安全）
```sh
su
E=/sys/kernel/debug/eink_debug
ls -lZ $E
for f in $E/*; do echo "$(basename $f): $(timeout 2 cat $f 2>&1 | head -c 200)"; done
L=/sys/devices/platform/11d01000.i2c7/i2c-7/7-0036
ls -lZ $L
cat $L/lm3630a_cold_light $L/lm3630a_warm_light
ls /sys/class/backlight /sys/class/leds
```
先记下所有节点的**原始值**，方便测试完恢复。然后**从低风险的节点开始**测试写入：前光 → `global_mode` → `clean_a2` / `anti_flicker` → `contrast`。

---

## 6. 资料来源

- Vasu：Hibreak Pro Guide 4（刷机、前光、刷新模式）— https://vbh.ai/hibreak-pro-guide-4-flashing-the-android-15-gsi/
- Vasu 在 Reddit 上的模式代码帖（这次没能抓取到）— https://www.reddit.com/r/Bigme/comments/1jvij9x/guide_more_hacks_for_the_hibreak_pro_fix_android/
- HibreakProPatchingService（HiBreak Pro 的墨水屏功能补丁；守护进程源码 `a9_eink_daemon/eink_daemon.c`）— https://github.com/vbbot/HibreakProPatchingService
- A9PatchingService（原版，海信 A9 用）— https://github.com/damianmqr/A9PatchingService
- XDA：Bigme Hibreak Pro Development Thread — https://xdaforums.com/t/bigme-hibreak-pro-development-thread.4731041/
- XDA：Bigme HiBreak Pro (MT6877) E ink phone — https://xdaforums.com/t/bigme-hibreak-pro-dimensity-900-mt6877-e-ink-phone.4723924/
- XDA：[Bigme Hibreak] Root (Mediatek 6765)（初代 HiBreak，不是 Pro）— https://xdaforums.com/t/bigme-hibreak-root-mediatek-6765.4697830/

> XDA 和 Reddit 有反爬虫防护，这次没能读到帖子原文，第 2.2 节的常量表来自搜索结果摘要。需要的话可以用浏览器打开这些帖子，把相关内容贴过来补充。
