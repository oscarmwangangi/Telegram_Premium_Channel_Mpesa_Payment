import axios from "axios";
import { env } from "@/config/env";
import { exchangeRateRepository } from "@/repositories/exchange-rate.repository";
import { logger } from "@/lib/logger";
import { ExternalServiceError } from "@/lib/errors";

/**
 * Returns the current USD -> KES rate, using a cached DB snapshot when it's
 * still fresh (within EXCHANGE_RATE_CACHE_TTL_MINUTES). Falls back to the
 * last known snapshot (however old) if the live API call fails, rather than
 * blocking checkout entirely — a stale rate is far better than no checkout.
 */
export async function getUsdToKesRate(): Promise<{ rate: number; source: string; isFresh: boolean }> {
  const cached = await exchangeRateRepository.latest("USD", "KES");
  const ttlMs = env.EXCHANGE_RATE_CACHE_TTL_MINUTES * 60 * 1000;

  if (cached && Date.now() - cached.fetchedAt.getTime() < ttlMs) {
    return { rate: Number(cached.rate), source: cached.source, isFresh: true };
  }

  try {
    const { data } = await axios.get(env.EXCHANGE_RATE_API_URL, { timeout: 5000 });
    const rate: number | undefined = data?.rates?.KES;

    if (!rate || rate <= 0) {
      throw new Error("Exchange rate API returned no usable KES rate");
    }

    await exchangeRateRepository.save({
      baseCurrency: "USD",
      targetCurrency: "KES",
      rate,
      source: env.EXCHANGE_RATE_API_URL,
    });

    return { rate, source: env.EXCHANGE_RATE_API_URL, isFresh: true };
  } catch (err) {
    logger.warn({ err }, "Live exchange rate fetch failed");

    if (cached) {
      logger.warn(
        { fetchedAt: cached.fetchedAt },
        "Falling back to stale cached exchange rate"
      );
      return { rate: Number(cached.rate), source: `${cached.source} (stale)`, isFresh: false };
    }

    throw new ExternalServiceError(
      "ExchangeRateAPI",
      "Unable to fetch exchange rate and no cached rate is available"
    );
  }
}

export async function convertUsdToKes(amountUsd: number): Promise<{ amountKes: number; rate: number }> {
  const { rate } = await getUsdToKesRate();
  return { amountKes: Math.round(amountUsd * rate), rate };
}
