import { type Project } from "@echo-feedback/contracts";

export function allowsOrigin(project: Project, origin?: string) {
  if (
    project.allowExtensionClients &&
    (!origin ||
      origin === "null" ||
      /^chrome-extension:\/\/[a-p]{32}$/.test(origin) ||
      /^moz-extension:\/\/[a-f0-9-]+$/i.test(origin))
  ) {
    return true;
  }

  if (!origin) {
    return false;
  }

  try {
    const url = new URL(origin);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      url.origin === origin &&
      (!project.allowedOrigins.length || project.allowedOrigins.includes(origin))
    );
  } catch {
    return false;
  }
}
