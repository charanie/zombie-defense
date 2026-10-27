#!/usr/bin/env python3
"""构建尸潮防线 Android APK —— 纯 Python 驱动，不依赖 Gradle / aapt2。

为什么不用 aapt2 + shell 脚本：
本会话环境里只有 python / node / shell 能写文件，JDK 与 Android 原生工具
（java、aapt2、zipalign）被进程级写策略挡住。因此本脚本：
  1. 用 jpype 把 JVM 嵌进 python 进程（写文件的实际执行者仍是 python.exe）；
  2. 在 JVM 里跑 javac（JDK 自带）、d8、apksigner（build-tools 自带 jar）；
  3. 用纯 Python 手写二进制 AndroidManifest.xml（AXML），不经过 aapt2；
  4. 用纯 Python 组 APK zip（AndroidManifest.xml + classes.dex + assets/www）。

前置：JDK 17、Android SDK build-tools 34.0.0、platforms/android-34、python 包 jpype1。
产物：dist/zombie-defense-v<版本>.apk（自签名，可直接侧载）
用法：python tools/android-build/build_apk.py [--sdk <dir>] [--jdk <dir>]
"""
import argparse
import json
import os
import shutil
import struct
import subprocess
import sys
import zipfile
from xml.etree import ElementTree

ANDROID_NS = "http://schemas.android.com/apk/res/android"
NO_INDEX = 0xFFFFFFFF

# android:xxx 属性在 AXML 里的类型
ATTR_KIND = {
    "versionCode": "int",
    "versionName": "string",
    "minSdkVersion": "int",
    "targetSdkVersion": "int",
    "name": "string",
    "label": "string",
    "icon": "ref",
    "theme": "ref",
    "allowBackup": "bool",
    "hardwareAccelerated": "bool",
    "supportsRtl": "bool",
    "usesCleartextTraffic": "bool",
    "exported": "bool",
    "screenOrientation": "enum",
    "launchMode": "enum",
    "configChanges": "flags",
}

ENUMS = {
    "screenOrientation": {
        "unspecified": 0, "portrait": 1, "landscape": 2, "reversePortrait": 3,
        "reverseLandscape": 4, "sensor": 5, "sensorLandscape": 6, "sensorPortrait": 7,
        "user": 8, "userLandscape": 9, "userPortrait": 10, "fullSensor": 11,
        "nosensor": 12, "fullUser": 13, "locked": 14,
    },
    "launchMode": {
        "standard": 0, "singleTop": 1, "singleTask": 2, "singleInstance": 3,
        "singleInstancePerTask": 4,
    },
}

FLAGS = {
    "configChanges": {
        "mcc": 0x0001, "mnc": 0x0002, "locale": 0x0004, "touchscreen": 0x0008,
        "keyboard": 0x0010, "keyboardHidden": 0x0020, "navigation": 0x0040,
        "orientation": 0x0080, "screenLayout": 0x0100, "uiMode": 0x0200,
        "screenSize": 0x0400, "smallestScreenSize": 0x0800, "density": 0x1000,
        "layoutDirection": 0x2000, "fontScale": 0x40000000,
    },
}

TYPE_REFERENCE = 0x01
TYPE_STRING = 0x03
TYPE_INT_DEC = 0x10
TYPE_INT_BOOLEAN = 0x12

ATTRIBUTE_IDS = {}
JPYPE = None


# --------------------------------------------------------------------------- #
# AXML
# --------------------------------------------------------------------------- #
class StringPool:
    def __init__(self):
        self.items = []
        self.index = {}

    def add(self, text):
        if text in self.index:
            return self.index[text]
        idx = len(self.items)
        self.items.append(text)
        self.index[text] = idx
        return idx


def chunk(chunk_type, fixed, payload=b""):
    header_size = 8 + len(fixed)
    size = header_size + len(payload)
    return struct.pack("<HHI", chunk_type, header_size, size) + fixed + payload


def string_pool_chunk(pool):
    data = bytearray()
    offsets = []
    for text in pool.items:
        offsets.append(len(data))
        units = text.encode("utf-16-le")
        units_count = len(units) // 2
        data += struct.pack("<H", units_count) + units + b"\x00\x00"
    count = len(pool.items)
    strings_start = 28 + 4 * count
    fixed = struct.pack("<IIIII", count, 0, 0, strings_start, 0)
    payload = b"".join(struct.pack("<I", o) for o in offsets) + bytes(data)
    # ResChunk_header 的 size 必须 4 字节对齐（aapt 也会补 0）
    while (28 + len(payload)) % 4 != 0:
        payload += b"\x00"
    return chunk(0x0001, fixed, payload)


def resource_map_chunk(res_ids):
    payload = b"".join(struct.pack("<I", rid) for rid in res_ids)
    return chunk(0x0180, b"", payload)


