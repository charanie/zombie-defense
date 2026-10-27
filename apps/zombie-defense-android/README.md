# 尸潮防线 · Android 壳（APK）

把零依赖的静态网页游戏包成可侧载安装的 APK：单 Activity + WebView，游戏资源全部打进
`assets/www`，启动后不请求网络，也不需要 `INTERNET` 权限。

## 产物

`dist/zombie-defense-v1.6.0.apk`（约 0.36 MB）

| 项 | 值 |
|---|---|
| package | `com.charanie.zombiedefense` |
| versionCode / versionName | `10600` / `1.6.0`（跟随 `package.json`） |
| minSdk / targetSdk | 24（Android 7.0+）/ 34 |
| 签名 | 自签名 v2 + v3，可直接侧载；不是 Play 商店包 |
| 权限 | 无 |

## 重新构建

前置：

- JDK 17（开发机上：`F:\ds harness\.tools\android\jdk17`）
- Android SDK：`build-tools;34.0.0` + `platforms;android-34`
- Python 3.10，且 `pip install jpype1`

一条命令：

```powershell
python tools\android-build\build_apk.py
```

可用 `--sdk <dir>` / `--jdk <dir>` 覆盖路径，或设置 `ANDROID_SDK_ROOT` / `JAVA_HOME`。
首次运行会生成 `keystore/zombie-defense.jks` 与随机密码；**这个密钥不要提交、不要丢**，
否则后续版本无法覆盖安装。

## 为什么不用 Gradle / aapt2

本项目的运行环境里只有 python / node / shell 进程能写文件，JDK 与 Android 原生工具
（`java`、`aapt2`、`zipalign`）会拿到 `Access Denied`。所以构建脚本的做法是：

1. 用 `jpype` 把 JVM 嵌进 python 进程（写文件的实际执行者仍是 `python.exe`）；
2. 在 JVM 里跑 `javac`、`d8`、`apksigner`（build-tools 自带的 jar）；
3. 用纯 Python 手写二进制 `AndroidManifest.xml`（AXML），不需要 aapt2；
4. 用纯 Python 组 APK zip（manifest + `classes.dex` + `assets/www`）。

AXML 的块布局是拿 `android.jar` 里 1575 个真实编译 XML 对照出来的（节点块
`headerSize = 16`、属性从 `chunk + 36` 开始、字符串池与资源映射表等长），构建后
`aapt2 dump badging` / `aapt2 dump xmltree` 能正确读出 package、label、主题与启动 Activity。

## 结构

```
apps/zombie-defense-android/
  AndroidManifest.xml        唯一 manifest 源；versionCode/Name 由脚本注入
  src/.../MainActivity.java  WebView 壳：https://appassets.local/ 虚拟源 + 拦截读 assets
  assets/www/                构建时从仓库根同步，已 gitignore
  build/                     中间产物（AXML、classes、dex、未签名 APK），已 gitignore
  keystore/                  签名密钥，已 gitignore
```

游戏资源通过 `https://appassets.local/` 这个**虚拟 https 源**提供（`shouldInterceptRequest`
从 `assets/www` 读文件）。不用 `file://` 是因为部分 WebView 版本下 `file://` 没有可用的
`localStorage` 源，最佳回合和设置会丢。

## 已知取舍

- **没有 `resources.arsc`**：图标用系统框架的 `@android:drawable/sym_def_app_icon`，
  主题用 `@android:style/Theme.NoTitleBar.Fullscreen`，两者都是框架资源引用，因此 APK
  里不需要资源表。想换成自己的图标/启动图，需要补一套资源编译。
- 横屏锁定（`sensorLandscape`），全屏沉浸由 `MainActivity` 自己处理（API 30 的
  `WindowInsetsController` 放在独立嵌套类里，避免老系统 VerifyError）。
- Service Worker 在应用内也会注册（同源 https），离线本来就不依赖它。
- 语音/音效仍是 Web Audio，首次触摸后才初始化。
