import { parseEnvironment } from "@/config/environment";
import { MorphClient } from "./morph-client";

export default function Home() {
  // Opens ready for the visitor's own question. Without a key on the server, live AI can't run, so the
  // demo plays instead and "Ask a question" is hidden rather than failing.
  const liveAi = Boolean(parseEnvironment(process.env).OPENAI_API_KEY);
  return liveAi ? <MorphClient variant="full" waiting /> : <MorphClient variant="demo" />;
}
