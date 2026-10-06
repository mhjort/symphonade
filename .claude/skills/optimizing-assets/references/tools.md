# Installing the shared compression tools

`optimize-glb.mjs` runs on two tools, installed once per machine into `~/.bitmagic/tools/` and
shared by every project on it:

- **`gltf/`:** glTF-Transform 4.5.0 with meshoptimizer 1.2.0 (simplify and meshopt), sharp 0.35.5
  (image resize and encode) and gltf-validator. About 62 MB.
- **`ktx/`:** Khronos KTX-Software 4.4.2 (`ktx create` and `ktx extract`), needed only for KTX2
  textures. About 6 MB.

The versions are pinned because the script relies on their defaults (what `prune`, `quantize` and
`weld` keep), which can change between releases. The script prints a warning when the installed
versions differ from these. `ab-compare.mjs` needs none of this for PNG captures.

Nothing is installed system-wide, nothing needs sudo or admin rights, and nothing is added to the
game's `package.json`. To remove the tools, delete the folder. Set `BM_TOOLS` to use another folder.

**Installing is a download. Ask the creator first,** and name what will be fetched (the npm
packages above, and one KTX-Software release file from github.com/KhronosGroup) and where it goes.
If they decline, stop here. `--meshopt=off` still needs the `gltf/` tools, so there is no
tool-free path.

## Check what is already there

```sh
ls ~/.bitmagic/tools/gltf/node_modules/@gltf-transform/core && echo gltf ok
~/.bitmagic/tools/ktx/bin/ktx --version
```

On Windows PowerShell:

```powershell
Test-Path "$env:USERPROFILE\.bitmagic\tools\gltf\node_modules\@gltf-transform\core"
& "$env:USERPROFILE\.bitmagic\tools\ktx\bin\ktx.exe" --version
```

Without `ktx/`, every preset that writes or reads KTX2 fails with a clear message. That covers
`distant-prop`, `hero-prop` and `character`, and any source that already carries KTX2 textures.
The `level` and `code-driven` presets, and `webp`, `jpeg` or `png` slot specs, work without it.

## glTF-Transform (macOS, Linux, Windows)

Node 20 or later is enough; the game already has it. Install exactly these versions:

```sh
npm install --prefix ~/.bitmagic/tools/gltf --save-exact @gltf-transform/cli@4.5.0 @gltf-transform/core@4.5.0 @gltf-transform/extensions@4.5.0 @gltf-transform/functions@4.5.0 meshoptimizer@1.2.0 sharp@0.35.5 gltf-validator@2.0.0-dev.3.10
```

On Windows PowerShell, the same packages with `--prefix "$env:USERPROFILE\.bitmagic\tools\gltf"`.
To move an existing install onto these versions, run the same command again.

## KTX-Software on macOS: unpack the signed package

Do not use Homebrew. On a Mac whose Xcode licence has not been accepted it fails with "You have not
agreed to the Xcode license", and accepting it needs sudo. Unpack Khronos' notarized installer
instead. Use `arm64` on Apple silicon and `x86_64` on Intel.

```sh
V=4.4.2; A=arm64; T=$(mktemp -d)
curl -L -o "$T/ktx.pkg" "https://github.com/KhronosGroup/KTX-Software/releases/download/v$V/KTX-Software-$V-Darwin-$A.pkg"
pkgutil --check-signature "$T/ktx.pkg"          # expect: Developer ID Installer: The Khronos Group, Inc.
pkgutil --expand-full "$T/ktx.pkg" "$T/x"
mkdir -p ~/.bitmagic/tools/ktx/bin ~/.bitmagic/tools/ktx/lib
cp "$T"/x/*-tools.pkg/Payload/usr/local/bin/* ~/.bitmagic/tools/ktx/bin/
cp -P "$T"/x/*-library.pkg/Payload/usr/local/lib/libktx* ~/.bitmagic/tools/ktx/lib/
rm -rf "$T"; ~/.bitmagic/tools/ktx/bin/ktx --version
```

