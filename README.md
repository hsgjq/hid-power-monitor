# hid-power-monitor · 2.4G 键鼠电量托盘

<p align="center">
  <b>不用装厂商驱动，也能看到无线键盘和鼠标的电量与充电状态</b><br>
  <i>托盘弹层 + 桌面浮条 + 低电量提醒 · 对设备只读，不写入任何配置</i>
</p>

<p align="center">
  <a href="https://github.com/hsgjq/hid-power-monitor"><img src="https://img.shields.io/badge/Platform-Windows%2010%20%7C%2011-0078D6?style=flat-square&logo=windows" alt="Platform" /></a>
  <a href="https://github.com/hsgjq/hid-power-monitor"><img src="https://img.shields.io/badge/Electron-44-2B2E3A?style=flat-square&logo=electron&logoColor=47848F" alt="Electron" /></a>
  <a href="https://github.com/hsgjq/hid-power-monitor"><img src="https://img.shields.io/badge/Vue-3.5-42B883?style=flat-square&logo=vue.js" alt="Vue" /></a>
  <a href="https://github.com/hsgjq/hid-power-monitor"><img src="https://img.shields.io/badge/TypeScript-5.9-3178C1?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" /></a>
  <a href="https://github.com/hsgjq/hid-power-monitor"><img src="https://img.shields.io/badge/HID-node--hid%203.4-8A2BE2?style=flat-square" alt="node-hid" /></a>
</p>

---

## 这个项目做什么

迈从键盘和狼蛛 SC580 这类国产 2.4G 外设，电量只有厂商自己的桌面驱动能读出来。为了看一眼剩余电量而装一个几百 MB、后台常驻多个服务的驱动套件并不划算，所以这个程序绕过厂商软件，直接用 HID 报文向接收器询问：接的那台设备还剩多少电、是不是在充电。

读到之后画在托盘图标上，点一下可以看详细面板，也可以让一条浮条常驻桌面。与设备的交互只有两类：读取报告，以及向键盘发一条查询电量的帧（`[0x13, 0x4a, ...]`，不带任何配置参数）。DPI、按键映射、回报率这些一律不写。

## 支持的设备

目前只支持下面两款，都是实测过的；其他品牌尚未支持。

| 设备 | 接收器 VID:PID | 通道 | 能读到 |
| --- | --- | --- | --- |
| 迈从 无线键盘 | `05AC:024F`（Compx 方案） | `0xFF02` 无线 / `0xFF04` 有线 | 电量、充电状态 |
| 狼蛛 SC580 无线鼠标 | `248A:5B2F`（泰凌公模 dongle） | MI_01 Col04 的 `0xFF00` feature report 12 | 电量、充电状态、固件型号 |

未支持的设备不会被悄悄丢掉。设置里有一栏「检测到的 HID 设备」，把枚举到的每一组设备连 VID:PID、集合的 usage page，以及它为什么没有显示（没有厂商自定义集合、字符串也不像 2.4G 接收器等）逐条列出，可以一键复制。要问"我的设备为什么读不到"，把这段清单贴出来最直接。

## 界面上能看到什么

托盘图标是一块 32×32 逐像素绘制的电池，不使用图片资源。按当前最低的那块电量绘制，低电变红、充电变绿、读不到数时只画外壳。悬停提示文字里带每台设备的实时数字。

点托盘图标弹出一块面板，宽 340，高度随内容变化。每台设备一行：读数、电池条、连接方式、固件型号、最后一次读到数的时间。

充电期间狼蛛不显示 100%。它的固件在充电时把电量字节钉死成 100，那是占位值而不是"已充满"，这段时间设备实际不上报电量。所以界面只显示"充电中"和一个闪电图标，数字沿用插线之前的最后一次真值并压暗。厂商驱动在这段时间放的是一段动画，同样不是数据。

设备休眠或被其他程序占用而读不到时，界面不会掉回 `--`，而是保留上一次的真值、标灰，副标题写「上次 HH:MM」。接收器真的拔掉时那一行整条消失，不留旧读数冒充现状。

桌面浮条是可选项，开启后常驻一条窄条，键盘在左、鼠标在右，顺序固定。整条可以拖动，但拖不出屏幕；改分辨率或拔外接屏之后会自己回到可见范围。点它不抢当前输入焦点。文字颜色可以在设置里改，低电与充电另有图标：状态不能只靠颜色表达，因为自定义颜色有可能正好撞上状态色。

低电量提醒由一次系统通知加两声短蜂鸣组成。阈值范围 0 到 50，默认 15；设为 0 即整体关闭，此时界面也不再标红。跌破阈值只提醒一次，回升到阈值 +5 以上才会重新触发；设备拔掉后重新插入算新的一次。点通知会打开面板。

