import { SetMetadata } from "@nestjs/common";
import { RATE_LIMIT_KEY, RateLimitConfig } from "../guards/rate-limit.guard";

export const RateLimit = (config: RateLimitConfig) => SetMetadata(RATE_LIMIT_KEY, config);
