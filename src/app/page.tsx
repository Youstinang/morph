import { parseEnvironment } from "@/config/environment";
import { MorphClient } from "./morph-client";

export default function Home() {
  // Without a key on the server (the published demo), "Ask a question" is hidden rather than failing.
  const liveAi = Boolean(parseEnvironment(process.env).OPENAI_API_KEY);
  return <MorphClient variant={liveAi ? "full" : "demo"} />;
}