再次启动程序（第二个实例）的行为是唤起面板，而不是把它收起。

开机自启要打包成 exe 之后才有意义，因为它记录的是当前可执行文件的路径。开发态这个开关被刻意拦住，否则写进注册表的是 Electron 本体路径，开机只会拉起一个读不到任何设备的空进程。

## 代码结构

```
src/
├── main/
│   ├── index.ts            # 单实例锁，托盘 / 弹层 / 浮条装配，IPC 注册
│   ├── flyout.ts           # 弹层窗口：尺寸随内容，底边锚在任务栏上方
│   ├── strip.ts            # 浮条窗口：拖动按帧跟随光标，摆放限制在工作区内
│   ├── tray.ts             # 32x32 BGRA 逐像素绘制托盘图标
│   ├── notify.ts           # 低电通知，带滞回与去重
│   ├── settings.ts         # userData/settings.json，颜色与坐标入参先校验
│   ├── hid/
│   │   ├── enumerate.ts    # node-hid 枚举，把一个接收器散出的多个集合归成一组
│   │   └── diagnostics.ts  # 「检测到的 HID 设备」清单的数据源
│   └── power/
│       ├── registry.ts     # 设备登记表：叫什么、是键盘还是鼠标、交给哪个 provider
│       ├── service.ts      # 30 秒轮询，以及上一次真值的缓存（stale 语义在这里）
│       ├── aula.ts         # 狼蛛 SC580
│       ├── mchose.ts       # 迈从
│       └── standard-battery.ts  # 按规范暴露电池的设备
├── preload/index.ts        # contextBridge 白名单
├── renderer/src/           # 弹层和浮条两套视图，共用一个渲染包
└── shared/types.ts         # 主进程与渲染层的类型契约
```

设备身份只在 `power/registry.ts` 定义一次。provider 只回测量值，不参与命名，加一台新设备就是加一行表项加一个 `measure` 函数。是否显示、按哪个协议读，全部走 `classifyGroup` 这一个判断口，诊断清单也复用它，因此不会出现"面板里没有但诊断清单说该显示"这种两处逻辑不一致。

样式按 tokens / base / panel / device / settings / strip 分成六个文件，入口按层叠顺序引入，没有堆在一个 CSS 里。

## 协议是怎么确定的

<details>
<summary>迈从：多帧回复，校验和缺了设备不理</summary>

无线端点是 20 字节 input/output，report ID `0x13`。查询帧为 `[0x13, 0x4a, 0x01, ...补零...]`，末尾补一个校验和——含 report ID 的字节求和取低 8 位，少这个字节设备完全不回。回复分成多帧，帧头是 `[cmd, 总帧数, 当前帧号]`，每帧去掉尾部校验再拼接才是完整载荷。拼好之后第 0 字节是电量，第 1 字节的高 4 位是充电标志。

收满分片即退出，不再写死等满 2 秒。这个读在主进程里同步执行，等满 2 秒会让整个程序每 30 秒冻结一次，拖动浮条时尤其明显。现在单次读取实测 59 / 38 / 42 毫秒。
</details>

<details>
<summary>狼蛛：帧是从厂商驱动的运行过程里抓到的</summary>

通道是 MI_01 Col04 上 usage page `0xFF00` 的 feature report 12，33 字节含 ID。这套帧不是猜出来的。SC580 是 2024 年初的旧款，官网网页驱动识别不了它，于是装上桌面驱动，并发打开同一个 HID 集合去读驱动写入的那帧——hidclass 给每个句柄独立的输入缓冲，所以能拿到。观察结果是驱动每约 2.5 秒发一次命令号 `0x05`，而带数据的读命令只有 `0x20`。回复里 `idx18` 是电量，`idx19` 是充电，`idx8..11` 是固件型号 ASCII（这台设备是 `M137`）。

需要记住的一点：只有 `0x20` 是读。`0x01` / `0x02` / `0x03` / `0x0f` 是写配置，回 `ack=01` 空载荷就意味着写入成功。开发过程中有一次按命令号回放，把这只鼠标的按键映射和回报率写坏了，点击失灵、DPI 变慢，而且写进了鼠标自身的存储，重新插拔不会恢复，最后靠驱动里的重置功能恢复。这个约束写在源码注释里，不要再往那些命令号发数据。
</details>

<details>
<summary>标准 HID 电池的读取路径</summary>

按规范暴露电池的集合（usage page `0x85`，或 `0x06` + usage `0x20`）不需要私有协议。但 node-hid 拿不到 `HidP_GetValueCaps`，无法把 usage 映射到具体的 bit 偏移，所以只在"恰好只有一个报告长度读得通、那一格正好 1 字节、值落在 1..100"时才出数，其余情况一律返回未知，界面显示 `--`。

