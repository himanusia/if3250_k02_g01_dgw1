import { defineNitroConfig } from "nitro/config";

export default defineNitroConfig({
  output: {
    dir: "../../.vercel/output",
  },
  rollupConfig: {
    external: ["onnxruntime-node"],
  },
});
