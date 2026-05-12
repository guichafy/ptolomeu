import { useEffect, useRef } from "react";
import { onWindowShown } from "../providers/rpc";

/**
 * Fire `callback` whenever the palette window becomes visible. The
 * authoritative signal is the bun-side `windowShown` push, dispatched from
 * the native windowDidBecomeKey: delegate after the WKWebView is
 * firstResponder. `window.focus` on the document is kept as a fallback for
 * the rare case where the webview is suspended by WebKit (after the chat
 * window has been shown) and the RPC push is dropped — the DOM event still
 * fires when the suspended view resumes.
 *
 * Consumers must keep `callback` idempotent: both signals can fire on the
 * same show within a few milliseconds of each other.
 */
export function useWindowShown(callback: () => void): void {
	const callbackRef = useRef(callback);
	callbackRef.current = callback;

	useEffect(() => {
		const fire = () => callbackRef.current();
		const onFocus = () => {
			if (document.hidden) return;
			fire();
		};
		const unsubscribeRpc = onWindowShown(fire);
		window.addEventListener("focus", onFocus);
		return () => {
			unsubscribeRpc();
			window.removeEventListener("focus", onFocus);
		};
	}, []);
}
