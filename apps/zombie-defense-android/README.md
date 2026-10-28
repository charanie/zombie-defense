# 尸潮防线 · Android 壳（APK）

把零依赖的静态网页游戏包成可侧载安装的 APK：单 Activity + WebView，游戏资源全部打进
`assets/www`，启动后不请求网络，也不需要 `INTERNET` 权限。

## 产物

`dist/zombie-defense-v1.6.0.apk`（约 0.57 MB）

| 项 | 值 |
|---|---|
| package | `com.charanie.zombiedefense` |
| versionCode / versionName | `10600` / `1.6.0`（跟随 `package.json`） |
| minSdk / targetSdk | 24（Android 7.0+）/ 34 |
| 签名 | 自签名 v2 + v3，可直接侧载；不是 Play 商店包 |
| 权限 | 无 |
| 图标 | 仓库 `icons/icon-512.png` 生成的 5 档 mipmap |

已在真机（Xiaomi，Android 16 / arm64-v8a，屏幕 1280×2772 @520dpi）验证：安装、启动、
主菜单、选图、开场跳过、整备、招募、开始回合、`localStorage` 存档、横屏全屏均正常，
logcat 无崩溃、WebView 控制台 0 error。

## 安装

```bash
adb install -r dist/zombie-defense-v1.6.0.apk
adb shell am start -n com.charanie.zombiedefense/.MainActivity
```

或把 APK 传到手机点开安装（需允许“安装未知来源应用”）。

## 重新构建

前置：

- JDK 17（开发机上：`F:\ds harness\.tools\android\jdk17`）
- Android SDK：`build-tools;34.0.0` + `platforms;android-34`（`platform-tools` 用于调试）
- Python 3.10（只用标准库）

```powershell
python tools\android-build\build_apk.py            # release 包
python tools\android-build\build_apk.py --debug    # debuggable 包（开 WebView 远程调试，QA 用）
```

可用 `--sdk <dir>` / `--jdk <dir>` 覆盖路径，或设置 `ANDROID_SDK_ROOT` / `JAVA_HOME`。

## 构建原理

标准工具链，不引入 Gradle / AGP：

1. `aapt2 compile --dir res -o res.zip`
2. `aapt2 link`：生成资源表 + 二进制 `AndroidManifest.xml` + `R.java`
3. `javac`（`--release` 等价：`-source 8 -target 8`，classpath 用 `android.jar`）
4. `d8`：`java -cp build-tools/lib/d8.jar com.android.tools.r8.D8`
5. 用 Python 把 `classes.dex` 写进 APK（zip 追加）
6. `zipalign -f -p 4`
7. `keytool` 生成/复用密钥 → `apksigner sign`（v2 + v3）→ `apksigner verify`

### 两个环境坑（曾经踩过）

1. **这些工具必须有可写 TEMP**：aapt2 / javac / d8 / adb 都会因为 `%TEMP%` 不可写而直接
   `数据无效 (13)` 或 `Permission denied`，脚本把 `TEMP`/`TMP` 指到 `scratch/tmp`。
2. **工具进程只能写低完整性目录**：本工作区把工具放在低完整性沙箱里跑，仓库目录是中等
   完整性，写不进去。所以所有中间产物都放在工作区根新建的 scratch
   （`<workspace>/.android-tmp/zd-build`，自动继承 Low 标签），最后用 Python 把 APK 和
   签名密钥拷回仓库。

> 之前一版 APK 用手写 AXML 绕开 aapt2，结果真机安装报
> `INSTALL_PARSE_FAILED_MANIFEST_MALFORMED: ... requires that an explicit value for
> android:exported be defined`——手写 manifest 的属性解析在系统侧不可靠。改用 aapt2 生成的
> 标准 manifest 后一次安装成功。

## 结构

```
apps/zombie-defense-android/
  AndroidManifest.xml        唯一 manifest 源（versionCode/Name 由脚本注入）
  res/values/strings.xml     app_name
  res/mipmap-*/              launcher 图标（5 档）
  src/.../MainActivity.java  WebView 壳：https://appassets.local/ 虚拟源 + 拦截读 assets
  build-apk.cmd              Windows 一键入口
  keystore/                  签名密钥，已 gitignore（丢了就无法覆盖升级）
```

游戏资源通过 `https://appassets.local/` 这个**虚拟 https 源**提供（`shouldInterceptRequest`
从 `assets/www` 读文件）。不用 `file://` 是因为部分 WebView 版本下 `file://` 没有可用的
`localStorage` 源，最佳回合和设置会丢；真机已验证 `localStorage` 在虚拟源下可用。

## 已知取舍

- 横屏锁定（`sensorLandscape`）；全屏沉浸由 `MainActivity` 自己处理（API 30 的
  `WindowInsetsController` 放在独立嵌套类里，避免老系统 VerifyError）。
- WebView 调试只在 debuggable 构建里开启（`ApplicationInfo.FLAG_DEBUGGABLE`），release 关闭。
- Service Worker 在应用内也会注册（同源 https），离线本来就不依赖它。
- 音效仍是 Web Audio，首次触摸后才初始化。
