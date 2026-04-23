/**
 * FIFO queue of pending tool-permission prompts. Rendered above the composer
 * while sessionState is `requires_action`. Each card shows the tool call, the
 * risk level, and the four user actions — Permitir, Permitir modificado,
 * Sempre permitir nesta sessão, Negar.
 */

import { useState } from "react";
import {
	Confirmation,
	ConfirmationAction,
	ConfirmationActions,
	ConfirmationBody,
	ConfirmationHeader,
	type ConfirmationRisk,
} from "@/components/ai-elements/confirmation";
import type { ApproveBehavior } from "@/shared/agent-protocol";
import type { PendingPermission } from "../../hooks/agent-state";

function formatArgs(args: unknown): string {
	if (args === null || args === undefined) return "";
	try {
		return JSON.stringify(args, null, 2);
	} catch {
		return String(args);
	}
}

function riskFromHint(hint?: string): ConfirmationRisk {
	// The backend emits a `decisionReason` that hints at the risk level via the
	// wording from the risk classifier. Without a structured risk field (phase
	// 5 backfill) we fall back to "caution" for anything ambiguous.
	if (!hint) return "caution";
	const lower = hint.toLowerCase();
	if (
		lower.includes("rm") ||
		lower.includes("sudo") ||
		lower.includes("destruct") ||
		lower.includes("mcp") ||
		lower.includes("fork bomb")
	) {
		return "dangerous";
	}
	return "caution";
}

export interface ConfirmationQueueProps {
	pending: PendingPermission[];
	onApprove: (
		permissionId: string,
		behavior: ApproveBehavior,
		modifiedArgs?: unknown,
	) => void | Promise<void>;
	onReject: (permissionId: string, reason?: string) => void | Promise<void>;
}

export function ConfirmationQueue({
	pending,
	onApprove,
	onReject,
}: ConfirmationQueueProps) {
	if (pending.length === 0) return null;
	return (
		<div className="flex flex-col gap-2">
			{pending.map((permission) => (
				<ConfirmationCard
					key={permission.permissionId}
					permission={permission}
					onApprove={onApprove}
					onReject={onReject}
				/>
			))}
		</div>
	);
}

function ConfirmationCard({
	permission,
	onApprove,
	onReject,
}: {
	permission: PendingPermission;
	onApprove: ConfirmationQueueProps["onApprove"];
	onReject: ConfirmationQueueProps["onReject"];
}) {
	const [busy, setBusy] = useState(false);
	const risk = riskFromHint(permission.decisionReason);

	const wrap =
		(fn: () => Promise<void> | void) =>
		async (e?: { preventDefault(): void }) => {
			e?.preventDefault();
			if (busy) return;
			setBusy(true);
			try {
				await fn();
			} finally {
				setBusy(false);
			}
		};

	const description =
		permission.decisionReason ??
		"O agente quer executar esta ferramenta. Aprove para continuar.";

	return (
		<Confirmation risk={risk}>
			<ConfirmationHeader
				title={permission.toolName}
				description={description}
			/>
			<ConfirmationBody>{formatArgs(permission.args)}</ConfirmationBody>
			{permission.blockedPath && (
				<p className="text-[10.5px] text-destructive">
					Caminho bloqueado: {permission.blockedPath}
				</p>
			)}
			<ConfirmationActions>
				<ConfirmationAction
					variant="default"
					onClick={wrap(() => onApprove(permission.permissionId, "allow"))}
					disabled={busy}
				>
					Permitir
				</ConfirmationAction>
				{risk !== "dangerous" && (
					<ConfirmationAction
						variant="secondary"
						onClick={wrap(() =>
							onApprove(permission.permissionId, "always-allow-this-session"),
						)}
						disabled={busy}
					>
						Sempre nesta sessão
					</ConfirmationAction>
				)}
				<ConfirmationAction
					variant="destructive"
					onClick={wrap(() =>
						onReject(permission.permissionId, "Usuário negou"),
					)}
					disabled={busy}
				>
					Negar
				</ConfirmationAction>
			</ConfirmationActions>
		</Confirmation>
	);
}
