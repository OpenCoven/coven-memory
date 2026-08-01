type LaunchUrlOptions = {
  originHost: string;
  port: number;
  environment: string | undefined;
  issueLaunchToken: () => string;
};

export function createLaunchUrl({
  originHost,
  port,
  environment,
  issueLaunchToken
}: LaunchUrlOptions): string {
  const baseUrl = `http://${originHost}:${port}/`;
  return environment === "development"
    ? baseUrl
    : `${baseUrl}#launch=${issueLaunchToken()}`;
}
