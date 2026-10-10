# Debug Mode and Error Diagnosis

## Developer Tools

Press `F12` to open or close **Developer Tools**.

| Panel           | Purpose                           |
| --------------- | --------------------------------- |
| **Console**     | Logs, errors, and stack traces    |
| **Network**     | Network requests and status codes |
| **Application** | Local storage and cached data     |

## Log files

The easiest route is **Settings → About → Open log directory**.

| System  | Path                                                     |
| ------- | -------------------------------------------------------- |
| Windows | `%APPDATA%\Ops Music\app-data\logs\`                     |
| macOS   | `~/Library/Application Support/Ops Music/app-data/logs/` |
| Linux   | `~/.config/Ops Music/app-data/logs/`                     |

Native module logs are in `app-data/logs/native/`.

## Common checks

- **No playback, stuttering, or silence:** Check Console errors, the source URL, and the selected output device.
- **Cover or lyrics fail:** Inspect failed Network requests and verify that the source is reachable.
- **Broken UI or blank window:** Inspect the Console, clear `app-data/cache/`, and restart.

## Filing an issue

Include the operating system and version, Ops Music version or commit, complete error output, and reproducible steps. For Linux, also include the desktop environment, distribution, package format or third-party build script, and review [Wayland compatibility](/en/troubleshooting/wayland).

## Resetting the app

::: warning Data loss
Resetting deletes all local user data, including accounts, playlists, settings, and the local library index.
:::

```bat
:: Windows
rd /s /q "%APPDATA%\Ops Music"
```

```bash
# macOS
rm -rf ~/Library/Application\ Support/Ops\ Music

# Linux
rm -rf "${XDG_CONFIG_HOME:-$HOME/.config}/Ops Music"
```
