//! Windows 11 原生 Acrylic 背景
//!
//! `SetWindowCompositionAttribute` 及其 `ACCENT_POLICY` / `WINCOMPATTRDATA` 都是未公开接口，
//! `windows` crate 0.62 的元数据里没有这些符号（已确认 `Win32_UI_WindowsAndMessaging` 下查不到），
//! 因此按社区逆向定义在本模块自行声明结构体布局与 user32 的 FFI 导入。

use std::ffi::c_void;
use napi_derive::napi;
use windows::Win32::Foundation::HWND;

use crate::take_valid_hwnd;

/// 属性标识：设置窗口的 accent 策略
const WCA_ACCENT_POLICY: u32 = 19;

/// 撤销 accent。社区定义里 0 才是 DISABLED，2 是 TRANSPARENTGRADIENT（关掉仍会残留一层半透明渐变）
const ACCENT_DISABLED: i32 = 0;

/// Windows 11 的 Acrylic（系统模糊 + 染色）
const ACCENT_ENABLE_ACRYLICBLURBEHIND: i32 = 4;

/// 0x40 绘制普通边框 + 0x80 用染色色绘制活动边框。两个边框位都要置上，
/// 缺位时调用会成功但 accent 不参与合成，屏幕上看不到任何效果
const ACCENT_FLAGS_DRAW_BORDERS: i32 = 0x40 | 0x80;

/// 两个结构体的字段都只由系统经指针读取，Rust 侧没有读点，会被 dead_code 误报
#[allow(dead_code)]
#[repr(C)]
struct AccentPolicy {
    accent_state: i32,
    accent_flags: i32,
    /// 0xAABBGGRR（accent 接口收 BGRA，alpha 在最高字节）
    accent_color: u32,
    /// 公开逆向定义里第 4 个 DWORD 多被称作 AnimationId，社区也普遍拿它传模糊半径；
    /// Win11 实际不按它控制模糊量，可见强度由 `accent_color` 的 alpha 承担
    accent_blur_radius: i32,
}

#[allow(dead_code)]
#[repr(C)]
struct WindowCompositionAttributeData {
    attribute: u32,
    data: *const c_void,
    size_of_data: usize,
}

/// `SetWindowCompositionAttribute` 是 user32 的未公开导出，不在 user32.lib 的导入表里，
/// 普通 link 会找 `__imp_` 前缀符号而报 LNK2019，故用 raw-dylib 直接按 DLL 导出表链接
#[link(name = "user32", kind = "raw-dylib")]
unsafe extern "system" {
    /// 返回值是 Win32 `BOOL`，windows 0.62 未导出该符号，按同宽度的 i32 接收
    fn SetWindowCompositionAttribute(
        hwnd: HWND,
        data: *const WindowCompositionAttributeData,
    ) -> i32;
}

/// 给窗口应用或清除原生 Acrylic 背景：`radius = 0` 走 DISABLED 分支，是唯一关闭路径
///
/// `hwnd` 为 Electron BrowserWindow 的 native handle，`tint` 是 JS 侧换算好的 0xAABBGGRR。
/// 仅在 Windows 11 调用（Win10 没有这套合成后端），门控在 JS 侧按任务栏策略判定
#[napi]
pub fn set_acrylic(hwnd: i64, radius: u32, tint: u32) -> napi::Result<()> {
    let Some(hwnd) = take_valid_hwnd(hwnd as usize) else {
        return Err(napi::Error::from_reason("无效 HWND，无法设置 Acrylic 背景"));
    };

    let policy = if radius == 0 {
        AccentPolicy {
            accent_state: ACCENT_DISABLED,
            accent_flags: 0,
            accent_color: 0,
            accent_blur_radius: 0,
        }
    } else {
        AccentPolicy {
            accent_state: ACCENT_ENABLE_ACRYLICBLURBEHIND,
            accent_flags: ACCENT_FLAGS_DRAW_BORDERS,
            accent_color: tint,
            accent_blur_radius: radius as i32,
        }
    };

    let data = WindowCompositionAttributeData {
        attribute: WCA_ACCENT_POLICY,
        data: std::ptr::from_ref(&policy).cast(),
        size_of_data: size_of::<AccentPolicy>(),
    };

    // SAFETY: hwnd 已过 IsWindow 校验；policy 与 data 在这次调用内都存活；
    // 两个结构体按未公开接口的字段顺序与 DWORD 宽度声明，dword 对齐下布局与系统定义一致
    let applied = unsafe { SetWindowCompositionAttribute(hwnd, &raw const data) };

    if applied != 0 {
        Ok(())
    } else {
        Err(napi::Error::from_reason(
            "SetWindowCompositionAttribute 调用失败",
        ))
    }
}
