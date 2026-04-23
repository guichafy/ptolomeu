/**
 * AI Elements `Confirmation` — modal-free inline prompt asking the user to
 * approve or reject a tool invocation before it runs. API mirrors
 * https://elements.ai-sdk.dev/r/confirmation.json. Composable so callers
 * can slot in their own action buttons.
 */

import { AlertTriangle, Shield, ShieldAlert } from "lucide-react";
import { type ComponentProps, forwardRef } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ConfirmationRisk = "safe" | "caution" | "dangerous";

export interface ConfirmationProps extends ComponentProps<"div"> {
	risk?: ConfirmationRisk;
}

const RISK_TOKENS: Record<
	ConfirmationRisk,
	{ border: string; bg: string; icon: React.ReactNode }
> = {
	safe: {
		border: "border-emerald-500/30",
		bg: "bg-emerald-500/5",
		icon: <Shield className="h-4 w-4 text-emerald-500" />,
	},
	caution: {
		border: "border-amber-500/40",
		bg: "bg-amber-500/5",
		icon: <ShieldAlert className="h-4 w-4 text-amber-500" />,
	},
	dangerous: {
		border: "border-destructive/50",
		bg: "bg-destructive/5",
		icon: <AlertTriangle className="h-4 w-4 text-destructive" />,
	},
};

export const Confirmation = forwardRef<HTMLDivElement, ConfirmationProps>(
	({ risk = "caution", className, children, ...props }, ref) => {
		const tokens = RISK_TOKENS[risk];
		return (
			<div
				ref={ref}
				data-slot="confirmation"
				data-risk={risk}
				className={cn(
					"flex flex-col gap-3 rounded-lg border p-3 text-xs",
					tokens.border,
					tokens.bg,
					className,
				)}
				{...props}
			>
				<div className="flex items-center gap-2 font-medium">
					{tokens.icon}
					<span className="flex-1">{children}</span>
				</div>
			</div>
		);
	},
);
Confirmation.displayName = "Confirmation";

export interface ConfirmationHeaderProps extends ComponentProps<"div"> {
	title: string;
	description?: string;
}

export const ConfirmationHeader = forwardRef<
	HTMLDivElement,
	ConfirmationHeaderProps
>(({ title, description, className, ...props }, ref) => (
	<div ref={ref} className={cn("flex flex-col gap-1", className)} {...props}>
		<h4 className="font-mono text-[11px] font-semibold">{title}</h4>
		{description && (
			<p className="text-[11px] text-muted-foreground">{description}</p>
		)}
	</div>
));
ConfirmationHeader.displayName = "ConfirmationHeader";

export interface ConfirmationBodyProps extends ComponentProps<"div"> {}

export const ConfirmationBody = forwardRef<
	HTMLDivElement,
	ConfirmationBodyProps
>(({ className, children, ...props }, ref) => (
	<div
		ref={ref}
		className={cn(
			"rounded-md border border-border/60 bg-background/60 p-2 font-mono text-[10.5px] leading-relaxed whitespace-pre-wrap",
			className,
		)}
		{...props}
	>
		{children}
	</div>
));
ConfirmationBody.displayName = "ConfirmationBody";

export interface ConfirmationActionsProps extends ComponentProps<"div"> {}

export const ConfirmationActions = forwardRef<
	HTMLDivElement,
	ConfirmationActionsProps
>(({ className, children, ...props }, ref) => (
	<div
		ref={ref}
		className={cn("flex flex-wrap items-center gap-1.5", className)}
		{...props}
	>
		{children}
	</div>
));
ConfirmationActions.displayName = "ConfirmationActions";

// Convenience button that matches shadcn variants for the most common actions.
export interface ConfirmationActionProps
	extends ComponentProps<typeof Button> {}

export const ConfirmationAction = forwardRef<
	HTMLButtonElement,
	ConfirmationActionProps
>(({ className, ...props }, ref) => (
	<Button
		ref={ref}
		size="sm"
		className={cn("h-7 text-xs", className)}
		{...props}
	/>
));
ConfirmationAction.displayName = "ConfirmationAction";
