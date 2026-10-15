# Bigme HiBreak Pro 刷 GSI 指南（ponces Android 16 + Magisk）

> 适用：Bigme HiBreak Pro（墨水屏，MediaTek MT6877，内核 4.19）
> 目标：纯净 AOSP + 谷歌服务 + root，**能正常打电话 / 来电 / 通话有声音**
> 整理时间：2026-10-15
>
> 本文的每一步都标了验证状态：
> - ✅ **已实测**：在本机 DSU 里实际跑通
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
| 1 | 开机卡死 | 开机黑屏，系统每 1～2 分钟自己重启 | GApps **开机向导**让 SurfaceFlinger 卡死，看门狗（watchdog）杀掉 system_server，反复循环 | 用 adb 标记“已完成开机向导”，跳过向导 | 否（adb 即可） | ✅ |
| 2 | adb 无法 root、需要授权 | `adb root` 提示 *production builds*；`adb devices` 显示 `unauthorized` | 原厂 boot 设置了 `ro.debuggable=0`、`ro.adb.secure=1`，GSI 改不了 | 用 scrcpy OTG 模拟键盘点授权；root 用 Magisk | — | ✅ |
| 3 | 打不出也打不进 | 打出去没反应；别人打来提示“无法接通” | GSI 换掉了 system 分区，原厂的联发科 IMS 应用没了，VoLTE/VoNR 不工作 | 在 Phh 设置里装 IMS APK | 否（界面操作） | ✅ |
| 4 | 通话没声音 | 能接通但听不见，偶尔漏出不到 1 秒的声音 | AOSP 默认音频策略 + vendor 配置 `halVersion="3.0"` → 走新式通话路由，`audioserver` 崩溃循环 | 把 3 个音频配置的 primary `halVersion` 改成 `2.0` | **是**，且每次开机要重做 | ✅ |
| 5 | 来电不响 | 对方显示“无人接听”，本机没反应 | TrebleDroid 开机时把 `libmtk-ril.so` 里的 `AT+EAIC=2` 改成了 `=3` | 撤掉这层覆盖，恢复原厂 `=2` | **是**，且每次开机要重做 | ✅ |

**关于 root：** 问题 4、5 的修复必须用 root，而且 TrebleDroid 每次开机都会把它们还原，所以还需要一个“开机自动以 root 执行”的机制：
- **Magisk 模块**（本文采用）：不改动系统分区，换 GSI 后照样能用。
- **自带 root、且能 `adb root` + `adb remount` 的 ROM**：可以直接修改 GSI 里的 `/system/bin/rw-system.sh`（开机时以 root 执行），删掉 EAIC 那条 sed，再加上改音频配置的命令。但每换一次 GSI 都要重改；在原厂 boot 下 `adb root` 被禁止，这条路走不通。

**几个背景知识：**
- 这台手机出厂显示 Android 14，但 **vendor 分区其实是 Android 12 的底子**（指纹 `Bigme/HiBreak/Smartphone:12/SP1A.210812.016/...`）。新版 Android 的 GSI 跟它的兼容问题比较多。
- 问题 3、5 在**所有 TrebleDroid 系的 GSI**（ponces、AndyYan LineageOS、phh 等）上都会出现，跟 Android 版本无关。
- 问题 4 在 AOSP 13 以后的 GSI 上**都可能**出现（源码里这段逻辑 13～16 都有）。
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
adb shell su -c "dd if=/dev/block/by-name/vbmeta_a of=/sdcard/vbmeta_a.img"
adb pull /sdcard/boot_a.img
adb pull /sdcard/vbmeta_a.img
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

**原理**：通过 logcat 发现，`system_server` 卡在 `SurfaceControl.nativeGetCompositionDataspaces`（在等 SurfaceFlinger），看门狗等了 68 秒就把它杀了。只在开机向导出现时卡死，跳过向导就正常了。

### 4.4 关于“关闭 HW 叠加层”
网上很多教程说开机后要执行 `service call SurfaceFlinger 1008 i32 1`，或者在开发者选项里勾“停用 HW 叠加层”。
- 这条命令**需要 root**，而且**重启后会失效**。
- 在本机上查了一下，HWC 本来就把所有图层交给 GPU 合成（`composition=CLIENT`），所以**这一步不是关键**。真正导致卡死的是开机向导。

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

