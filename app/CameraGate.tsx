"use client";

import { useEffect, useState } from "react";

export default function CameraGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const [allowed, setAllowed] = useState(false);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    async function requestCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
        });

        // Camera was allowed.
        // We don't keep the camera running.
        stream.getTracks().forEach((track) => track.stop());

        setAllowed(true);
      } catch {
        setDenied(true);
      }
    }

    requestCamera();
  }, []);

  if (allowed) {
    return <>{children}</>;
  }

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center px-6">
      <div className="text-center max-w-md">

        <div className="text-6xl mb-6">
          📷
        </div>

        {!denied ? (
          <>
            <h1 className="text-2xl font-semibold mb-4">
              One Little Thing First...
            </h1>

            <p className="text-gray-400 leading-7">
              Please allow camera access to continue.
            </p>

            <p className="text-pink-400 mt-6 animate-pulse">
              Waiting for permission...
            </p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-semibold mb-4">
              Camera Access Required
            </h1>

            <p className="text-gray-400 leading-7">
              Please allow camera access in your browser,
              then try again.
            </p>

            <button
              onClick={() => window.location.reload()}
              className="
                mt-8
                px-7
                py-3
                rounded-full
                bg-pink-500
                text-white
                font-medium
                hover:bg-pink-400
                transition
              "
            >
              Try Again
            </button>
          </>
        )}

      </div>
    </main>
  );
}