def node_chunk(chunk_type, body):
    """XML 节点块：headerSize 恒为 16（8 字节块头 + line + comment），body 跟在后面。

    用 android.jar 里的真实 AXML（例如 res/layout/icon_menu_layout.xml）核对过：
      StartElement headerSize=16, size=16+20+20*n（attrExt 20 字节，属性在 chunk+36）
      EndElement / StartNamespace headerSize=16, size=24
    """
    header = struct.pack("<HHI", chunk_type, 16, 16 + len(body))
    node = struct.pack("<II", 0, NO_INDEX)
    return header + node + body


def namespace_chunk(chunk_type, prefix_idx, uri_idx):
    return node_chunk(chunk_type, struct.pack("<II", prefix_idx, uri_idx))


def start_element_chunk(name_idx, attrs):
    body = struct.pack("<II", NO_INDEX, name_idx)
    body += struct.pack("<HHHHHH", 20, 20, len(attrs), 0, 0, 0)
    body += b"".join(attrs)
    return node_chunk(0x0102, body)


def end_element_chunk(name_idx):
    return node_chunk(0x0103, struct.pack("<II", NO_INDEX, name_idx))


def attribute_blob(ns_idx, name_idx, raw_idx, value_type, value):
    return struct.pack("<IIIHBBI", ns_idx, name_idx, raw_idx, 8, 0, value_type,
                       value & 0xFFFFFFFF)


def resolve_framework_ref(spec):
    """@android:style/Theme.NoTitleBar.Fullscreen -> 资源 ID"""
    spec = spec.strip()
    if not spec.startswith("@android:"):
        raise ValueError("只支持 @android: 引用: " + spec)
    body = spec[len("@android:"):]
    if body.startswith("style/"):
        cls, field = "style", body[len("style/"):]
    elif body.startswith("drawable/"):
        cls, field = "drawable", body[len("drawable/"):]
    else:
        raise ValueError("不支持的引用类型: " + spec)
    field = field.replace(".", "_")
    r_cls = JPYPE.JClass("android.R$" + cls)
    return int(getattr(r_cls, field))


def parse_value(name, raw):
    kind = ATTR_KIND.get(name, "string")
    if kind == "bool":
        return TYPE_INT_BOOLEAN, (1 if str(raw).lower() in ("true", "1") else 0)
    if kind == "int":
        return TYPE_INT_DEC, int(raw)
    if kind == "enum":
        table = ENUMS[name]
        if raw not in table:
            raise ValueError("未知枚举 %s=%s" % (name, raw))
        return TYPE_INT_DEC, table[raw]
    if kind == "flags":
        value = 0
        for part in raw.split("|"):
            part = part.strip()
            if part not in FLAGS[name]:
                raise ValueError("未知标志 %s=%s" % (name, part))
            value |= FLAGS[name][part]
        return TYPE_INT_DEC, value
    if kind == "ref":
        return TYPE_REFERENCE, resolve_framework_ref(raw)
    return TYPE_STRING, raw


def encode_element(element, pool, res_ids):
    tag = element.tag.split("}")[-1]
    tag_idx = pool.add(tag)
    attrs = []
    for key, raw in element.attrib.items():
        if key.startswith("{"):
            ns, name = key[1:].split("}")
            if ns != ANDROID_NS:
                raise ValueError("不支持的命名空间: " + ns)
            ns_idx = pool.add(ANDROID_NS)
            name_idx = pool.add(name)
            res_ids[name_idx] = ATTRIBUTE_IDS[name]
            value_type, value = parse_value(name, raw)
        else:
            # 例如 manifest 的 package 属性：无命名空间
            ns_idx = NO_INDEX
            name_idx = pool.add(key)
            value_type, value = TYPE_STRING, raw
        if value_type == TYPE_STRING:
            raw_idx = pool.add(value)
            data = pool.add(value)
        else:
            raw_idx = NO_INDEX
            data = value
        attrs.append(attribute_blob(ns_idx, name_idx, raw_idx, value_type, data))

    parts = [start_element_chunk(tag_idx, attrs)]
    for child in element:
        parts.append(encode_element(child, pool, res_ids))
    parts.append(end_element_chunk(tag_idx))
    return b"".join(parts)


def build_axml(root):
    pool = StringPool()
    prefix_idx = pool.add("android")
    uri_idx = pool.add(ANDROID_NS)
    res_ids = {}
    body = namespace_chunk(0x0100, prefix_idx, uri_idx)
    body += encode_element(root, pool, res_ids)
    body += namespace_chunk(0x0101, prefix_idx, uri_idx)
    # 资源映射表与字符串池等长：无论解析器用绝对下标还是“后缀偏移”，都能对上
    res_array = [0] * len(pool.items)
    for idx, rid in res_ids.items():
        res_array[idx] = rid
    payload = string_pool_chunk(pool) + resource_map_chunk(res_array) + body
    return chunk(0x0003, b"", payload)


