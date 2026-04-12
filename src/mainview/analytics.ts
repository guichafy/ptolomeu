import posthog from "posthog-js/dist/module.full.no-external";

const POSTHOG_API_KEY = "phc_uiABiSCgMufw8ypAxVzZxgSYXUyxiM9sb8iSwb3cNDGG";
const POSTHOG_HOST = "https://us.i.posthog.com";

let initialized = false;

export function initRendererAnalytics(anonymousId: string): void {
	if (initialized) return;

	posthog.init(POSTHOG_API_KEY, {
		api_host: POSTHOG_HOST,
		person_profiles: "identified_only",
		capture_pageview: false,
		capture_pageleave: false,
		persistence: "memory",
		autocapture: true,
		mask_all_text: true,
		mask_all_element_attributes: true,
		bootstrap: { distinctID: anonymousId },
		disable_session_recording: true,
	});

	initialized = true;
}

export function shutdownRendererAnalytics(): void {
	if (!initialized) return;
	posthog.opt_out_capturing();
	initialized = false;
}

export { posthog };
