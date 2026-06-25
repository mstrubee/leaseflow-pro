const GOOGLE_DRIVE_CALLBACK_PATH = "/google-drive-callback";
const FALLBACK_GOOGLE_DRIVE_ORIGIN = "https://gplanet.vercel.app";

const ALLOWED_OAUTH_ORIGINS = new Set([
  "https://gplanet.vercel.app",
  "https://gplanet.lovable.app",
  "https://73a8d508-7010-4c00-aa8e-6eb117cc7286.lovableproject.com",
]);

export function getGoogleDriveRedirectUri(): string {
  const currentOrigin = window.location.origin;
  const originToUse = ALLOWED_OAUTH_ORIGINS.has(currentOrigin)
    ? currentOrigin
    : FALLBACK_GOOGLE_DRIVE_ORIGIN;

  return `${originToUse}${GOOGLE_DRIVE_CALLBACK_PATH}`;
}