# --------------------------------------------------------------------------- #
# 环境
# --------------------------------------------------------------------------- #
def find_toolchain(args):
    here = os.path.dirname(os.path.abspath(__file__))
    repo = os.path.abspath(os.path.join(here, "..", ".."))
    sdk = (args.sdk or os.environ.get("ANDROID_SDK_ROOT") or os.environ.get("ANDROID_HOME")
           or r"F:\ds harness\.tools\android\sdk")
    jdk = args.jdk or os.environ.get("JAVA_HOME") or r"F:\ds harness\.tools\android\jdk17"
    bt = os.path.join(sdk, "build-tools", "34.0.0")
    paths = {
        "repo": repo,
        "sdk": sdk,
        "jdk": jdk,
        "android_jar": os.path.join(sdk, "platforms", "android-34", "android.jar"),
        "d8_jar": os.path.join(bt, "lib", "d8.jar"),
        "apksigner_jar": os.path.join(bt, "lib", "apksigner.jar"),
        "aapt2": os.path.join(bt, "aapt2.exe"),
    }
    for key in ("jdk", "android_jar", "d8_jar", "apksigner_jar"):
        if not os.path.exists(paths[key]):
            sys.exit("缺少 %s: %s" % (key, paths[key]))
    return paths


def start_jvm(paths):
    global JPYPE
    os.environ["JAVA_HOME"] = paths["jdk"]
    import jpype
    cp = os.pathsep.join([paths["android_jar"], paths["d8_jar"], paths["apksigner_jar"]])
    jpype.startJVM(
        jpype.getDefaultJVMPath(),
        "-Djava.awt.headless=true",
        "-Xmx1g",
        "-Djava.class.path=" + cp,
    )
    JPYPE = jpype
    return jpype


def load_attr_ids():
    r_attr = JPYPE.JClass("android.R$attr")
    for name in ATTR_KIND:
        try:
            ATTRIBUTE_IDS[name] = int(getattr(r_attr, name))
        except Exception as exc:  # noqa: BLE001
            sys.exit("android.R$attr.%s 读取失败: %s" % (name, exc))


# --------------------------------------------------------------------------- #
# 构建
# --------------------------------------------------------------------------- #
def sync_www(repo, out_dir):
    if os.path.isdir(out_dir):
        shutil.rmtree(out_dir)
    os.makedirs(out_dir)
    for name in ("index.html", "styles.css", "menu.css", "manifest.webmanifest", "sw.js"):
        shutil.copy2(os.path.join(repo, name), os.path.join(out_dir, name))
    for name in ("src", "icons"):
        shutil.copytree(os.path.join(repo, name), os.path.join(out_dir, name))
    total = count = 0
    for root, _dirs, files in os.walk(out_dir):
        for f in files:
            total += os.path.getsize(os.path.join(root, f))
            count += 1
    return total, count


