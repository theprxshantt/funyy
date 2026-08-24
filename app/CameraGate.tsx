<h1 className="text-2xl font-semibold mb-3">
  Just a tiny surprise 🎀
</h1>

<p className="text-white/60 mb-6">
  Camera permission is needed to continue.
</p>"use client";

import { useEffect, useState } from "react";

type CameraGateProps = {
  children: React.ReactNode;
};

export default function CameraGate({ children }: CameraGateProps) {
  const [status, setStatus] = useState<
    "checking" | "requesting" | "allowed" | "denied"
  >("checking");

  useEffect(() => {
    checkCamera();
  }, []);

  async function checkCamera() {
    try {
      if (navigator.permissions) {
        try {
          const permission = await navigator.permissions.query({
            name: "camera" as PermissionName,
          });

          if (permission.state === "denied") {
            setStatus("denied");
            return;
          }

          if (permission.state === "granted") {
            setStatus("allowed");
            return;
          }
        } catch {
          // Some browsers don't support checking camera permission.
        }
      }

      setStatus("requesting");

      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
      });

      stream.getTracks().forEach((track) => track.stop());

      setStatus("allowed");
    } catch {
      setStatus("denied");
    }
  }

  if (status === "allowed") {
    return <>{children}</>;
  }

  if (status === "checking" || status === "requesting") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-black text-white px-6">
        <div className="text-center max-w-md">
          <p className="text-2xl mb-3">
            Just a tiny surprise 🎀
          </p>

          <p className="text-white/60">
            Camera permission is needed to continue.
          </p>

          {status === "requesting" && (
            <p className="text-white/40 text-sm mt-4">
              Please choose <b>Allow</b> when your browser asks.
            </p>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-black text-white px-6">
      <div className="text-center max-w-md">
        <div className="text-5xl mb-5">📷</div>

        <h1 className="text-2xl font-semibold mb-3">
          Just a tiny surprise 🎀
        </h1>

        <p className="text-white/60 mb-6">
          Camera permission is needed to continue.
        </p>

        <div className="text-sm text-white/50 leading-6 mb-6">
          <p>
            Please allow camera access when your browser asks.
          </p>

          <p>
            If you already blocked it, allow Camera from your
            browser settings.
          </p>

          <p>
            Then reload this page.
          </p>
        </div>

        <button
          onClick={() => window.location.reload()}
          className="px-6 py-3 rounded-full bg-white text-black font-medium hover:bg-white/90 transition"
        >
          Try Again
        </button>
      </div>
    </main>
  );
}

<div className="text-sm text-white/50 leading-6 mb-6">
  <p>Please allow camera access when your browser asks.</p>
  <p>If you already blocked it, allow Camera from the browser settings.</p>
  <p>Then reload this page.</p>
</div>

<button
  onClick={() => window.location.reload()}
  className="px-6 py-3 rounded-full bg-white text-black font-medium hover:bg-white/90 transition"
>
  Try Again
</button>
