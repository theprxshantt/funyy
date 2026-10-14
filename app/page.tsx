"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  FaceLandmarker,
  FilesetResolver,
} from "@mediapipe/tasks-vision";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { supabase } from "../lib/supabase";

type Reaction = {
  src: string;
  text: string;
};

const reactions: Reaction[] = [
  { src: "/gifs/01_confused_left.png", text: "hmm..." },
  {
    src: "/gifs/02_side_look_right.png",
    text: "why are u looking over there 👀",
  },
  { src: "/gifs/03_blink_eyes_closed.png", text: "..." },
  {
    src: "/gifs/04_looking_at_screen.png",
    text: "oh. u saw that.",
  },
  {
    src: "/gifs/05_looking_away.png",
    text: "nope. definitely nothing here.",
  },
  {
    src: "/gifs/06_random_movement.png",
    text: "WHY ARE U MOVING LIKE THAT 😭",
  },
  {
    src: "/gifs/07_angry_clicking.png",
    text: "stop clicking everything 😭",
  },
  {
    src: "/gifs/08_happy_reveal_near.png",
    text: "okay okay...",
  },
  {
    src: "/gifs/09_celebration_final.png",
    text: "okayyy… U win 😭",
  },
];

const messages = [
  "Hmm...",
  "U weren't supposed to find this yet 👀",
  "Nope. Not here.",
  "why are u still clicking 😭",
  "okay wait...",
  "there is literally nothing here.",
  "fine. maybe one tiny secret.",
  "okayyy… U win 😭",
];

function detectDirection(landmarks: any[]) {
  const leftEye = landmarks[33];
  const rightEye = landmarks[263];
  const nose = landmarks[1];

  if (!leftEye || !rightEye || !nose) {
    return "unknown";
  }

  const eyeCenter = (leftEye.x + rightEye.x) / 2;
  const offset = nose.x - eyeCenter;

  const leftOpen = Math.abs(
    (landmarks[159]?.y ?? 0) -
      (landmarks[145]?.y ?? 0)
  );

  const rightOpen = Math.abs(
    (landmarks[386]?.y ?? 0) -
      (landmarks[374]?.y ?? 0)
  );

  if (leftOpen < 0.012 && rightOpen < 0.012) {
    return "blink";
  }

  if (offset < -0.035) return "left";
  if (offset > 0.035) return "right";

  return "center";
}

