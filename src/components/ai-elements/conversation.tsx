/**
 * AI Elements `Conversation` — scroll container that auto-sticks to bottom
 * while new content streams in, with an escape hatch button that appears
 * once the user scrolls up.
 *
 * Local implementation compatible with the API at
 * https://elements.ai-sdk.dev/r/conversation.json. Swap to the registry
 * drop when phase 5 retires the legacy chat.
 */

import { ArrowDown } from "lucide-react";
import {
	type ComponentProps,
	forwardRef,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ConversationContextValue = {
	registerViewport: (el: HTMLDivElement | null) => void;
};

const conversationEl = Symbol("conversation");
type InternalConversationRef = HTMLDivElement & {
	[conversationEl]?: ConversationContextValue;
};

export const Conversation = forwardRef<HTMLDivElement, ComponentProps<"div">>(
	({ className, children, ...props }, ref) => (
		<div
			ref={ref}
			className={cn(
				"relative flex min-h-0 flex-1 flex-col overflow-hidden",
				className,
			)}
			{...props}
		>
			{children}
		</div>
	),
);
Conversation.displayName = "Conversation";

export interface ConversationContentProps extends ComponentProps<"div"> {
	/** When true, auto-scroll to bottom as content streams. Default true. */
	stickToBottom?: boolean;
}

export const ConversationContent = forwardRef<
	HTMLDivElement,
	ConversationContentProps
>(({ className, children, stickToBottom = true, ...props }, ref) => {
	const localRef = useRef<HTMLDivElement | null>(null);
	const stuckRef = useRef(true);

	const mergedRef = useCallback(
		(node: HTMLDivElement | null) => {
			localRef.current = node;
			if (typeof ref === "function") ref(node);
			else if (ref) (ref as { current: HTMLDivElement | null }).current = node;
		},
		[ref],
	);

	useEffect(() => {
		const el = localRef.current;
		if (!el) return;
		const onScroll = () => {
			const threshold = 24;
			stuckRef.current =
				el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
		};
		el.addEventListener("scroll", onScroll, { passive: true });
		return () => el.removeEventListener("scroll", onScroll);
	}, []);

	useEffect(() => {
		if (!stickToBottom) return;
		const el = localRef.current;
		if (!el) return;
		const observer = new MutationObserver(() => {
			if (stuckRef.current) el.scrollTop = el.scrollHeight;
		});
		observer.observe(el, {
			childList: true,
			subtree: true,
			characterData: true,
		});
		return () => observer.disconnect();
	}, [stickToBottom]);

	return (
		<div
			ref={mergedRef}
			className={cn(
				"flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4",
				className,
			)}
			data-slot="conversation-content"
			{...props}
		>
			{children}
		</div>
	);
});
ConversationContent.displayName = "ConversationContent";

export interface ConversationScrollButtonProps
	extends ComponentProps<typeof Button> {
	/** The ConversationContent element to scroll; queried via data-slot when omitted. */
	targetRef?: React.RefObject<HTMLDivElement>;
}

export const ConversationScrollButton = ({
	className,
	targetRef,
	...props
}: ConversationScrollButtonProps) => {
	const [visible, setVisible] = useState(false);

	useEffect(() => {
		const el =
			targetRef?.current ??
			document.querySelector<HTMLDivElement>(
				"[data-slot='conversation-content']",
			);
		if (!el) return;
		const update = () => {
			const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
			setVisible(distance > 120);
		};
		update();
		el.addEventListener("scroll", update, { passive: true });
		const resize = new ResizeObserver(update);
		resize.observe(el);
		return () => {
			el.removeEventListener("scroll", update);
			resize.disconnect();
		};
	}, [targetRef]);

	const onClick = () => {
		const el =
			targetRef?.current ??
			document.querySelector<HTMLDivElement>(
				"[data-slot='conversation-content']",
			);
		if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
	};

	if (!visible) return null;
	return (
		<Button
			type="button"
			size="sm"
			variant="secondary"
			onClick={onClick}
			className={cn(
				"absolute bottom-2 left-1/2 z-10 -translate-x-1/2 rounded-full shadow-sm",
				className,
			)}
			{...props}
		>
			<ArrowDown className="h-3.5 w-3.5" />
		</Button>
	);
};
ConversationScrollButton.displayName = "ConversationScrollButton";

/* Marker export so tree-shaking keeps the symbol alive if imported nakedly. */
export type { InternalConversationRef };
