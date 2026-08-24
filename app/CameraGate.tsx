"use client";

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
      // Check whether the browser already knows the permission state
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
          // Some browsers don't support camera permission queries.
        }
      }

      // Ask for camera permission
      setStatus("requesting");

      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
      });

      // We only need permission, so stop the camera immediately.
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
          <p className="text-2xl mb-3">Just a tiny surprise 🎀</p>
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
          Camera access is needed
        </h1>

        <p className="text-white/60 mb-6">
          Please allow camera access in your browser to open this surprise.
        </p>

        <div className="text-sm text-white/50 leading-6 mb-6">
          <p>1. Click the camera or lock icon near the website address.</p>
          <p>2. Set Camera to <b className="text-white">Allow</b>.</p>
          <p>3. Reload this page.</p>
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