The binaries look for `libktx` in `../lib`, so `bin/` and `lib/` must stay side by side.

## KTX-Software on Linux

```sh
V=4.4.2; A=x86_64; T=$(mktemp -d)                # or A=arm64
curl -L -o "$T/ktx.tar.bz2" "https://github.com/KhronosGroup/KTX-Software/releases/download/v$V/KTX-Software-$V-Linux-$A.tar.bz2"
tar -xjf "$T/ktx.tar.bz2" -C "$T"
mkdir -p ~/.bitmagic/tools/ktx
cp -a "$(dirname "$(find "$T" -type f -name ktx -path '*/bin/*' | head -1)")" ~/.bitmagic/tools/ktx/bin
cp -a "$(dirname "$(find "$T" -name 'libktx.so*' | head -1)")" ~/.bitmagic/tools/ktx/lib
rm -rf "$T"; ~/.bitmagic/tools/ktx/bin/ktx --version
```

If `ktx` cannot find `libktx.so`, run `export LD_LIBRARY_PATH=~/.bitmagic/tools/ktx/lib` in the
same shell as the script.

## KTX-Software on Windows

Download `KTX-Software-4.4.2-Windows-x64.exe` (or `-arm64.exe`) from the v4.4.2 release. Run it and
choose `%USERPROFILE%\.bitmagic\tools\ktx` as the destination. If it asks for administrator rights,
cancel and extract it instead with 7-Zip:
`7z x KTX-Software-4.4.2-Windows-x64.exe -o%USERPROFILE%\.bitmagic\tools\ktx`. Either way,
`%USERPROFILE%\.bitmagic\tools\ktx\bin\ktx.exe --version` must print 4.4.x.

## The skill's shell lines on Windows PowerShell

SKILL.md's commands are POSIX shell. In PowerShell:

```powershell
$O = ".agents/skills/optimizing-assets/scripts/optimize-glb.mjs"; node $O --audit src/work/world.json
$L = "engine/engine/loaders/GltfLoaderSupport.ts"; Test-Path $L
'setMeshoptDecoder', 'expectGltfLoaderSupport' | ForEach-Object { "$_ $((Select-String -Path $L -Pattern $_).Count)" }
(Select-String -Path engine/engine/GLBVoxelizer.ts -Pattern packedFloats).Count
Get-ChildItem -Recurse src -Include *.ts,*.js | Select-String -Pattern 'setMeshoptDecoder|meshoptDecoder' -List
Get-ChildItem -Recurse src -Include *.ts,*.js | Select-String -Pattern 'gltfLoaderSupportsKtx2|KHR_texture_basisu' -List
Get-FileHash in.glb -Algorithm SHA256
```

## Write the shared README

After installing, write `~/.bitmagic/tools/README.md`, so the next agent on this machine knows what
the folder is. If one exists that recommends running the plain `gltf-transform` commands
(`meshopt`, `etc1s`, `resize`) on game assets, replace it with this one: their defaults quantize
skinned and named meshes and encode normal maps as ETC1S.

```markdown
# Asset compression tools (shared, local)

Installed by an agent following the Bitmagic `optimizing-assets` skill, with the creator's OK.
Used by every project on this machine. Nothing is installed system-wide; delete this folder to
remove them.

- `gltf/`: glTF-Transform 4.5.0 (npm, versions pinned) with meshoptimizer 1.2.0, sharp 0.35.5 and
  gltf-validator.
- `ktx/`: KTX-Software 4.4.2 (Khronos), `bin/` and `lib/` side by side.

Use them through the skill's script, not the plain `gltf-transform` commands:
`node .agents/skills/optimizing-assets/scripts/optimize-glb.mjs --help` in a game project. It puts
`ktx/bin` on PATH itself.
```

The script's `--help` runs without the tools, so it is a safe first command on any machine.
