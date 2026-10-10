---
title: Download
---

# Download Ops Music

The list below fetches the latest release for the selected channel from GitHub and recommends a package for your system. Stable is selected by default. If GitHub is slow, choose a download mirror.

<DownloadPage />

## Release channels

| Channel    | Intended audience       | Releases received           | Example         |
| ---------- | ----------------------- | --------------------------- | --------------- |
| **Stable** | Everyday use            | Stable                      | `1.2.0`         |
| **Beta**   | Early feature access    | Beta, then Stable           | `1.3.0-beta.1`  |
| **Alpha**  | Development and testing | Alpha, then Beta and Stable | `1.4.0-alpha.1` |

The channel only selects which kind of Release this page lists. The application has **no update checking and no auto-updater** (removed as part of this project's scope cut); download new versions from this page manually.

## Other sources

- **Previous versions:** Browse all archived builds on [GitHub Releases](https://github.com/xiaoxu1642/ops-music/releases).
- **Development builds:** Download the latest workflow artifact from [GitHub Actions](https://github.com/xiaoxu1642/ops-music/actions). A GitHub account is required.

## Installation notes

- **Windows:** Only the single-file portable build is provided (no installer). It does not check for or install updates on its own.
- **macOS:** If macOS reports that the app is damaged or cannot verify it, see [macOS reports a damaged app](/en/troubleshooting/macos-damaged).
- **Linux:** Choose AppImage if you are unsure which package format your distribution uses. See [Ubuntu sandbox startup failure](/en/troubleshooting/ubuntu-sandbox) for launch errors.

### Linux package formats

| Format   | Distributions                                    |
| -------- | ------------------------------------------------ |
| AppImage | Distribution-independent; no installation needed |
| deb      | Debian, Ubuntu, Linux Mint                       |
| rpm      | Fedora, RHEL, openSUSE                           |
| pacman   | Arch Linux, Manjaro, EndeavourOS                 |
| tar.gz   | Generic archive for manual extraction            |

```bash
# AppImage
chmod +x ./ops-music-*.AppImage
./ops-music-*.AppImage
./ops-music-*.AppImage --appimage-extract

# deb
sudo apt install ./ops-music-*.deb

# rpm
sudo dnf install ./ops-music-*.rpm
sudo zypper install ./ops-music-*.rpm

# pacman
sudo pacman -U ./ops-music-*.pacman

# Archive
tar -xzf ./ops-music-*.tar.gz
cd ops-music-*/
./OpsMusic
```
