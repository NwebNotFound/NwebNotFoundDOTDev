// Tap an SSE stream: pass the bytes through to the browser and hand every parsed JSON `data:`
// payload to `onFrame` (used to record the run into the transcript).

/** A frame larger than this is dropped from the tap; parsing resyncs at the next boundary. */
export const MAX_FRAME_BUFFER = 1024 * 1024;

/** Parse one SSE frame (no trailing blank line, `\n` line endings) and report its JSON payload. */
function emitFrame(frame, onFrame) {
  const data = [];
  for (const line of frame.split("\n")) {
    if (!line.startsWith("data:")) continue;
    // Per the SSE spec a single leading space after the colon is not part of the value, and
    // consecutive data lines of one event are joined with "\n".
    data.push(line.slice(5).replace(/^ /, ""));
  }
  if (!data.length) return;
  const payload = data.join("\n").trim();
  if (!payload) return;
  let parsed;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return; // keep-alive or non-JSON frame
  }
  try {
    onFrame(parsed);
  } catch {
    // a failing recorder must not break the stream
  }
}

export function teeSseFrames(body, onFrame, drain, { maxBuffer = MAX_FRAME_BUFFER } = {}) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  // True while the tap is skipping an oversized frame until the next frame boundary.
  let skipping = false;
  // A lone "\r" at the end of a chunk may be the first half of a "\r\n" split across chunks.
  let pendingCr = false;

  const feed = (text) => {
    if (pendingCr) {
      text = "\r" + text;
      pendingCr = false;
    }
    if (text.endsWith("\r")) {
      pendingCr = true;
      text = text.slice(0, -1);
    }
    buffer += text.replace(/\r\n?/g, "\n");
    let idx;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      if (skipping) skipping = false;
      else emitFrame(frame, onFrame);
    }
    if (buffer.length > maxBuffer) {
      // Keep at most one trailing "\n" so a boundary split across chunks is still found.
      buffer = buffer.endsWith("\n") ? "\n" : "";
      skipping = true;
    }
  };

  return new ReadableStream({
    async start(controller) {
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          controller.enqueue(value);
          feed(decoder.decode(value, { stream: true }));
        }
        // Flush the decoder and parse a final frame that had no blank line after it.
        feed(decoder.decode());
        if (pendingCr) feed("\n");
        if (buffer && !skipping) emitFrame(buffer.replace(/\n+$/, ""), onFrame);
        buffer = "";
      } catch {
        // upstream died mid-stream
      } finally {
        if (typeof drain === "function") await Promise.resolve(drain()).catch(() => {});
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
    cancel() {
      reader.cancel().catch(() => {});
    },
  });
}
