# Bigme HiBreak Pro 刷 GSI 指南（ponces Android 16 + Magisk）

> 适用：Bigme HiBreak Pro（墨水屏，MediaTek MT6877，内核 4.19）
> 目标：纯净 AOSP + 谷歌服务 + root，**能正常打电话 / 来电 / 通话有声音**
> 整理时间：2026-10-15，2026-10-17 按正式刷机（原厂 3.4.6 vendor）的实测结果更新
>
> 本文的每一步都标了验证状态：
> - ✅ **已实测**：在本机 DSU 或正式刷机后实际跑通
> - ⚠️ **未实测**：按原理和资料整理，还没在本机验证过，操作时要小心

---

## 目录

1. [先了解：这台机器刷 GSI 会遇到的 5 个问题](#1-先了解这台机器刷-gsi-会遇到的-5-个问题)
2. [准备工作](#2-准备工作)
3. [推荐流程：先用 DSU 试，再正式刷](#3-推荐流程先用-dsu-试再正式刷)
4. [第一次开机：黑屏和 adb 授权](#4-第一次开机黑屏和-adb-授权)
5. [获取 root（Magisk）](#5-获取-rootmagisk)
6. [修复打电话：IMS / 通话声音 / 来电](#6-修复打电话ims--通话声音--来电)
7. [正式刷机（不用 DSU）](#7-正式刷机不用-dsu)
8. [排错速查表](#8-排错速查表)
9. [常用诊断命令](#9-常用诊断命令)
10. [参考资料](#10-参考资料)

---

## 1. 先了解：这台机器刷 GSI 会遇到的 5 个问题

| # | 问题 | 症状 | 原因 | 解决 | 需要 root | 状态 |
|---|------|------|------|------|-----------|------|
| 1 | 开机黑屏 / 卡死 | 开机黑屏，开机动画不退出；开机向导阶段还会每 1～2 分钟自己重启 | **开机动画和 SurfaceFlinger 在 GPU 上互相等待，死锁了**，SurfaceFlinger 卡死；开机向导期间 system_server 等不到 SurfaceFlinger，被看门狗（watchdog）杀掉，反复循环 | 首次开机：跳过开机向导（4.3）；平时：Magisk 模块关掉开机动画 + 卡死时自动重启 SurfaceFlinger（4.5、6.5） | 跳过向导不需要；关开机动画要 Magisk | ✅ |
| 2 | adb 无法 root、需要授权 | `adb root` 提示 *production builds*；`adb devices` 显示 `unauthorized` | 原厂 boot 设置了 `ro.debuggable=0`、`ro.adb.secure=1`，GSI 改不了 | 用 scrcpy OTG 模拟键盘点授权；root 用 Magisk | — | ✅ |
| 3 | 打不出也打不进 | 打出去没反应；别人打来提示“无法接通” | GSI 换掉了 system 分区，原厂的联发科 IMS 应用没了，VoLTE/VoNR 不工作 | 在 Phh 设置里装 IMS APK | 否（界面操作） | ✅ |
| 4 | 通话没声音 | 能接通，但听不到对方的声音，偶尔会漏出不到 1 秒的声音 | AOSP 默认音频策略 + vendor 配置 `halVersion="3.0"` → 走新式通话路由，`audioserver` 崩溃循环 | Phh 设置里打开 **Disable "Voice Call In" route** | 否（界面操作） | ✅ |
| 5 | 来电没反应 | 对方显示“无人接听”，本机没有任何来电显示 | TrebleDroid 开机时把 `libmtk-ril.so` 里的 `AT+EAIC=2` 改成了 `=3` | 撤掉这层覆盖，恢复原厂 `=2` | **是**，且每次开机要重做 | ✅ |

**关于 root：** 问题 5 的修复和问题 1 的“关开机动画”都必须用 root，而且必须在每次开机时自动执行（TrebleDroid 每次开机都会重新覆盖；开机动画的设置必须赶在 SurfaceFlinger 启动之前）。所以需要一个“开机自动以 root 执行”的机制：
- **Magisk 模块**（本文采用，见 6.5）：不改动系统分区，换 GSI 后照样能用。
- **自带 root、且能 `adb root` + `adb remount` 的 ROM**：可以直接修改 GSI 里的 `/system/bin/rw-system.sh`（开机时以 root 执行），删掉 EAIC 那条 sed。但每换一次 GSI 都要重改；在原厂 boot 下 `adb root` 被禁止，这条路走不通。
- ponces 的 GSI 是 `user` 版（`ro.debuggable=0`），`/data/local.prop` 不会被读取，没法用它来设开机属性。

**几个背景知识：**
- 这台手机出厂显示 Android 14，但 **vendor 分区其实是 Android 12 的底子**（指纹 `Bigme/HiBreak/Smartphone:12/SP1A.210812.016/...`）。新版 Android 的 GSI 跟它的兼容问题比较多。
- 问题 3、5 在**所有 TrebleDroid 系的 GSI**（ponces、AndyYan LineageOS、phh 等）上都会出现，跟 Android 版本无关。
- 问题 4 在 AOSP 13 以后的 GSI 上**都可能**出现（源码里这段逻辑 13～16 都有）。
- 问题 1 是偶发的：同一台机器有时正常开机，有时黑屏。本机在正式刷机后连续 3 次开机都黑屏；关掉开机动画后，连续 4 次开机都正常。
- 原厂系统没这些问题，是因为它用的是联发科定制过的 system 组件。

---

## 2. 准备工作

### 2.1 电脑端工具（Windows）

| 工具 | 用途 | 下载 |
|------|------|------|
| scrcpy（自带 adb） | adb 命令、OTG 模拟键盘 | https://github.com/Genymobile/scrcpy/releases |
| platform-tools | fastboot | https://dl.google.com/android/repository/platform-tools-latest-windows.zip |
| Google USB 驱动 | 让 Windows 识别 fastboot 模式 | https://dl.google.com/android/repository/usb_driver_r13-windows.zip |
| mtkclient（可选） | 联发科救砖、备份分区 | https://github.com/bkerler/mtkclient |

**安装 Google USB 驱动**（管理员 PowerShell，在解压目录里执行）：
```powershell
pnputil /add-driver .\usb_driver\android_winusb.inf /install
```
不想要了可以卸载：先用 `pnputil /enum-drivers` 找到对应的 `oemXX.inf`，再执行 `pnputil /delete-driver oemXX.inf /uninstall`。

> 💡 有的数据线只能充电。如果 `adb devices` 什么都看不到，先换线、换口，并确认手机通知栏里 USB 用途是“文件传输”。

### 2.2 手机端前提

- **bootloader 已解锁**：`adb shell getprop ro.boot.verifiedbootstate` 返回 `orange` 就说明已解锁。
- **原厂系统已经装好 Magisk**（修补原厂 boot 的方法见第 5 节）。
- 开发者选项里打开 **USB 调试**，并且对电脑勾过“始终允许”。

### 2.3 要下载的文件

| 文件 | 说明 |
|------|------|
| `aosp-arm64-ab-gapps-16.0-20250625.img.xz` | ponces TrebleDroid AOSP 16，带 GApps。https://github.com/ponces/treble_aosp/releases |
| `Magisk-v30.6.apk`（或者和手机上一致的版本） | https://github.com/topjohnwu/Magisk/releases |
| DSU Sideloader | 用 DSU 方式试系统用。https://github.com/VegaBobo/DSU-Sideloader/releases |

**其他可选的 ROM**（没有在本机完整测过）：ponces 15 gapps 版；Vasu 给 HiBreak Pro 做的 Android 14 专用包（https://vbh.ai/hibreak-pro-gsi-release/）。

### 2.4 备份（⚠️ 正式刷机前必须做）

至少备份 `boot`、`vbmeta`、`super` 这几个分区，可以用 mtkclient，或者在有 root 的原厂系统里用 dd：
```bash
adb shell getprop ro.boot.slot_suffix        # 查看当前槽位，例如 _a
adb shell su -c "dd if=/dev/block/by-name/boot_a   of=/sdcard/boot_a.img"
adb shell su -c "dd if=/dev/block/by-name/vbmeta_a of=/sdcard/vbmeta.img"
adb shell su -c "dd if=/dev/block/by-name/vbmeta_system_a of=/sdcard/vbmeta_system.img"
adb shell su -c "dd if=/dev/block/by-name/vbmeta_vendor_a of=/sdcard/vbmeta_vendor.img"
adb pull /sdcard/boot_a.img
adb pull /sdcard/vbmeta.img
adb pull /sdcard/vbmeta_system.img
adb pull /sdcard/vbmeta_vendor.img
```
`super` 分区很大（好几个 GB），建议用 mtkclient 备份。

---

## 3. 推荐流程：先用 DSU 试，再正式刷

**DSU（Dynamic System Updates）** 会把 GSI 装进 `/data` 里临时启动，**不会动原厂系统**，适合先试一试。

### 3.1 安装（✅）
1. 安装 DSU Sideloader：`adb install DSU-Sideloader.apk`
2. 把 GSI 的 `.img.xz` 放到手机存储里。
3. 打开 DSU Sideloader，选择镜像，**userdata 建议设为 8GB**（带 GApps 的话，默认空间可能不够），然后开始安装。
4. 装好后从通知栏选择“重启进入 DSU”。

### 3.2 注意事项
- DSU 用的是**原厂 boot**，所以 `ro.debuggable=0`，`adb root` 用不了，只能用 Magisk 拿 root。好在 **Magisk 在 DSU 里也能用**（su 的路径是 `/debug_ramdisk/su`，不在 PATH 里）。
- DSU 有**独立的 data 分区**，adb 授权、装的 App、Magisk 模块都要在 DSU 里重新弄一遍。
- DSU 有时候会变成“每次重启都进 DSU”，长按电源键也出不来。退出办法见下面。

### 3.3 退出 DSU、回到原厂系统（⚠️ 未完整实测）
```bash
adb reboot fastboot          # 进入 fastbootd（用户空间的 fastboot）
fastboot gsi disable         # 关闭 DSU，镜像保留
# 或者 fastboot gsi wipe     # 彻底删掉 DSU
fastboot reboot
```
在原厂系统里也可以用 root 执行：`su -c "gsi_tool disable"`（彻底删除用 `gsi_tool wipe`）。

---

## 4. 第一次开机：黑屏和 adb 授权

### 4.1 先判断系统起来没有
- 黑屏时**按一下电源键**，能听到锁屏提示音，就说明系统已经起来了，只是屏幕没画面。
- 电脑上 `adb devices` 显示 `unauthorized`，也说明系统已经起来了，在等你授权。

### 4.2 用 scrcpy OTG 盲点授权框（✅）
OTG 模式会让电脑**伪装成一个 USB 键盘**，不走 adb，所以不需要授权。

```bash
adb start-server
adb devices                   # 确认是 unauthorized（这时手机上已经弹出授权框）
scrcpy --otg -s <序列号>      # 会自动关掉 adb，弹出一个没有画面的窗口
```
点一下 OTG 窗口，然后**慢慢地**按（每个键之间隔 1～2 秒）：

```
Shift  →（等 2 秒，用来唤醒屏幕）
Tab    → 焦点移到“始终允许使用这台计算机进行调试”
Enter  → 勾选
Tab, Tab → 焦点移到“允许”
Enter  → 确认
```
然后关掉 OTG 窗口，`adb devices` 显示 `device` 就成功了。

**更稳的盲按法（推荐）：反复按 `Shift+Tab`、`Enter`**
- `Shift+Tab` 是往回移动焦点，第一下就会落在**最后一个控件，也就是“允许”**上，然后按 `Enter` 确认。
- 不管之前按乱成什么样，这组键点的永远是“允许”，所以可以**放心地重复按几次**。授权一旦成功，授权框就关了，多按的键也不会误操作。
- ⚠️ 这样**没有勾上“始终允许”**，只是一次性授权：这次开机内有效，重启或重新插拔 USB 后可能要重新授权。等屏幕正常后，可以在开发者选项里撤销授权，重新插线，直接在屏幕上勾“始终允许”，再点允许，就一劳永逸了。

> ⚠️ **如果系统正处在卡死循环里（问题 1），按键不会有任何反应**，在本机上试了 7 次都失败，第 8 次碰巧落在两次重启之间才成功。
> **小技巧**：先在原厂系统里练一遍：开发者选项 →“撤销 USB 调试授权”，重新插线让授权框弹出来，看着屏幕用 OTG 键盘按，熟悉焦点怎么移动。
> 用程序模拟按键（比如 Windows 的 keybd_event）实测不生效，**一定要用手按**。

### 4.3 跳过开机向导，解决卡死（✅ 关键一步）
一旦 adb 授权成功，**马上执行**：
```bash
adb shell settings put global device_provisioned 1
adb shell settings put secure user_setup_complete 1
adb reboot
```
重启后会**直接进桌面，不再跑开机向导**。实测之后屏幕一直正常，也没有再出现看门狗重启。

**原理**：通过 logcat 发现，`system_server` 卡在 `SurfaceControl.nativeGetCompositionDataspaces`（在等 SurfaceFlinger），看门狗等了 68 秒就把它杀了。
后来在正式刷机后抓到了调用栈，SurfaceFlinger 卡死的真正原因是**开机动画和 SurfaceFlinger 在 GPU 上死锁**（见 4.5）。开机向导正好是开机动画之后出现的第一个界面，所以最容易撞上；跳过向导、少走这一段，就能大大降低卡死的概率。之后再装 6.5 的模块，关掉开机动画，就能从根本上避开；如果第一次开机就一直黑屏、盲按也不行，可以刷 4.6 的备用 boot。

### 4.4 关于“关闭 HW 叠加层”
网上很多教程说开机后要执行 `service call SurfaceFlinger 1008 i32 1`，或者在开发者选项里勾“停用 HW 叠加层”。
- 这条命令**需要 root**，而且**重启后会失效**。
- 在本机上查了一下，HWC 本来就把所有图层交给 GPU 合成（`composition=CLIENT`），所以**这一步不是关键**。真正导致卡死的是开机向导。

### 4.5 黑屏救急：重启 SurfaceFlinger（✅ 实测有效）

**现象**：系统其实在正常运行（按电源键有声音、adb 能连、**scrcpy 投屏能看到画面**），但墨水屏一直黑屏或者画面不动。开机时可能表现为开机动画一直不退出。

**原因（✅ 已抓到调用栈确认）**：开机动画和 SurfaceFlinger 在 GPU（Mali）上**互相等待，死锁了**。卡住时用 `debuggerd -b` 抓到的现场：

| 进程 | 卡在哪里 |
|---|---|
| SurfaceFlinger 主线程 | `SkiaGLRenderEngine::flushGL()` → Mali 驱动 `osup_sync_object_wait`，一直等 GPU 完成 |
| 开机动画 | 渲染线程卡在 Mali 驱动里；`ged-swd` 线程在等上一帧的 fence |
| HWC（显示合成器） | 所有线程都空闲，在等新任务 |

所以这个问题**跟墨水屏、HWC 都无关**，也跟 Phh 设置里的背压、GED 开关关系不大。开机后 SurfaceFlinger 已经通知开机动画退出了，但开机动画卡在 GPU 里，没法退出；把原厂 build.prop 里那几个 HWC 属性（`disable_eink_vsync`、`color_restoration_suppoort`、`image_smoothing_suppoort`）补回来，也没有任何改善；后来去掉它们，只关开机动画，照样不黑屏。（其中 `disable_eink_vsync=1` 后来发现能让滑动更平滑，所以又加回了模块，但跟黑屏无关。）日志里能看到类似这些（都是结果，不是原因）：
```
E GED : dequeueBuffer: fence 37 didn't signal in 1000 ms (try = 138)      ← 开机动画一直等不到上一帧
E hwcomposer: [OVL] processImage: wait CT fence timeout
W WindowManager: Timeout waiting for drawn: undrawn=[Window{... NotificationShade}]
```
`adb shell dumpsys SurfaceFlinger` 会卡住不返回（可以加 `timeout 8` 测试）。

**预防（✅ 需要 Magisk）**：开机时设置 `debug.sf.nobootanimation=1`，不显示开机动画，死锁的一方就没了。这个属性必须在 SurfaceFlinger 启动之前设置，所以只能用 Magisk 模块的 `system.prop`（见 6.5），或者刷自带这个设置的 boot（见 4.6）。开机后再用 adb 设置已经来不及了。墨水屏上的开机动画本来也没什么用。
实测：没关开机动画时，连续 3 次开机都黑屏；关掉以后，连续 4 次开机都正常（其中 1 次已经去掉了上面那几个 HWC 属性），日志里也一条 fence 超时报错都没有。

**解决**（需要 root）：
```sh
adb shell "su -c 'setprop ctl.restart surfaceflinger'"
# 还没修复 Magisk 运行环境时，su 不在 PATH 里，用完整路径：
adb shell "/debug_ramdisk/su -c 'setprop ctl.restart surfaceflinger'"
```
这会让 SurfaceFlinger 连同整个安卓框架（zygote、system_server）一起重新启动，相当于“软重启”，GPU 上下文会重新建立，死锁也就解开了。它**不会改任何设置**，比整机重启快，十几秒后画面就会出来。6.5 的模块会在开机后自动检测并执行这一步。

- 实测：按电源键锁屏再解锁**没用**，重启 SurfaceFlinger 后马上恢复。
- 如果还没有 adb 授权、也没有 root，就只能整机重启（长按电源键）。

### 4.6 备用方案：刷“关开机动画”版 boot（⚠️ 镜像已做好，还没刷过）
如果第一次开机（或恢复出厂设置后）一直黑屏，OTG 盲按也试不出来，可以刷一个**自带关开机动画**的 boot：
- 文件：`B651_CN_3.4.6_extract\magisk_patched-30700_nobootanim.img`
- 内容：就是现在用的 Magisk 修补版 boot（`magisk_patched-30700_iw06O.img`），只是用 Magisk 的 overlay.d 机制在 ramdisk 里加了一个 3 行的 `overlay.d/hibreak_nobootanim.rc`：
  ```
  on early-init
      setprop debug.sf.nobootanimation 1
  ```
- 它在 boot 分区里，**不依赖 `/data`**：刷完 GSI 后第一次开机、恢复出厂设置后都会直接生效，不显示开机动画，也就避开了黑屏死锁（4.5）。屏幕能正常显示以后，adb 授权框就可以直接在屏幕上点。

```bash
adb reboot bootloader                 # adb 不能用时，关机后用按键组合进 fastboot
fastboot getvar current-slot          # 确认当前槽位（本机是 b）
fastboot flash boot_b magisk_patched-30700_nobootanim.img
fastboot reboot
```
- **回退**：用同样的方法刷回 `magisk_patched-30700_iw06O.img`。
- 验证：开机后 `adb shell getprop debug.sf.nobootanimation` 返回 `1`。注意 6.5 的模块也会设置同一个值，两者同时存在不冲突。
- 这个镜像只适用于原厂 3.4.6 的 boot。换了原厂固件版本的话，要用新版的 boot 重新修补，再加这个文件。

---

## 5. 获取 root（Magisk）

### 5.1 修补原厂 boot（原厂系统里做，⚠️ 按常规流程整理）
1. 从手机导出 boot（见 2.4 节），或者从原厂固件包里提取。
2. 安装 Magisk App，选择“安装 → 选择并修补一个文件”，选 `boot_a.img`。
3. 刷入修补好的镜像（这台机器是 4.19 内核，没有 `init_boot` 分区，直接修补 boot）：
   ```bash
   adb reboot bootloader
   fastboot flash boot_a magisk_patched-xxxxx.img
   fastboot reboot
   ```

### 5.2 在 GSI（或 DSU）里启用 Magisk（✅）
1. GSI 里只有一个 Magisk“桩应用”，它需要**联网**下载完整版。没有网络的话，直接用 adb 安装完整版：
   ```bash
   adb install -r Magisk-v30.6.apk
   ```
2. 打开 Magisk，如果提示“需要修复运行环境”，点修复（会自动重启）。**要用 Magisk 模块就必须做这一步。**
3. 用 adb 测试 root。第一次手机上会弹出授权框，点“允许”：
   ```bash
   adb shell /debug_ramdisk/su -c id      # 应该输出 uid=0(root)
   ```
   > 屏幕黑着的时候授权框是点不了的，所以一定要先做第 4.3 节，让屏幕正常。
   > 在开机向导还没完成时，su 请求会被直接拒绝（`Permission denied`）。

### 5.3 小技巧：命令里引号多的时候，用脚本文件
在 Windows 下用 adb 传带 `$`、引号的命令很容易出错，推荐写成脚本推到手机上执行：
```bash
adb push fix.sh /data/local/tmp/fix.sh
adb shell "/debug_ramdisk/su -c 'sh /data/local/tmp/fix.sh'; rm -f /data/local/tmp/fix.sh"
```
> Git Bash 用户注意：先执行 `export MSYS_NO_PATHCONV=1`，否则 `/data/local/tmp` 会被自动转换成 Windows 路径。

---

## 6. 修复打电话：IMS / 通话声音 / 来电

按顺序做：**先让 IMS 注册，确认能打出去，再修声音，最后修来电。**

**正式刷机后实测的最简做法（✅ 2026-10-17，中国移动 5G SA）：**

| 步骤 | 操作 | 解决 |
|---|---|---|
| 1 | Phh 设置 → IMS features：装 MediaTek R+ IMS APK、打开 Request IMS network、打开 Force 4G Calling → 重启 | 能打出（6.1） |
| 2 | Phh 设置 → Misc features → Telephony：打开 **Disable "Voice Call In" route** → 重启 | 通话有声音（6.3） |
| 3 | 装 6.5 的 Magisk 模块 → 重启 | 来电（6.4） |

**不需要做的**：改 profile_id（6.2）、改 `halVersion`（6.3 的备用方法）、打开 Allow binder thread on incoming calls，以及 Force display 5G network（它只影响状态栏的图标显示）。

### 6.1 安装 IMS（✅ 修问题 3）
1. **先连上 Wi-Fi**（安装时要从 treble.phh.me 下载 APK，没网点了没反应）。
2. 进入 **设置 → Phh Treble Settings → IMS features**：
   - 点 **Download and install IMS APK**（会显示为 *Install IMS APK for MediaTek R+ vendor*），等提示 “IMS apk installed! You may now reboot.”
   - 打开 **Request IMS network**
   - 打开 **Force the presence of 4G Calling setting**
   - **不用点 Create IMS APN**（运营商自己的 IMS APN 已经有了）
3. **重启**。
4. 在 **设置 → 网络 → SIM 卡** 里，打开“4G 通话 / VoLTE”之类的开关（如果有的话）。

**验证**：打一个电话出去，对方能接到就成功了。在本机上实测，中国移动 5G SA 下走的是 VoNR，编码是 `EVSAWB`。
> issue 里有人反映，打开 “Force 4G Calling” 后来电会失效，关掉才恢复，但关掉后 VoWiFi 会失效，数据也会降到 EDGE。在本机上全部打开没有遇到这个问题。

### 6.2 IMS APN 的 profile_id 改成 2（❌ 不需要）
来自 [issue #3](https://github.com/vbbot/HibreakProPatchingService/issues/3) 的建议。正式刷机后实测：中国移动 IMS APN 保持默认的 `profile_id=0`，修好 EAIC 后来电就正常了，**所以不用改**。如果你的运营商来电还是不行，可以试一下（改了会一直保留）：
```bash
adb shell
su
content query --uri content://telephony/carriers --projection _id,name,apn,type,profile_id --where "type LIKE '%ims%'"
# 找到 apn=ims 那一行，记下 _id（本机中国移动是 2936）
content update --uri content://telephony/carriers --bind profile_id:i:2 --where "_id=2936"
svc data disable
svc data enable
```

### 6.3 通话有声音（✅ 修问题 4）
**判断方法**：通话中没声音时，执行
```bash
adb shell "logcat -d -b crash | grep 'Abort message'"
```
如果看到 `connectAudioSourceToSink: a swOutput shall always be associated`，就是这个问题。

**原因**：vendor 的 `audio_policy_configuration*.xml` 里，`<module name="primary" halVersion="3.0">` 下同时声明了 `Voice Call In`（TELEPHONY_RX）和 `Telephony Tx`。AOSP 的音频策略看到 HAL 版本 ≥3，就会改用“音频补丁”方式建立通话路由，这条路在本机上会让 `audioserver` 崩溃，然后每 5 秒重启一次。

**修复（✅ 推荐，不需要 root，会一直保留）**：设置 → Phh Treble Settings → Misc features → Telephony → 打开 **Disable "Voice Call In" route**，然后重启。
- 它会在 Phh 生成的音频配置里去掉 `Voice Call In` 这条路由，音频策略就不会再走会崩溃的那条路了；
- 实测打开后通话双向都有声音，`audioserver` 一次都没崩（对应的属性是 `persist.sys.phh.disable_voice_call_in=true`）。

**备用方法（✅ 在 DSU 里实测过；需要 root，临时生效，重启后失效）**：如果上面的开关在你的系统里不管用，可以以 root 执行下面的脚本，把 `halVersion` 改成 2.0。注意**三个配置文件都要改**，系统实际加载的是其中一个变体。
```sh
#!/system/bin/sh
for n in audio_policy_configuration audio_policy_configuration_a2dp_offload_disabled audio_policy_configuration_bluetooth_legacy_hal; do
  F=/vendor/etc/$n.xml
  T=/data/local/tmp/$n.fix.xml
  [ -f "$F" ] || continue
  while mount | grep -q " $F "; do umount "$F" || break; done
  cp "$F" "$T"
  sed -i 's/<module name="primary" halVersion="3.0">/<module name="primary" halVersion="2.0">/' "$T"
  chmod 644 "$T"; chcon u:object_r:vendor_configs_file:s0 "$T"
  mount -o bind "$T" "$F"
done
setprop ctl.restart audioserver
```
**验证**：再打一次电话，有声音；`logcat -b crash` 里不再出现新的 Abort message，`pidof audioserver` 的进程号也不再变化。

### 6.4 来电能响铃（✅ 修问题 5）
**判断方法**：别人打来时显示“无人接听”，本机没反应，并且：
```bash
adb shell su -c "grep libmtk-ril /proc/mounts"     # 能看到一层 tmpfs 覆盖
adb shell "logcat -d | grep ECPI"                  # 来电时有 +ECPI: Invalid parameters
```
来电时 modem 其实已经通知了 RIL（logcat 里有 `+CRING: VOICE`），但后面的通话状态消息 `+ECPI` 被判为参数无效，系统没有生成来电，所以屏幕上什么都不显示。

**原因**：TrebleDroid 的 `/system/bin/rw-system.sh`（在 `vndk.rc` 的 `on post-fs` 阶段执行）开机时会**无条件**复制一份 `libmtk-ril.so`，把 `AT+EAIC=2` 改成 `=3`，再用 bind mount 盖在原文件上。这个改动在 HiBreak Pro 上会导致来电失效。

**永久修复**：用 6.5 的模块。下面是手动的临时修复（重启后失效），用来先验证。

**临时修复**：以 root 执行。直接 umount 会提示 busy，要先停 RIL。
> ⚠️ 要把命令写成脚本，用 `su -mm -c 'sh 脚本'` 执行（`-mm` 表示在全局挂载命名空间里执行，否则 umount 会提示 `Operation not permitted`）。不要直接在 PowerShell 里写 `su -c "...; ..."`：实测后半截命令会以 shell 用户身份执行，结果 RIL 被停掉以后启动不起来，手机就没有信号了。
```sh
#!/system/bin/sh
F=/vendor/lib64/libmtk-ril.so
setprop ctl.stop vendor.ril-daemon-mtk
sleep 3
while mount | grep -q " $F "; do umount "$F" || { umount -l "$F"; break; }; done
grep -c -a 'AT+EAIC=2' $F           # 输出 1 说明已经是原厂的 =2
setprop ctl.start vendor.ril-daemon-mtk
```
```bash
# 存成 eaic.sh 后执行：
adb push eaic.sh /data/local/tmp/eaic.sh
adb shell "su -mm -c 'sh /data/local/tmp/eaic.sh'; rm /data/local/tmp/eaic.sh"
```
执行期间信号会断几秒。等大约 30 秒，让网络和 IMS 重新注册，再让别人打进来测试。

> ⚠️ **不建议直接用 issue 里作者做的 `eaic2-magisk.zip` 模块**：它会把整个 `libmtk-ril.so` 换成作者手机上的版本。对比过，跟本机原厂的库**大小和哈希都不一样**（4,787,760 字节对比 4,787,768 字节），属于不同版本的固件。本机原厂库本来就是 `=2`，只要撤掉 TrebleDroid 的覆盖就行。

### 6.5 Magisk 模块 hibreak_eink：让修复永久生效
模块安装包是 `hibreak_eink-v7.zip`。在 Magisk 里选“从本地安装”，或者用 adb 安装：
```bash
adb push hibreak_eink-v7.zip /data/local/tmp/
adb shell "su -c 'magisk --install-module /data/local/tmp/hibreak_eink-v7.zip'"
adb reboot
```
**撤销**：在 Magisk 里禁用或删除这个模块，然后重启，所有改动都会恢复。模块不修改任何分区。

**模块内容：**

| 文件 | 执行时机 | 做什么 | 状态 |
|---|---|---|---|
| `system.prop` | 开机早期（SurfaceFlinger 启动之前） | ① `debug.sf.nobootanimation=1`：关掉开机动画，避开黑屏死锁（4.5）；② `vendor.xrz.disable_eink_vsync=1`：原厂默认值，HWC 不等墨水屏刷完的同步信号，实测滑动更平滑。原厂另外两个 HWC 属性（`color_restoration_suppoort`、`image_smoothing_suppoort`）实测没区别，没放进来 | ✅ |
| `post-fs-data.sh` | RIL 启动之前（阻塞执行） | `umount /vendor/lib64/libmtk-ril.so`，撤掉 TrebleDroid 的 EAIC=3 覆盖，RIL 第一次启动就加载原厂库，信号不会断 | ✅ 实测：开机日志 `eaic: stock EAIC=2`，来电能显示、能接通、有声音 |
| `service.sh` | 开机完成后 | ① 兜底：如果 EAIC 覆盖还在，就停 RIL → umount → 启动 RIL；② 写墨水屏节点 `clean_a2=1`（解决滑动卡顿）；③ 开机后 60 秒内每 15 秒检查一次 SurfaceFlinger，卡死就抓调用栈，然后自动重启 SurfaceFlinger | ✅ |

**看运行结果**：模块目录里有一个 `boot.log`，每次开机都会写几行：
```bash
adb shell "su -c 'cat /data/adb/modules/hibreak_eink/boot.log'"
# 10-17 09:26:31 ok: surfaceflinger responsive 60s after boot_completed, bootanim=   ← 没黑屏
# 10-17 08:56:02 RESCUE: ...surfaceflinger restarted...                             ← 黑屏了，已自动恢复
# 10-17 12:09:29 eaic: stock EAIC=2                                                  ← 来电修复成功
```
如果触发了自救，同一个目录里会留下 `hang_*.txt`（卡住时的调用栈，最多保留 3 份）。

---

## 7. 正式刷机（不用 DSU）

> ✅ **2026-10-16 已在本机实测**（原厂 3.4.6 + ponces gapps 16），流程参考了 [Vasu 的 HiBreak Pro 刷机教程](https://vbh.ai/hibreak-pro-guide-4-flashing-the-android-15-gsi/)。务必先完成第 2.4 节的备份。
> **关闭 vbmeta 校验是可选的**：本机实测**没刷 vbmeta 也能正常开机**（bootloader 已解锁，boot 是 Magisk 修补版；刷完后查看 6 个 vbmeta 分区的 flags，都还是 0，也就是校验开着）。所以可以先跳过第 1 步里刷 vbmeta 的那几行，**刷完 GSI 后开不了机（卡在开机画面或无限重启）时，再回 bootloader 补刷**。
> 需要刷的时候注意：这台机器有 **3 个 vbmeta 分区**（`vbmeta`、`vbmeta_system`、`vbmeta_vendor`），**3 个都要关闭校验，A/B 两个槽位都要刷**。2.4 节备份时，记得把 `vbmeta_system_a` 和 `vbmeta_vendor_a` 也一起导出来。
> 系统属性里的 `ro.boot.verifiedbootstate=green`、`ro.boot.vbmeta.device_state=locked` 是 Magisk 伪装出来的，不代表真实状态。要看真实的校验开关，用 root 读每个 vbmeta 分区第 120 字节开始的 4 个字节（flags）：0 = 校验开着，3 = 已关闭。

```bash
# 1. 进入 bootloader（fastboot 模式），清空数据
adb reboot bootloader
fastboot devices
fastboot -w
#    （可选）关闭 AVB 校验（用自己备份的原厂文件）。本机不刷也能开机，开不了机时再刷：
fastboot flash vbmeta_a        --disable-verity --disable-verification vbmeta.img
fastboot flash vbmeta_b        --disable-verity --disable-verification vbmeta.img
fastboot flash vbmeta_system_a --disable-verity --disable-verification vbmeta_system.img
fastboot flash vbmeta_system_b --disable-verity --disable-verification vbmeta_system.img
fastboot flash vbmeta_vendor_a --disable-verity --disable-verification vbmeta_vendor.img
fastboot flash vbmeta_vendor_b --disable-verity --disable-verification vbmeta_vendor.img

# 2. 进入 fastbootd（用户空间的 fastboot，刷 system 必须在这个模式下）
fastboot reboot fastboot

# 3. 刷入 GSI（先把 .img.xz 解压成 .img）
fastboot flash system aosp-arm64-ab-gapps-16.0-20250625.img
#    如果提示空间不够，先删掉 product 分区：fastboot delete-logical-partition product

# 4. 第一次开机前，务必清空数据（在 fastbootd 里再清一次，保证干净）
fastboot -w

# 5. 重启
fastboot reboot
```

> ⚠️ **第一次开机前一定要清空数据**（`fastboot -w`）。原厂系统留下的 data 和 GSI 不兼容，不清的话很可能卡开机、反复重启，或者开机后各种崩溃。
> - 第 1 步在 bootloader 里已经清过一次，第 4 步在 fastbootd 里刷完 system 后**再清一次**，确保第一次开机时 data 是空的。
> - 如果忘了清就已经开机了：重新进 fastboot 执行 `fastboot -w`，或者进 recovery 选“清除数据 / 恢复出厂设置”，然后再开机。
> - 清数据会删掉手机里的**所有**数据（包括内部存储里的文件），刷机前先备份好。
**刷完之后**：按以下顺序来：第 4 节（OTG 授权、跳过开机向导）→ 第 5 节（Magisk，记得修复运行环境）→ 装 6.5 的模块（关开机动画，避免以后开机黑屏）→ 第 6 节（打电话：Phh 设置里的 IMS 和 Voice Call In 开关）。
boot 分区保持“原厂 + Magisk 修补”就行，GSI 只替换 system，不动 boot。

---

## 8. 排错速查表

| 现象 | 可能原因 | 去看哪一节 |
|------|----------|-----------|
| 开机黑屏，按电源键有提示音 | 系统起来了，但屏幕没画面或卡死 | 4.1 / 4.3；一直不行就用 4.6 |
| 墨水屏黑屏或画面不动，开机动画不退出，但投屏能看到画面、adb 能用 | 开机动画和 SurfaceFlinger 在 GPU 上死锁 | 4.5（重启 SurfaceFlinger 救急；装 6.5 模块预防） |
| `adb devices` 什么都没有 | 数据线只能充电、USB 模式不对、没装驱动 | 2.1 |
| `adb devices` 显示 `unauthorized` | 没授权 | 4.2 |
| 每 1～2 分钟自己重启，logcat 里有 `WATCHDOG KILLING` | 开机向导导致 SurfaceFlinger 卡死 | 4.3 |
| `adb root` 提示 production builds | 原厂 boot 的限制，正常现象 | 5 |
| su 直接返回 `Permission denied` | 开机向导没完成 / Magisk 运行环境没修复 / 授权被拒 | 5.2 |
| 打出提示“无法接通” | IMS 没装或者没注册 | 6.1 |
| 能接通但没声音 | audioserver 崩溃 | 6.3（打开 Disable "Voice Call In" route） |
| 来电显示“无人接听”，本机没反应 | EAIC=3 | 6.4 / 6.5 |
| umount 提示 `Operation not permitted` | su 不在全局挂载命名空间 | 6.4（用 `su -mm`） |
| fastboot 模式下设备管理器显示错误 | 没装 Google USB 驱动 | 2.1 |
| DSU 退不出来 | DSU 被设成了每次开机启动 | 3.3 |

---

## 9. 常用诊断命令

```bash
# 系统状态
adb shell getprop ro.build.display.id                       # 当前系统版本（DSU 里会显示 treble_arm64_bgN...）
adb shell getprop ro.boot.verifiedbootstate                 # orange = bootloader 已解锁
adb shell "logcat -d | grep -c 'WATCHDOG KILLING'"           # 看门狗杀进程的次数
adb shell "logcat -d | grep 'WATCHDOG KILLING'"              # 看卡在了哪个线程
adb shell "logcat -d -b crash | grep -E 'Abort message|>>> '" # 崩溃记录

# 网络和通话
adb shell "dumpsys telephony.registry | grep -oE 'mVoiceRegState=[^,]*|getRilVoiceRadioTechnology=[^,]*'"
adb shell "dumpsys telephony_ims | grep -oE 'state=[A-Z_]+'"  # IMS 状态，UNAVAILABLE 就是没注册
adb shell "logcat -d | grep SpeechDriverNormal | grep codec"  # 看到 EVSAWB 说明走的是 VoLTE/VoNR

adb shell "su -c 'grep libmtk-ril /proc/mounts'"             # 有输出 = EAIC=3 的覆盖还在，来电会失效

# 屏幕合成 / 黑屏
adb shell "dumpsys SurfaceFlinger | grep -E 'composition=|usesClientComposition'"
adb shell "su -c 'cat /data/adb/modules/hibreak_eink/boot.log'"   # 模块的开机记录：ok / RESCUE / eaic
adb shell "su -c 'debuggerd -b \$(pidof surfaceflinger)'"         # 卡住时抓 SurfaceFlinger 的调用栈
```

---

## 10. 参考资料

- ponces TrebleDroid AOSP：https://github.com/ponces/treble_aosp
- TrebleDroid 设置 App 源码（IMS 设置项）：https://github.com/phhusson/treble_app/blob/master/app/src/main/java/me/phh/treble/app/ImsSettings.kt
- TrebleDroid `rw-system.sh`（EAIC 修改所在的文件）：https://github.com/TrebleDroid/device_phh_treble
- 来电问题的讨论（EAIC、profile_id）：https://github.com/vbbot/HibreakProPatchingService/issues/3
- AOSP 音频策略源码（通话路由逻辑 `updateCallRoutingInternal`）：https://android.googlesource.com/platform/frameworks/av/+/refs/tags/android-16.0.0_r2/services/audiopolicy/managerdefault/AudioPolicyManager.cpp
- Vasu 的 HiBreak Pro GSI 包：https://vbh.ai/hibreak-pro-gsi-release/
- XDA HiBreak Pro 开发帖：https://xdaforums.com/t/bigme-hibreak-pro-development-thread.4731041/
- DSU Sideloader：https://github.com/VegaBobo/DSU-Sideloader
- scrcpy（OTG 模式）：https://github.com/Genymobile/scrcpy
