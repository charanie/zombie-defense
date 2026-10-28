#!/usr/bin/env python3
"""构建尸潮防线 Android APK（标准工具链：aapt2 + javac + d8 + zipalign + apksigner）。

为什么不用 Gradle：本项目是零依赖静态站点，单 Activity 的壳不需要 AGP / 依赖解析。

两个环境细节（踩过的坑）：
1. aapt2 / javac / d8 / apksigner / zipalign 需要一个**可写的 TEMP**，脚本会指到 scratch/tmp。
2. 这些工具在本工作区里以低完整性进程运行，只能写“低完整性”目录；仓库目录本身是中等完整性，
   所以所有中间产物都放在 newly-created 的 scratch 里，最后用 python 把 APK / 密钥拷回仓库。

产物：dist/zombie-defense-v<版本>.apk（自签名，可侧载）
用法：python tools/android-build/build_apk.py [--sdk <dir>] [--jdk <dir>]
"""
import argparse
import json
import os
import secrets
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
APP = REPO / "apps" / "zombie-defense-android"
WORKSPACE = REPO.parents[1]
SCRATCH = WORKSPACE / ".android-tmp" / "zd-build"


def die(msg):
    print("ERROR: " + msg, file=sys.stderr)
    sys.exit(1)


def step(msg):
    print("==> " + msg, flush=True)


