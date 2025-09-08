import Mux from "@mux/mux-node";

// Initialize Mux client
const mux = new Mux({
  tokenId: process.env.MUX_TOKEN_ID!,
  tokenSecret: process.env.MUX_TOKEN_SECRET!,
});

// Export Video API
export const Video = mux.video;

type AssetCreateFullParams = Parameters<typeof Video.assets.create>[0];
type MuxVideoSettings = Omit<AssetCreateFullParams, "inputs">;

// Mux Webhook verification
export const verifyMuxWebhook = (body: string, signature: string): boolean => {
  try {
    const webhookSecret = process.env.MUX_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error("MUX_WEBHOOK_SECRET not configured");
      return false;
    }

    const crypto = require("crypto");
    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(body, "utf8")
      .digest("hex");

    return crypto.timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(expectedSignature, "hex")
    );
  } catch (error) {
    console.error("Error verifying Mux webhook:", error);
    return false;
  }
};

export const muxVideoSettings: MuxVideoSettings = {
  playback_policy: ["public"] as ("public" | "signed")[],
  encoding_tier: "smart",
  normalize_audio: true,
  mp4_support: "standard",
  master_access: "temporary",
  test: false,
};
