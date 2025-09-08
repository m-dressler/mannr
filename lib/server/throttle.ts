type ThrottleMeta = {
  /** The total number of attempts in the {@link THROTTLE_WINDOW} */
  attempts: number;
  /** The epoch timestamp of the last attempt **in seconds** */
  lastAttempt: number;
};

/** Prefix for throttling keys */
const KV_PREFIX = "ip_throttle";
/** Seconds the user has to wait after each login until they can retry */
const THROTTLE_LIMITS = [0, 0, 1, 2, 4, 8, 16, 30, 60, 180, 300] as const;
/** The amount of seconds until an IP's throttling data is deleted */
const THROTTLE_WINDOW = 3600;

const toSeconds = (milliseconds: number) => Math.floor(milliseconds / 1000);

/** Checks if IP is throttled for login attempts */
export const isIPThrottled = async (
  ip: string,
  kv: KVNamespace,
): Promise<
  { throttled: false } | { throttled: true; retryAfter: number }
> => {
  const key = `${KV_PREFIX}:${ip}`;
  const data = await kv.get<ThrottleMeta>(key, "json");

  if (!data) return { throttled: false };

  /** The time in seconds since  */
  const timeSinceLastAttempt = toSeconds(Date.now()) -
    data.lastAttempt;

  /** The amount of seconds the IP has to wait until retrying for this attempt */
  const throttleDuration =
    THROTTLE_LIMITS[Math.min(data.attempts, THROTTLE_LIMITS.length - 1)];

  if (timeSinceLastAttempt < throttleDuration) {
    return {
      throttled: true,
      retryAfter: throttleDuration - timeSinceLastAttempt,
    };
  } else return { throttled: false };
};

/** Records a login attempt for IP throttling */
export const recordLoginAttempt = async (
  ip: string,
  success: boolean,
  kv: KVNamespace,
): Promise<void> => {
  const key = `${KV_PREFIX}:${ip}`;

  // Clear throttle on successful login
  if (success) return await kv.delete(key);

  const data = await kv.get<ThrottleMeta>(key, "json");
  const newData: ThrottleMeta = {
    attempts: (data?.attempts ?? 0) + 1,
    lastAttempt: toSeconds(Date.now()),
  };
  // Store for the full window duration
  await kv.put(key, JSON.stringify(newData), {
    expirationTtl: THROTTLE_WINDOW,
  });
};
