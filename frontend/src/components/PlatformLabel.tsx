import type { Platform } from "../types";
import { platformNames } from "../format";

const platformLogos: Record<Platform, string> = {
  meta: "/platforms/meta.png",
  google: "/platforms/google.png",
  linkedin: "/platforms/linkedin.png",
};

export function PlatformLabel({ platform }: { platform: Platform }) {
  return (
    <span className={`platform-label platform-${platform}`}>
      <img
        className="platform-logo"
        src={platformLogos[platform]}
        alt=""
        aria-hidden="true"
      />
      {platformNames[platform]}
    </span>
  );
}
