// ═══════════════════════════════════════════════════════════
// Haven Desktop — Windows WASAPI Per-Process Audio Capture
//
// Uses the Windows 10 2004+ (build 19041) Process Loopback API
// to capture audio exclusively from a single process tree.
//
// Key API:
//   ActivateAudioInterfaceAsync()
//     + AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK
//     + PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE
//
// This is the same mechanism Discord uses for per-app audio.
// ═══════════════════════════════════════════════════════════
#pragma once
#ifdef PLATFORM_WINDOWS

#include "../audio_capture.h"
#include <windows.h>
#include <thread>
#include <atomic>
#include <mutex>

namespace haven {

class WasapiCapture : public IAudioCapture {
public:
    WasapiCapture();
    ~WasapiCapture() override;

    bool                  IsSupported()          const override;
    std::vector<AudioApp> GetAudioApplications()       override;
    bool                  StartCapture(uint32_t pid,
                                       CaptureMode mode,
                                       AudioDataCb dataCb,
                                       CaptureStatusCb statusCb) override;
    void                  StopCapture()                override;
    void                  Cleanup()                    override;

private:
    void captureLoop();
    void emitStatus(CaptureStatusKind kind, const std::string& msg, int64_t code = 0);

    std::atomic<bool> m_running{false};
    std::thread       m_thread;
    AudioDataCb       m_callback;
    CaptureStatusCb   m_statusCallback;
    uint32_t          m_targetPid = 0;
    CaptureMode       m_mode = CaptureMode::IncludeProcess;
    std::mutex        m_mutex;

    // Set by StartCapture before the thread starts; the thread signals
    // m_initEvent once activation either succeeds or hard-fails so the
    // caller can return synchronously with an accurate result.
    void*             m_initEvent = nullptr; // HANDLE
    std::atomic<bool> m_initOk{false};
};

} // namespace haven

#endif // PLATFORM_WINDOWS
