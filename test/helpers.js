import { createApp } from "../server/app.js";

// Startet die App auf einem freien Port, führt fn(baseUrl) aus und stoppt sie wieder
export async function withServer(opts, fn) {
  const server = createApp(opts).listen(0);
  await new Promise((r) => server.once("listening", r));
  try {
    await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((r) => server.close(r));
  }
}