def run(cmd, env, cwd=None):
    print("    $ " + " ".join(str(c) for c in cmd), flush=True)
    proc = subprocess.run([str(c) for c in cmd], cwd=str(cwd or SCRATCH), env=env,
                          capture_output=True, text=True, encoding="utf-8", errors="replace")
    if proc.returncode != 0:
        out = ((proc.stdout or "") + (proc.stderr or "")).strip()
        print(out[-4000:], file=sys.stderr)
        die("命令失败（%d）" % proc.returncode)
    return proc


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--debug", action="store_true", help="debuggable build for WebView QA")
    ap.add_argument("--sdk", default=os.environ.get("ANDROID_SDK_ROOT") or os.environ.get("ANDROID_HOME")
                    or r"F:\ds harness\.tools\android\sdk")
    ap.add_argument("--jdk", default=os.environ.get("JAVA_HOME") or r"F:\ds harness\.tools\android\jdk17")
    args = ap.parse_args()

    sdk, jdk = Path(args.sdk), Path(args.jdk)
    bt = sdk / "build-tools" / "34.0.0"
    android_jar = sdk / "platforms" / "android-34" / "android.jar"
    aapt2 = bt / "aapt2.exe"
    zipalign = bt / "zipalign.exe"
    d8_jar = bt / "lib" / "d8.jar"
    apksigner_jar = bt / "lib" / "apksigner.jar"
    java = jdk / "bin" / "java.exe"
    javac = jdk / "bin" / "javac.exe"
    keytool = jdk / "bin" / "keytool.exe"
    for p in (aapt2, zipalign, d8_jar, apksigner_jar, android_jar, java, javac, keytool):
        if not p.exists():
            die("缺少工具：%s（需要 build-tools;34.0.0 + platforms;android-34 + JDK 17）" % p)

    # scratch 必须是新建的低完整性目录（工作区根有可继承的 Low 标签）
    if SCRATCH.exists():
        shutil.rmtree(SCRATCH)
    for d in (SCRATCH, SCRATCH / "tmp", SCRATCH / "gen", SCRATCH / "obj", SCRATCH / "dex"):
        d.mkdir(parents=True, exist_ok=True)

    env = dict(os.environ)
    env["JAVA_HOME"] = str(jdk)
    env["TEMP"] = str(SCRATCH / "tmp")
    env["TMP"] = str(SCRATCH / "tmp")
    env["PATH"] = str(jdk / "bin") + os.pathsep + str(bt) + os.pathsep + env.get("PATH", "")

    version = json.loads((REPO / "package.json").read_text(encoding="utf-8"))["version"]
    major, minor, patch = (int(x) for x in version.split("."))
    version_code = major * 10000 + minor * 100 + patch
    step("版本 v%s（versionCode %d） / scratch=%s" % (version, version_code, SCRATCH))

    # 1. 同步 www 到 scratch
    step("同步静态资源")
    www = SCRATCH / "www"
    www.mkdir()
    for name in ("index.html", "styles.css", "menu.css", "manifest.webmanifest", "sw.js"):
        shutil.copy2(REPO / name, www / name)
    for name in ("src", "icons"):
        shutil.copytree(REPO / name, www / name)
    total = sum(f.stat().st_size for f in www.rglob("*") if f.is_file())
    count = sum(1 for f in www.rglob("*") if f.is_file())
    step("资源 %.2f MB / %d 个文件" % (total / 1048576.0, count))

    # 2. aapt2 compile + link
    step("aapt2 compile")
    res_zip = SCRATCH / "res.zip"
    run([aapt2, "compile", "--dir", APP / "res", "-o", res_zip], env)

    step("aapt2 link" + ("（debug）" if args.debug else ""))
    base_apk = SCRATCH / "base-unsigned.apk"
    link_args = [aapt2, "link", "-o", base_apk, "-I", android_jar,
         "--manifest", APP / "AndroidManifest.xml", "-A", SCRATCH,
         "--java", SCRATCH / "gen", "--auto-add-overlay",
         "--min-sdk-version", "24", "--target-sdk-version", "34",
         "--version-code", str(version_code), "--version-name", version, res_zip]
    if args.debug:
        link_args.append("--debug-mode")
    run(link_args, env)

    # 3. Java -> dex
    step("javac")
    sources = [str(p) for p in (APP / "src").rglob("*.java")] + [str(p) for p in (SCRATCH / "gen").rglob("*.java")]
    run([javac, "-encoding", "UTF-8", "-source", "8", "-target", "8", "-Xlint:-options",
         "-classpath", android_jar, "-d", SCRATCH / "obj"] + sources, env)
    classes = [str(p) for p in (SCRATCH / "obj").rglob("*.class")]
    step("javac %d 个 class" % len(classes))

    step("d8")
    run([java, "-cp", d8_jar, "com.android.tools.r8.D8", "--release", "--min-api", "24",
         "--lib", android_jar, "--output", SCRATCH / "dex"] + classes, env)
    dex_file = SCRATCH / "dex" / "classes.dex"
    if not dex_file.exists():
        die("d8 没有生成 classes.dex")
    step("classes.dex %d 字节" % dex_file.stat().st_size)

    # 4. 放入 classes.dex
    step("打包 classes.dex")
    with zipfile.ZipFile(base_apk, "a", zipfile.ZIP_DEFLATED) as z:
        z.write(dex_file, "classes.dex")

    # 5. 对齐
    step("zipalign")
    aligned = SCRATCH / "app-aligned.apk"
    run([zipalign, "-f", "-p", "4", base_apk, aligned], env)

    # 6. 签名（密钥优先复用仓库里的，其次 scratch 里的，最后新生成）
    repo_key = APP / "keystore" / "zombie-defense.jks"
    repo_pass = APP / "keystore" / "keystore-pass.txt"
    ks = SCRATCH / "signing.jks"
    pwfile = SCRATCH / "signing-pass.txt"
    if repo_key.exists() and repo_pass.exists():
        shutil.copy2(repo_key, ks)
        shutil.copy2(repo_pass, pwfile)
        step("复用已有签名密钥")
    else:
        step("生成自签名密钥")
        password = "".join(secrets.choice("abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789")
                           for _ in range(24))
        run([keytool, "-genkeypair", "-keystore", ks, "-alias", "zd", "-keyalg", "RSA",
             "-keysize", "2048", "-validity", "10000", "-storepass", password,
             "-keypass", password, "-dname", "CN=Zombie Defense, OU=Game, O=Charanie, C=CN"], env)
        pwfile.write_text(password, encoding="ascii")
    password = pwfile.read_text(encoding="ascii").strip()

    final = SCRATCH / ("zombie-defense-v%s%s.apk" % (version, "-debug" if args.debug else ""))
    step("apksigner sign")
    run([java, "-jar", apksigner_jar, "sign", "--ks", ks, "--ks-pass", "pass:" + password,
         "--key-pass", "pass:" + password, "--ks-key-alias", "zd", "--out", final, aligned], env)

    step("apksigner verify")
    v = run([java, "-jar", apksigner_jar, "verify", "-v", "--print-certs", final], env)
    for line in v.stdout.splitlines():
        if "Verified using" in line or "certificate DN" in line:
            print("    " + line.strip())

    step("aapt2 dump badging")
    b = run([aapt2, "dump", "badging", final], env)
    for line in b.stdout.splitlines():
        if line.startswith(("package:", "application-label", "application:", "launchable-activity:",
                            "sdkVersion:", "targetSdkVersion:")):
            print("    " + line.strip())

    # 7. 拷回仓库（python 有仓库写权限；工具没有）
    out_dir = REPO / "dist"
    out_dir.mkdir(parents=True, exist_ok=True)
    apk = out_dir / final.name
    shutil.copy2(final, apk)
    APP.joinpath("keystore").mkdir(parents=True, exist_ok=True)
    if not repo_key.exists():
        shutil.copy2(ks, repo_key)
    if not repo_pass.exists():
        shutil.copy2(pwfile, repo_pass)
    step("APK: %s（%.2f MB）" % (apk, apk.stat().st_size / 1048576.0))


if __name__ == "__main__":
    main()