export default function Home() {
  const videoRef = useRef<HTMLVideoElement>(null);

  const streamRef = useRef<MediaStream | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);

  const chunksRef = useRef<Blob[]>([]);

  const landmarkerRef = useRef<FaceLandmarker | null>(null);

  const lastVideoTimeRef = useRef(-1);

  const faceTimerRef = useRef<number | null>(null);

  const uploadStartedRef = useRef(false);

  const finalizationPromiseRef =
    useRef<Promise<void> | null>(null);

  const resolveFinalizationRef =
    useRef<(() => void) | null>(null);

  const recordingStartedAtRef =
    useRef<number | null>(null);

  const [cameraState, setCameraState] = useState<
    | "idle"
    | "starting"
    | "recording"
    | "stopping"
    | "denied"
    | "error"
  >("idle");

  const [consentChecked, setConsentChecked] =
    useState(false);

  const [reactionIndex, setReactionIndex] = useState(0);

  const [messageIndex, setMessageIndex] = useState(0);

  const [clicks, setClicks] = useState(0);

  const [showReveal, setShowReveal] = useState(false);

  const [saving, setSaving] = useState(false);

  const [uploadStatus, setUploadStatus] = useState("");

  // Upload the finalized recording to Supabase.
  const uploadRecording = useCallback(
    async (blob: Blob) => {
      if (uploadStartedRef.current) return;

      uploadStartedRef.current = true;

      const durationMs = recordingStartedAtRef.current
        ? Date.now() - recordingStartedAtRef.current
        : 0;

      console.info("Recording finalized", {
        bytes: blob.size,
        chunks: chunksRef.current.length,
        durationMs,
        mimeType: blob.type,
      });

      if (blob.size === 0) {
        setUploadStatus(
          "No video data was captured. Please try recording again."
        );

        uploadStartedRef.current = false;
        return;
      }

      setSaving(true);

      setUploadStatus(
        "Uploading recording… please wait before leaving this page."
      );

      try {
        const uniqueId =
          typeof crypto !== "undefined" &&
          "randomUUID" in crypto
            ? crypto.randomUUID()
            : Math.random().toString(36).slice(2);

        const fileName =
          `recording-${Date.now()}-${uniqueId}.webm`;

        const { error } = await supabase.storage
          .from("recordings")
          .upload(fileName, blob, {
            contentType: blob.type || "video/webm",
            upsert: false,
          });

        if (error) {
          console.error("Supabase upload error:", error);

          setUploadStatus(
            `Upload failed: ${error.message}`
          );

          uploadStartedRef.current = false;
          return;
        }

        if (blob.size < 10_000 && durationMs > 10_000) {
          setUploadStatus(
            `Upload completed, but only ${blob.size} bytes were captured over ${Math.round(
              durationMs / 1000
            )} seconds. The recording may be incomplete; check browser permissions and console logs.`
          );
        } else {
          setUploadStatus(
            `Upload complete (${Math.round(
              blob.size / 1024
            )} KB).`
          );
        }
      } catch (error) {
        console.error("Recording upload error:", error);

        setUploadStatus(
          "Upload failed. Check the browser console and try again."
        );

        uploadStartedRef.current = false;
      } finally {
        setSaving(false);
      }
    },
    []
  );

  // Stop recording and wait for finalization/upload.
  const stopAndSaveRecording = useCallback(async () => {
    const recorder = recorderRef.current;

    if (!recorder) return;

    const finalizationPromise =
      finalizationPromiseRef.current;

    if (recorder.state !== "inactive") {
      setCameraState("stopping");

      try {
        recorder.stop();
      } catch (error) {
        console.error("Could not stop recorder:", error);
      }
    }

    // Wait for the final data and upload to finish.
    if (finalizationPromise) {
      await finalizationPromise;
    }
  }, []);

  // Start only after the visitor explicitly opts in.
  const startCamera = useCallback(async () => {
    if (!consentChecked) {
      setUploadStatus(
        "Please confirm consent before starting the camera and recording."
      );
      return;
    }

    if (
      streamRef.current ||
      recorderRef.current?.state === "recording"
    ) {
      return;
    }

    setCameraState("starting");
    setUploadStatus("");

    let stream: MediaStream | null = null;

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: true,
      });

      streamRef.current = stream;

      if (!videoRef.current) {
        throw new Error(
          "Camera preview is not mounted."
        );
      }

      videoRef.current.srcObject = stream;

      await videoRef.current.play();

      const mimeType = [
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm",
      ].find((candidate) =>
        MediaRecorder.isTypeSupported(candidate)
      );

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      const recordedMimeType =
        recorder.mimeType || mimeType || "video/webm";

      chunksRef.current = [];

      uploadStartedRef.current = false;

      recordingStartedAtRef.current = Date.now();

      finalizationPromiseRef.current =
        new Promise<void>((resolve) => {
          resolveFinalizationRef.current = resolve;
        });

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onerror = (event) => {
        console.error("MediaRecorder error:", event);

        setUploadStatus(
          "A recording error occurred. Stop and save to check what was captured."
        );
      };

      recorder.onstop = async () => {
        try {
          // The final dataavailable event is delivered before stop.
          const blob = new Blob(chunksRef.current, {
            type: recordedMimeType,
          });

          await uploadRecording(blob);
        } catch (error) {
          console.error(
            "Could not finalize recording:",
            error
          );

          setUploadStatus(
            "Could not finalize the recording. Check the browser console."
          );
        } finally {
          stream?.getTracks().forEach((track) => {
            track.stop();
          });

          if (streamRef.current === stream) {
            streamRef.current = null;
          }

          if (videoRef.current?.srcObject === stream) {
            videoRef.current.srcObject = null;
          }

          setCameraState("idle");

          const resolve =
            resolveFinalizationRef.current;

          resolveFinalizationRef.current = null;

          finalizationPromiseRef.current = null;

          resolve?.();
        }
      };

      recorderRef.current = recorder;

      recorder.start(1000);

      setCameraState("recording");

      setUploadStatus(
        "Recording is active. Press Stop & Save and wait for upload confirmation."
      );
    } catch (error) {
      console.error(
        "Camera/recording start error:",
        error
      );

      stream?.getTracks().forEach((track) => {
        track.stop();
      });

      streamRef.current = null;

      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }

      const resolve = resolveFinalizationRef.current;

      resolveFinalizationRef.current = null;

      finalizationPromiseRef.current = null;

      resolve?.();

      const denied =
        error instanceof DOMException &&
        (
          error.name === "NotAllowedError" ||
          error.name === "PermissionDeniedError"
        );

      setCameraState(denied ? "denied" : "error");

      setUploadStatus(
        denied
          ? "Camera or microphone permission was denied. Allow permission and try again."
          : "Could not start recording. Check camera/microphone access and the browser console."
      );
    }
  }, [consentChecked, uploadRecording]);

  // Initialize facial reactions.
  const initFaceTracking = useCallback(async () => {
    try {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
      );

      const landmarker =
        await FaceLandmarker.createFromOptions(
          vision,
          {
            baseOptions: {
              modelAssetPath:
                "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
            },
            runningMode: "VIDEO",
            numFaces: 1,
            minFaceDetectionConfidence: 0.5,
            minFacePresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
          }
        );

      landmarkerRef.current = landmarker;
    } catch (error) {
      console.error(
        "Face tracking could not start:",
        error
      );
    }
  }, []);

  useEffect(() => {
    void initFaceTracking();

    return () => {
      if (faceTimerRef.current !== null) {
        cancelAnimationFrame(faceTimerRef.current);
      }

      const recorder = recorderRef.current;

      if (recorder && recorder.state !== "inactive") {
        // Best effort only. A page closing can interrupt uploads.
        try {
          recorder.stop();
        } catch (error) {
          console.error(
            "Could not stop recorder during cleanup:",
            error
          );
        }
      } else {
        streamRef.current?.getTracks().forEach((track) => {
          track.stop();
        });
      }

      landmarkerRef.current?.close();
    };
  }, [initFaceTracking]);

  // Analyze the visible preview for facial reactions.
  useEffect(() => {
    const trackFace = () => {
      const video = videoRef.current;
      const landmarker = landmarkerRef.current;

      if (
        video &&
        landmarker &&
        video.readyState >= 2 &&
        video.currentTime !== lastVideoTimeRef.current
      ) {
        lastVideoTimeRef.current = video.currentTime;

        try {
          const result = landmarker.detectForVideo(
            video,
            performance.now()
          );

          if (result.faceLandmarks?.[0]) {
            const direction = detectDirection(
              result.faceLandmarks[0]
            );

            const reactionMap: Record<string, number> = {
              left: 0,
              right: 1,
              blink: 2,
              center: 3,
            };

            if (direction in reactionMap) {
              setReactionIndex(reactionMap[direction]);
            } else if (Math.random() < 0.025) {
              setReactionIndex(5);
            }
          }
        } catch {
          // Ignore occasional face-tracking errors.
        }
      }

      faceTimerRef.current =
        requestAnimationFrame(trackFace);
    };

    faceTimerRef.current =
      requestAnimationFrame(trackFace);

    return () => {
      if (faceTimerRef.current !== null) {
        cancelAnimationFrame(faceTimerRef.current);
      }
    };
  }, []);

  // Warn before leaving during a recording or upload.
  useEffect(() => {
    const warnBeforeLeaving = (
      event: BeforeUnloadEvent
    ) => {
      if (
        cameraState === "starting" ||
        cameraState === "recording" ||
        cameraState === "stopping" ||
        saving
      ) {
        event.preventDefault();
        event.returnValue = "";
      }
    };

    window.addEventListener(
      "beforeunload",
      warnBeforeLeaving
    );

    return () => {
      window.removeEventListener(
        "beforeunload",
        warnBeforeLeaving
      );
    };
  }, [cameraState, saving]);

  function tease() {
    setClicks((value) => {
      const next = value + 1;

      setMessageIndex(
        Math.min(next, messages.length - 1)
      );

      if (next >= 7) {
        setReactionIndex(7);
      } else {
        setReactionIndex(Math.min(next, 6));
      }

      return next;
    });
  }

  async function openGift() {
    setShowReveal(true);

    // If recording is active, finalize and wait for upload.
    await stopAndSaveRecording();

    window.setTimeout(() => {
      window.location.href =
        "https://don-t-open-tan.vercel.app";
    }, 1100);
  }

  const progress = Math.min(
    (clicks / 7) * 100,
    100
  );

  return (
    <main className="app">
      <div className="desktop-dots" />

      <div className="desktop">
        <motion.div
          className="main-window"
          initial={{
            opacity: 0,
            scale: 0.96,
            y: 15,
          }}
          animate={{
            opacity: 1,
            scale: 1,
            y: 0,
          }}
          transition={{
            duration: 0.55,
          }}
        >
          <div className="titlebar">
            <div className="titlebar-left">
              <div className="window-icon">🎀</div>

              <div className="window-title">
                MADE JUST FOR U
              </div>
            </div>

            <div className="status">
              {cameraState === "recording" && (
                <>
                  <span className="rec-dot" />
                  REC
                </>
              )}
            </div>

            <div className="window-controls">
              <div className="window-control">_</div>
              <div className="window-control">□</div>
              <div className="window-control">×</div>
            </div>
          </div>

          <div className="content">
            {/* EXPLICIT RECORDING CONSENT */}

            <section
              aria-label="Optional camera and microphone recording"
              style={{
                marginBottom: "16px",
                padding: "14px",
                border: "1px solid rgba(255,255,255,0.25)",
                borderRadius: "10px",
                background: "rgba(0,0,0,0.12)",
                textAlign: "left",
              }}
            >
              <strong>
                Optional camera &amp; microphone recording
              </strong>

              <p
                style={{
                  margin: "8px 0",
                  lineHeight: 1.45,
                }}
              >
                This page records video and audio and uploads
                the recording to this site's Supabase storage
                bucket named{" "}
                <code>recordings</code>. Nothing starts until
                you give permission below and press Start.
                Storage access depends on the project's
                Supabase bucket policies. Press Stop &amp; Save
                and wait for the upload result before leaving.
              </p>

              <label
                style={{
                  display: "flex",
                  gap: "8px",
                  alignItems: "flex-start",
                  margin: "10px 0",
                }}
              >
                <input
                  type="checkbox"
                  checked={consentChecked}
                  onChange={(event) =>
                    setConsentChecked(event.target.checked)
                  }
                  disabled={
                    cameraState === "starting" ||
                    cameraState === "recording" ||
                    cameraState === "stopping" ||
                    saving
                  }
                  style={{ marginTop: "4px" }}
                />

                <span>
                  I understand that the camera and microphone
                  will be recorded and the resulting file
                  uploaded.
                </span>
              </label>

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "8px",
                  marginBottom: "10px",
                }}
              >
                <button
                  type="button"
                  className="retro-button"
                  onClick={() => void startCamera()}
                  disabled={
                    !consentChecked ||
                    cameraState === "starting" ||
                    cameraState === "recording" ||
                    cameraState === "stopping" ||
                    saving
                  }
                >
                  {cameraState === "starting"
                    ? "STARTING…"
                    : "START CAMERA + RECORDING"}
                </button>

                <button
                  type="button"
                  className="retro-button danger"
                  onClick={() => void stopAndSaveRecording()}
                  disabled={cameraState !== "recording"}
                >
                  STOP &amp; SAVE
                </button>
              </div>

              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                aria-label="Live camera preview"
                style={{
                  display: "block",
                  width: "min(100%, 360px)",
                  aspectRatio: "4 / 3",
                  objectFit: "cover",
                  background: "#161616",
                  borderRadius: "8px",
                  border:
                    "1px solid rgba(255,255,255,0.25)",
                }}
              />

              <p
                role="status"
                aria-live="polite"
                style={{
                  margin: "8px 0 0",
                  lineHeight: 1.4,
                }}
              >
                {cameraState === "recording"
                  ? "🔴 RECORDING — camera and microphone are active. Press STOP & SAVE when finished."
                  : cameraState === "starting"
                    ? "Requesting camera and microphone access…"
                    : cameraState === "stopping" || saving
                      ? "Finalizing/uploading. Keep this page open until it finishes…"
                      : cameraState === "denied" ||
                          cameraState === "error"
                        ? uploadStatus
                        : uploadStatus ||
                          "Camera is off. Recording has not started."}
              </p>
            </section>

            {/* TOP DESKTOP AREA */}

            <div className="desktop-widgets">
              <div className="desktop-icon">
                <div className="pixel-icon">📁</div>
                <span>Files</span>
              </div>

              <div className="desktop-icon">
                <div className="pixel-icon">💾</div>
                <span>Save</span>
              </div>

              <div className="desktop-icon">
                <div className="pixel-icon">📧</div>
                <span>Mail</span>
              </div>

              <div className="desktop-icon">
                <div className="pixel-icon">🗑</div>
                <span>Trash</span>
              </div>

              <div className="mini-window files-window">
                <div className="mini-titlebar">
                  📁 MY STUFF
                </div>

                <div className="mini-body file-list">
                  <div>▣ definitely_not_a_secret.txt</div>
                  <div>▣ cat.exe</div>
                  <div>▣ birthday????</div>
                  <div>▣ do_not_open.zip</div>
                </div>
              </div>

              <div className="mini-window status-window">
                <div className="mini-titlebar">
                  SYSTEM STATUS
                </div>

                <div className="mini-body system-status">
                  <div>
                    mood:
                    <span>suspicious</span>
                  </div>

                  <div>
                    cat:
                    <span>watching</span>
                  </div>

                  <div>
                    secrets:
                    <span>99%</span>
                  </div>

                  <div>
                    birthday:
                    <span>█████░</span>
                  </div>
                </div>
              </div>

              <div className="sticky-note">
                <div className="note-pin">•</div>

                <strong>NOTE TO SELF:</strong>

                <p>
                  she will click
                  everything.
                </p>
              </div>

              <div className="fake-clock">
                <div>ONLINE ●</div>
                <strong>11:48 PM</strong>
              </div>
            </div>

            {/* MAIN INTERACTIVE AREA */}

            <div className="hero">
              <section className="sub-window reaction-window">
                <div className="sub-titlebar">
                  CHOOSE A CAT???
                </div>

                <div className="reaction-stage">
                  <AnimatePresence mode="wait">
                    <motion.img
                      key={reactionIndex}
                      src={reactions[reactionIndex].src}
                      alt="pixel cat reaction"
                      className="cat-image"
                      initial={{
                        opacity: 0,
                        scale: 0.92,
                      }}
                      animate={{
                        opacity: 1,
                        scale: 1,
                      }}
                      exit={{
                        opacity: 0,
                        scale: 1.04,
                      }}
                      transition={{
                        duration: 0.2,
                      }}
                    />
                  </AnimatePresence>
                </div>

                <motion.div
                  className="message"
                  key={messageIndex}
                  initial={{
                    opacity: 0,
                    y: 4,
                  }}
                  animate={{
                    opacity: 1,
                    y: 0,
                  }}
                >
                  {messages[messageIndex]}
                </motion.div>
              </section>
            </div>

            {/* BUTTONS */}

            <div className="controls">
              <motion.button
                className="retro-button danger"
                whileTap={{
                  scale: 0.95,
                }}
                onClick={tease}
              >
                DON'T CLICK
              </motion.button>

              {clicks >= 3 && clicks < 7 && (
                <motion.button
                  className="retro-button"
                  initial={{
                    opacity: 0,
                    scale: 0.8,
                  }}
                  animate={{
                    opacity: 1,
                    scale: 1,
                  }}
                  onClick={tease}
                >
                  definitely not this one
                </motion.button>
              )}

              {clicks >= 7 && (
                <motion.button
                  className="retro-button"
                  initial={{
                    opacity: 0,
                    y: 8,
                  }}
                  animate={{
                    opacity: 1,
                    y: 0,
                  }}
                  onClick={openGift}
                >
                  🎁 OPEN THIS
                </motion.button>
              )}
            </div>

            {/* SECRET FILE */}

            <div className="locked">
              <h2>🔒 SECRET FILE</h2>

              <p>
                {clicks < 2
                  ? "ACCESS DENIED."
                  : clicks < 5
                    ? "why are u trying so hard 😭"
                    : clicks < 7
                      ? "okay fine... almost."
                      : "ACCESS GRANTED (?)"}
              </p>
            </div>

            <div
              className="progress"
              aria-label="prank progress"
            >
              <div
                style={{
                  width: `${progress}%`,
                }}
              />
            </div>

            <div className="hint">
              {clicks < 7
                ? `something is definitely hiding here... ${clicks}/7`
                : "uh oh. u actually found it."}
            </div>

            {saving && (
              <div className="hint">
                uploading recording...
              </div>
            )}

            {!saving && uploadStatus && (
              <div className="hint">
                {uploadStatus}
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* FINAL TRANSITION */}

      <AnimatePresence>
        {showReveal && (
          <motion.div
            className="reveal-overlay"
            initial={{
              opacity: 0,
            }}
            animate={{
              opacity: 1,
            }}
            exit={{
              opacity: 0,
            }}
          >
            <motion.div
              className="reveal-card"
              initial={{
                scale: 0.85,
                opacity: 0,
              }}
              animate={{
                scale: 1,
                opacity: 1,
              }}
              transition={{
                duration: 0.45,
              }}
            >
              <div className="sub-titlebar">
                ONE LAST THING 🎀
              </div>

              <div className="reveal-body">
                <motion.h1
                  initial={{
                    y: 12,
                    opacity: 0,
                  }}
                  animate={{
                    y: 0,
                    opacity: 1,
                  }}
                >
                  okayyy… U win 😭
                </motion.h1>

                <motion.p
                  initial={{
                    y: 12,
                    opacity: 0,
                  }}
                  animate={{
                    y: 0,
                    opacity: 1,
                  }}
                  transition={{
                    delay: 0.12,
                  }}
                >
                  one last thing 🎀
                </motion.p>

                <motion.div
                  initial={{
                    scaleX: 0,
                  }}
                  animate={{
                    scaleX: 1,
                  }}
                  transition={{
                    duration: 0.75,
                  }}
                  className="progress"
                >
                  <div
                    style={{
                      width: "100%",
                    }}
                  />
                </motion.div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