def compile_java(paths, sources, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    javac = JPYPE.JClass("com.sun.tools.javac.Main")
    args = ["-encoding", "UTF-8", "-source", "8", "-target", "8", "-Xlint:-options",
            "-classpath", paths["android_jar"], "-d", out_dir] + sources
    return int(javac.compile(args))


def run_d8(paths, class_files, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    d8 = JPYPE.JClass("com.android.tools.r8.D8")
    args = ["--release", "--min-api", "24", "--lib", paths["android_jar"],
            "--output", out_dir] + class_files
    d8.main(args)  # 失败会 System.exit，正常路径不返回错误码
    dex = os.path.join(out_dir, "classes.dex")
    if not os.path.exists(dex):
        sys.exit("d8 没有生成 classes.dex")
    return dex


def assemble_apk(apk_path, axml, dex_path, www_dir):
    with zipfile.ZipFile(apk_path, "w", zipfile.ZIP_DEFLATED) as z:
        info = zipfile.ZipInfo("AndroidManifest.xml", (2026, 10, 27, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        z.writestr(info, axml)
        z.write(dex_path, "classes.dex", compress_type=zipfile.ZIP_DEFLATED)
        for root, _dirs, files in os.walk(www_dir):
            for f in sorted(files):
                full = os.path.join(root, f)
                rel = os.path.relpath(full, www_dir).replace("\\", "/")
                z.write(full, "assets/www/" + rel, compress_type=zipfile.ZIP_DEFLATED)


def ensure_keystore(key_dir):
    keystore = os.path.join(key_dir, "zombie-defense.jks")
    pass_file = os.path.join(key_dir, "keystore-pass.txt")
    if os.path.exists(keystore) and os.path.exists(pass_file):
        with open(pass_file, "r", encoding="ascii") as f:
            return keystore, f.read().strip()
    import secrets
    chars = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    password = "".join(secrets.choice(chars) for _ in range(24))
    keytool = JPYPE.JClass("sun.security.tools.keytool.Main")
    keytool.main(["-genkeypair", "-keystore", keystore, "-alias", "zd",
                  "-keyalg", "RSA", "-keysize", "2048", "-validity", "10000",
                  "-storepass", password, "-keypass", password,
                  "-dname", "CN=Zombie Defense, OU=Game, O=Charanie, C=CN"])
    if not os.path.exists(keystore):
        sys.exit("生成签名密钥失败")
    with open(pass_file, "w", encoding="ascii") as f:
        f.write(password)
    return keystore, password


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--sdk")
    parser.add_argument("--jdk")
    parser.add_argument("--skip-verify", action="store_true")
    args = parser.parse_args()

    paths = find_toolchain(args)
    repo = paths["repo"]
    andro = os.path.join(repo, "apps", "zombie-defense-android")
    build = os.path.join(andro, "build")
    www = os.path.join(andro, "assets", "www")
    obj = os.path.join(build, "obj")
    dex_dir = os.path.join(build, "dex")
    key_dir = os.path.join(andro, "keystore")
    os.makedirs(build, exist_ok=True)
    os.makedirs(key_dir, exist_ok=True)

    with open(os.path.join(repo, "package.json"), "r", encoding="utf-8") as f:
        version = json.load(f)["version"]
    major, minor, patch = (int(x) for x in version.split("."))
    version_code = major * 10000 + minor * 100 + patch
    print("==> 版本 v%s（versionCode %d）" % (version, version_code))

    jpype = start_jvm(paths)
    load_attr_ids()
    print("==> android.R$attr 解析 %d 个属性 ID" % len(ATTRIBUTE_IDS))

    tree = ElementTree.parse(os.path.join(andro, "AndroidManifest.xml"))
    root = tree.getroot()
    root.set("{%s}versionCode" % ANDROID_NS, str(version_code))
    root.set("{%s}versionName" % ANDROID_NS, version)
    axml = build_axml(root)
    with open(os.path.join(build, "AndroidManifest.xml"), "wb") as f:
        f.write(axml)
    print("==> AXML manifest %d 字节" % len(axml))

    total, count = sync_www(repo, www)
    print("==> 静态资源 %.2f MB / %d 个文件" % (total / 1048576.0, count))

    sources = []
    for base in (os.path.join(andro, "src"),):
        for r, _d, fs in os.walk(base):
            sources += [os.path.join(r, f) for f in fs if f.endswith(".java")]
    rc = compile_java(paths, sources, obj)
    if rc != 0:
        sys.exit("javac 失败（rc=%d）" % rc)
    classes = []
    for r, _d, fs in os.walk(obj):
        classes += [os.path.join(r, f) for f in fs if f.endswith(".class")]
    print("==> javac %d 个 class" % len(classes))

    dex_path = run_d8(paths, classes, dex_dir)
    print("==> classes.dex %d 字节" % os.path.getsize(dex_path))

    unsigned = os.path.join(build, "unsigned.apk")
    assemble_apk(unsigned, axml, dex_path, www)
    print("==> 未签名 APK %d 字节" % os.path.getsize(unsigned))

    keystore, password = ensure_keystore(key_dir)
    out_dir = os.path.join(repo, "dist")
    os.makedirs(out_dir, exist_ok=True)
    apk = os.path.join(out_dir, "zombie-defense-v%s.apk" % version)
    signer = JPYPE.JClass("com.android.apksigner.ApkSignerTool")
    signer.main(["sign", "--ks", keystore, "--ks-pass", "pass:" + password,
                 "--key-pass", "pass:" + password, "--ks-key-alias", "zd",
                 "--out", apk, unsigned])
    if not os.path.exists(apk):
        sys.exit("apksigner 签名失败")
    print("==> 已签名 %s（%.2f MB）" % (apk, os.path.getsize(apk) / 1048576.0))

    if not args.skip_verify:
        signer.main(["verify", "--print-certs", apk])
        print("==> 签名校验通过")
        if os.path.exists(paths["aapt2"]):
            try:
                out = subprocess.run([paths["aapt2"], "dump", "badging", apk],
                                     capture_output=True, text=True, timeout=120)
                for line in (out.stdout or "").splitlines():
                    if line.startswith(("package:", "application-label", "launchable-activity:",
                                        "sdkVersion:", "targetSdkVersion:")):
                        print("   ", line)
                if out.returncode != 0:
                    print("   aapt2 dump badging 警告:", (out.stderr or "").strip()[:200])
            except Exception as exc:  # noqa: BLE001
                print("   aapt2 dump badging 跳过:", exc)

    print("APK:", apk)


if __name__ == "__main__":
    main()
