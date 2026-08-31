export function isLocalMode() {
  return process.env.NESTED_LOCAL_MODE === "1";
}

export const localModeEnabledInBrowser =
  process.env.NEXT_PUBLIC_NESTED_LOCAL_MODE === "1";