不做"扫第一个看起来像百分比的字节"这种启发式：那个字节也可能是温度、剩余 mAh 或告警等级，随便取一个会给出一个像是真的错数字，比读不到更麻烦。这台机器上目前一组这样的集合都没有，所以这条路径只有代码，没有实机结论。
</details>

## 刻意不做的功能

充电剩余时间不做。鼠标在充电期间不报电量，没有可积分的输入；用"充电前电量加上充电时长"标定一次也不行，因为经常是边用边充，电流大头用在无线上报上。

没有实机的协议不写，否则等于拿别人的硬件试错。

配置写入不做。写坏鼠标那次之后，仓库里那批直接下发配置的脚本当天就已删除。

## 本地运行

```cmd
pnpm install
pnpm dev          :: 只起托盘，面板要你点图标才弹；开了浮条的话启动后就只有浮条
pnpm typecheck    :: 主进程用 tsc、渲染层用 vue-tsc 各查一遍
pnpm build        :: electron-vite 三层打包到 out/
pnpm icon         :: 重新生成 build/icon.ico（托盘那套自绘电池的矢量版）
pnpm dist         :: 先跑 build，再用 electron-builder 出 nsis 安装包到 dist/
```

打出来的安装包是 per-user 的 nsis，不要管理员权限，装完桌面和开始菜单各一个快捷方式。没配自动更新，所以产物里不该有 `latest.yml` 之类的更新元数据（`publish: null`）。

一个环境上的坑：把输出目录放在工作区内时，刚写出的 `*.asar` 会被本机的索引或杀软握住句柄，electron-builder 那步 `win-unpacked.tmp` 改名会一直 EPERM，删也删不掉（实测两次，换目录名也一样）。绕法是构建时把产物指到工作区外：`npx electron-builder --win -c.directories.output=%LOCALAPPDATA%\Temp\hpm-pack`。配置里同时把 `electronDist` 指向 `node_modules/electron/dist`，省掉下载再解压那一趟。

`pnpm probe` 是 HID 枚举的命令行版本。需要注意它默认会执行 CompX 写探针（`src/main/hid/compx.ts` 的 cmd 1/2/3/4，会真的向 `0xFF02` 端点发帧，cmd 1 还带 4 字节随机数）。那组帧只服务于协议调研，应用本身没有引用它，只想只读运行请加 `--skip-compx`。

`scripts/` 下其余的是调研期的只读工具：抓驱动帧、监听某个集合，以及校验只读守卫的断言脚本。

## 尚未完成

安装包还没在这台机器上装过。目前核对过的是产物结构：asar 里只有 `node_modules`、`out`、`package.json` 三项，原生模块只解出 win32-x64 那一份，源码目录和调研留档都没进包。装完之后托盘读数、开机自启那条注册表项（现在指向装好的 exe）都还要实机确认一次。

另外开发态和打包版用的是同一个 userData 目录（都叫 `hid-power-monitor`），单实例锁因此是共享的：dev 在跑的时候启动装好的 exe，后者会立刻退出。要么先关 dev，要么给开发态单独设一个 userData。

蓝牙路径待实机验证。枚举层能看到蓝牙 HID 设备（node-hid 走的就是 HID 类），但同一台键盘切换到蓝牙后 VID:PID 会变，私有协议不再命中；BLE 的电量还常常走 GATT Battery Service，不一定同时提供 HID feature report。本机目前没有可测的蓝牙键鼠。

把 HID 读取挪出主线程暂时没做。已经验证 node-hid 能在 `worker_threads` 里加载（worker 枚举到 43 台，与主线程一致），但那要把整条轮询链路改成异步，而唯一可靠的验证方式是拿真实设备跑端到端，收益只是每 30 秒省下几十毫秒，所以这一步先放着。

## 想支持自己的设备

需要三样信息：设备型号、连接方式（2.4G / 有线 / 蓝牙）、以及 `VID` 和 `PID`——面板里的诊断清单可以直接复制。有抓包条件的话，附一份 Wireshark / USBPcap 的交互数据包会快很多。

代码上要改的只有一处：在 `power/registry.ts` 加一行表项，再写一个只回测量值的 `measure(group)`。判据必须能被自己证伪，读不通就回 `percent: null` 让界面显示 `--`，不要填一个数值合理的猜测。

---

<p align="center">
  <b>如果它帮你省掉了一个厂商驱动套件，欢迎点个 Star。</b><br>
  有问题或希望支持你手上那台设备，开 Issue 时把诊断清单一起贴上来。
</p>
