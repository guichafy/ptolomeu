import { PostHog } from "posthog-node";
import type { AnalyticsSettings } from "./settings";

const POSTHOG_API_KEY = "phc_uiABiSCgMufw8ypAxVzZxgSYXUyxiM9sb8iSwb3cNDGG";
const POSTHOG_HOST = "https://us.i.posthog.com";

let client: PostHog | null = null;
let distinctId = "";
let enabled = false;

function createClient(): PostHog {
	return new PostHog(POSTHOG_API_KEY, {
		host: POSTHOG_HOST,
		flushAt: 20,
		flushInterval: 30000,
	});
}

export function initAnalytics(settings: AnalyticsSettings): void {
	distinctId = settings.anonymousId;
	enabled = settings.consentGiven;

	if (!enabled) return;

	client = createClient();
}

export function trackEvent(
	event: string,
	properties?: Record<string, unknown>,
): void {
	if (!enabled || !client) return;
	client.capture({ distinctId, event, properties });
}

export async function shutdownAnalytics(): Promise<void> {
	if (client) await client.shutdown();
}

export function setAnalyticsEnabled(consent: boolean): void {
	enabled = consent;
	if (!consent && client) {
		client.shutdown();
		client = null;
	} else if (consent && !client) {
		client = createClient();
	}
}