### 6.2 IMS APN 的 profile_id 改成 2（✅ 已做，单独效果没验证）
来自 [issue #3](https://github.com/vbbot/HibreakProPatchingService/issues/3) 的建议，会一直保留：
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

**修复**（临时生效，重启后失效）：以 root 执行下面的脚本。注意**三个配置文件都要改**，系统实际加载的是其中一个变体。
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
adb shell su -c "strings /vendor/lib64/libmtk-ril.so | grep 'AT+EAIC='"   # 显示 =3
adb shell su -c "mount | grep mtk-ril"                                     # 能看到一层 tmpfs 覆盖
```

**原因**：TrebleDroid 的 `/system/bin/rw-system.sh` 开机时会**无条件**复制一份 `libmtk-ril.so`，把 `AT+EAIC=2` 改成 `=3`，再用 bind mount 盖在原文件上。这个改动在 HiBreak Pro 上会导致来电失效。

**修复**（临时生效，重启后失效）：以 root 执行。直接 umount 会提示 busy，要先停 RIL：
```sh
#!/system/bin/sh
F=/vendor/lib64/libmtk-ril.so
setprop ctl.stop vendor.ril-daemon-mtk
sleep 3
while mount | grep -q " $F "; do umount "$F" || { umount -l "$F"; break; }; done
strings $F | grep 'AT+EAIC='        # 应该显示 =2
setprop ctl.start vendor.ril-daemon-mtk
```
等大约 30 秒，让网络和 IMS 重新注册，再让别人打进来测试。

> ⚠️ **不建议直接用 issue 里作者做的 `eaic2-magisk.zip` 模块**：它会把整个 `libmtk-ril.so` 换成作者手机上的版本。对比过，跟本机原厂的库**大小和哈希都不一样**（4,787,760 字节对比 4,787,768 字节），属于不同版本的固件。本机原厂库本来就是 `=2`，只要撤掉 TrebleDroid 的覆盖就行。

### 6.5 让修复永久生效
6.3 和 6.4 都是**临时的**，重启后就失效。计划做成两个 Magisk 模块（**还没做，做好后补充**）：
- `hibreak-callaudio`：在 `post-fs-data` 阶段（audioserver 启动之前）从原文件现场生成 `halVersion=2.0` 的副本，再 bind mount 上去。
- `hibreak-eaic2`：在 `post-fs-data` 阶段撤掉 EAIC=3 的覆盖；`service.sh` 再检查一次，如果覆盖又被加回来，就停 RIL、umount、重启 RIL。

---

## 7. 正式刷机（不用 DSU）

> ⚠️ **本节没有在本机实测过**，是按 GSI 刷机的通用流程整理的。务必先完成第 2.4 节的备份。

```bash
# 1. 进入 fastbootd（用户空间的 fastboot，刷 system 必须在这个模式下）
adb reboot fastboot

# 2. 关闭 AVB 校验（vbmeta 用自己备份的原厂文件）
fastboot --disable-verity --disable-verification flash vbmeta vbmeta_a.img

# 3. 刷入 GSI（先把 .img.xz 解压成 .img）
fastboot flash system aosp-arm64-ab-gapps-16.0-20250625.img
#    如果提示空间不够，先删掉 product 分区：fastboot delete-logical-partition product

# 4. 清空数据（必须做，否则可能开不了机）
fastboot -w

# 5. 重启
fastboot reboot
```
**刷完之后**：按第 4 节（OTG 授权、跳过开机向导）→ 第 5 节（Magisk）→ 第 6 节（打电话修复）的顺序来。
boot 分区保持“原厂 + Magisk 修补”就行，GSI 只替换 system，不动 boot。

---

## 8. 排错速查表

| 现象 | 可能原因 | 去看哪一节 |
|------|----------|-----------|
| 开机黑屏，按电源键有提示音 | 系统起来了，但屏幕没画面或卡死 | 4.1 / 4.3 |
| `adb devices` 什么都没有 | 数据线只能充电、USB 模式不对、没装驱动 | 2.1 |
| `adb devices` 显示 `unauthorized` | 没授权 | 4.2 |
| 每 1～2 分钟自己重启，logcat 里有 `WATCHDOG KILLING` | 开机向导导致 SurfaceFlinger 卡死 | 4.3 |
| `adb root` 提示 production builds | 原厂 boot 的限制，正常现象 | 5 |
| su 直接返回 `Permission denied` | 开机向导没完成 / Magisk 运行环境没修复 / 授权被拒 | 5.2 |
| 打出提示“无法接通” | IMS 没装或者没注册 | 6.1 |
| 能接通但没声音 | audioserver 崩溃 | 6.3 |
| 来电显示“无人接听” | EAIC=3 | 6.4 |
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

# 屏幕合成
adb shell "dumpsys SurfaceFlinger | grep -E 'composition=|usesClientComposition'"
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
