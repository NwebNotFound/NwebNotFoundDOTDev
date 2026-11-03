export function teeSseFrames(body, onFrame, drain) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  return new ReadableStream({
    async start(controller) {
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          controller.enqueue(value);
          buffer += decoder.decode(value, { stream: true });
          let idx;
          while ((idx = buffer.indexOf("\n\n")) >= 0) {
            const frame = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            for (const line of frame.split("\n")) {
              if (!line.startsWith("data:")) continue;
              const payload = line.slice(5).trim();
              if (!payload) continue;
              try {
                onFrame(JSON.parse(payload));
              } catch {
                // keep-alive or non-JSON frame
              }
            }
          }
        }
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
